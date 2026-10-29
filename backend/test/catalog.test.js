import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

const NOW = new Date('2026-10-28T10:30:00+03:00');
const config = {
  allowedOrigins: [],
  auth: { jwtSecret: 'x'.repeat(40), tokenTtlSeconds: 60, bcryptCost: 4, cookieSecure: false, rateLimit: { windowMs: 60000, max: 100 } },
};

const DOCTOR_ROW = {
  doctor_id: 5, first_name: 'محمد', last_name: 'ميداني', birth_date: '1994-11-15', years_of_experience: 6,
  image_url: '/images/doctors/doctor-05.png', specialty_id: 2, specialty_name: 'أمراض القلب', appointment_duration: 30,
};

// قاعدة وهمية للقراءة فقط: أي كتابة أو معاملة أو دالة تنفيذ تغييرات معلّقة تُسقط الاختبار
function makeDb({ doctors = [DOCTOR_ROW], context = { appointment_duration: 30, block_from: null }, booked = [] } = {}) {
  const calls = [];
  return {
    calls,
    withTransaction: async () => {
      throw new Error('public GET endpoints must not open transactions');
    },
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE|execute_due_pending_change|execute_next_pending_change/i);
      if (/FROM public\.specialties s\s+LEFT JOIN/.test(sql)) {
        return { rows: [{ specialty_id: 2, specialty_name: 'أمراض القلب', appointment_duration: 30, doctors_count: 3 }] };
      }
      if (/block_from/.test(sql)) return { rows: context ? [context] : [] };
      if (/FROM public\.appointments/.test(sql)) return { rows: booked };
      if (/WHERE \(\$1::int IS NULL/.test(sql)) {
        return { rows: params[0] === null || params[0] === 2 ? doctors : [] };
      }
      if (/WHERE d\.doctor_id = \$1/.test(sql)) return { rows: params[0] === 5 ? doctors : [] };
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

const appFor = (db) => createApp({ db, config, clock: () => NOW });

test('GET /api/specialties returns the frontend contract without authentication', async () => {
  const db = makeDb();
  const res = await request(appFor(db)).get('/api/specialties');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, [{ id: 2, name: 'أمراض القلب', appointmentDuration: 30, doctorsCount: 3 }]);
  assert.match(db.calls[0].sql, /u\.is_active/); // العدّ للأطباء المفعّلين فقط
});

test('GET /api/doctors returns public doctors only: exact keys, active filter, no private data', async () => {
  const db = makeDb();
  const res = await request(appFor(db)).get('/api/doctors');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, [{
    id: 5, fullName: 'د. محمد ميداني', age: 31, yearsOfExperience: 6, imageUrl: '/images/doctors/doctor-05.png',
    specialtyId: 2, specialtyName: 'أمراض القلب', appointmentDuration: 30,
  }]);
  const { sql, params } = db.calls[0];
  assert.match(sql, /u\.is_active/);
  assert.doesNotMatch(sql, /phone|email|password|biography|user_id,/i);
  assert.deepEqual(params, [null]);
});

test('GET /api/doctors?specialtyId= filters, returns [] for an unknown id, and 400 for malformed ones', async () => {
  const db = makeDb();
  const app = appFor(db);
  assert.equal((await request(app).get('/api/doctors?specialtyId=2')).body.length, 1);
  assert.deepEqual(db.calls.at(-1).params, [2]);
  const unknown = await request(app).get('/api/doctors?specialtyId=999');
  assert.equal(unknown.status, 200);
  assert.deepEqual(unknown.body, []);

  const before = db.calls.length;
  for (const bad of ['abc', '0', '-1', '1.5', '', '99999999999', '1&specialtyId=2']) {
    const res = await request(app).get(`/api/doctors?specialtyId=${bad}`);
    assert.equal(res.status, 400, bad);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.fields.specialtyId);
  }
  assert.equal(db.calls.length, before, 'no query for malformed input');
});

test('GET /api/doctors/:id returns the doctor, and 404 for malformed, unknown or inactive ids', async () => {
  const db = makeDb();
  const app = appFor(db);
  const ok = await request(app).get('/api/doctors/5');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.fullName, 'د. محمد ميداني');
  assert.equal(ok.body.birthDate, undefined);
  assert.equal(ok.body.phone, undefined);

  const before = db.calls.length;
  for (const bad of ['abc', '0', '-3', '1e3', '2.5', '99999999999']) {
    const res = await request(app).get(`/api/doctors/${bad}`);
    assert.equal(res.status, 404, bad);
    assert.equal(res.body.error.code, 'DOCTOR_NOT_FOUND');
  }
  assert.equal(db.calls.length, before, 'no query for malformed ids');
  assert.equal((await request(app).get('/api/doctors/6')).status, 404); // غير موجود أو غير مفعّل (SQL يستبعد غير المفعّل)
});

test('GET /api/doctors/:id adds the optional biography (null when absent); the list never includes it', async () => {
  const withBio = makeDb({ doctors: [{ ...DOCTOR_ROW, biography: 'نبذة <b>تعريفية</b>\nسطر ثانٍ' }] });
  const app = appFor(withBio);
  const detail = await request(app).get('/api/doctors/5');
  assert.equal(detail.status, 200);
  assert.equal(detail.body.biography, 'نبذة <b>تعريفية</b>\nسطر ثانٍ'); // نص عادي كما خُزِّن
  assert.match(withBio.calls.at(-1).sql, /d\.biography/);

  const absent = await request(appFor(makeDb())).get('/api/doctors/5');
  assert.equal(absent.body.biography, null);

  const list = await request(app).get('/api/doctors');
  assert.ok(!('biography' in list.body[0]));
  assert.doesNotMatch(withBio.calls.at(-1).sql, /biography/);
});

test('GET /api/doctors/:id/availability returns the contract, uses booked-only rows, and is no-store', async () => {
  const db = makeDb({ booked: [{ appointment_date: '2026-10-29', appointment_time: '09:00:00' }] });
  const res = await request(appFor(db)).get('/api/doctors/5/availability');
  assert.equal(res.status, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.deepEqual(Object.keys(res.body), ['doctorId', 'timeZone', 'slotDuration', 'bookingRestrictedFrom', 'days']);
  assert.equal(res.body.doctorId, 5);
  assert.equal(res.body.slotDuration, 30);
  assert.equal(res.body.days.length, 14);
  assert.deepEqual(res.body.days.find((d) => d.date === '2026-10-29').slots.slice(0, 2).map((s) => s.booked), [true, false]);
  assert.equal(res.body.days.find((d) => d.date === '2026-10-30').closed, true);

  const bookedQuery = db.calls.find((c) => /FROM public\.appointments/.test(c.sql));
  assert.match(bookedQuery.sql, /status = 'booked'/); // الملغاة لا تحجب
  assert.doesNotMatch(bookedQuery.sql, /patient/i);
  assert.deepEqual(bookedQuery.params, [5, '2026-10-28', '2026-11-10']);
});

test('availability omits dates from a pending change and reports bookingRestrictedFrom', async () => {
  const db = makeDb({ context: { appointment_duration: 20, block_from: '2026-11-03' } });
  const res = await request(appFor(db)).get('/api/doctors/5/availability');
  assert.equal(res.status, 200);
  assert.equal(res.body.slotDuration, 20);
  assert.equal(res.body.bookingRestrictedFrom, '2026-11-03');
  assert.equal(res.body.days.at(-1).date, '2026-11-02');
});

test('availability returns 404 for an unknown or inactive doctor without querying bookings', async () => {
  const db = makeDb({ context: null });
  const res = await request(appFor(db)).get('/api/doctors/5/availability');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'DOCTOR_NOT_FOUND');
  assert.ok(db.calls.every((c) => !/FROM public\.appointments/.test(c.sql)));
  assert.equal((await request(appFor(db)).get('/api/doctors/abc/availability')).status, 404);
});
