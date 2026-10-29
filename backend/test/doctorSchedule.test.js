import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { COOKIE_NAME, signToken } from '../src/auth/tokens.js';

// الأربعاء 2026-10-28 الساعة 10:30 بتوقيت دمشق؛ الجمعة 2026-10-30؛ أسبوعها من السبت 2026-10-24
const NOW = new Date('2026-10-28T10:30:00+03:00');
const config = {
  allowedOrigins: [],
  auth: { jwtSecret: 'x'.repeat(40), tokenTtlSeconds: 3600, bcryptCost: 4, cookieSecure: false, rateLimit: { windowMs: 60000, max: 1000 } },
};
const USERS = {
  1: { user_id: 1, email: 'p@example.com', role: 'patient', is_active: true },
  3: { user_id: 3, email: 'd7@example.com', role: 'doctor', is_active: true },
  4: { user_id: 4, email: 'a@example.com', role: 'admin', is_active: true },
  6: { user_id: 6, email: 'd8@example.com', role: 'doctor', is_active: true },
  9: { user_id: 9, email: 'nodoc@example.com', role: 'doctor', is_active: true }, // بلا سجل طبيب
};
const DOCTORS = { 3: { doctor_id: 7, duration: 30 }, 6: { doctor_id: 8, duration: 20 } };
const PATIENT = (n) => ({ first: `اسم${n}`, last: `عائلة${n}`, phone: `09000000${n}0` });

// حجوزات: { doctorId, id, date, time, phase, patient }
const BOOKINGS = [
  { doctorId: 7, id: 1, date: '2026-10-28', time: '09:00:00', phase: 'past', n: 1 },
  { doctorId: 7, id: 2, date: '2026-10-29', time: '09:30:00', phase: 'upcoming', n: 2 },
  { doctorId: 7, id: 3, date: '2026-10-31', time: '16:30:00', phase: 'upcoming', n: 3 },
  { doctorId: 8, id: 4, date: '2026-10-29', time: '09:00:00', phase: 'upcoming', n: 4 }, // طبيب آخر
];

function makeDb() {
  const log = [];
  return {
    log,
    query: async (sql, params = []) => {
      log.push({ sql, params });
      assert.doesNotMatch(sql, /^\s*(INSERT|UPDATE|DELETE)/i, 'doctor portal must never write');
      if (/FROM public\.users u/.test(sql)) return { rows: USERS[params[0]] ? [{ ...USERS[params[0]], first_name: 'x', last_name: 'y' }] : [] };
      if (/FROM public\.doctors d\s+JOIN public\.specialties/.test(sql)) {
        const d = DOCTORS[params[0]];
        return { rows: d ? [{ doctor_id: d.doctor_id, appointment_duration: d.duration }] : [] };
      }
      if (/FROM public\.appointments a\s+JOIN public\.patients p/.test(sql)) {
        const [doctorId, from, to] = params;
        return {
          rows: BOOKINGS.filter((b) => b.doctorId === doctorId && b.date >= from && b.date <= to).map((b) => ({
            appointment_id: b.id, appointment_date: b.date, appointment_time: b.time, phase: b.phase,
            patient_first_name: PATIENT(b.n).first, patient_last_name: PATIENT(b.n).last, patient_phone: PATIENT(b.n).phone,
          })),
        };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
    withTransaction: async () => {
      throw new Error('doctor portal must not open transactions');
    },
  };
}

const setup = () => {
  const db = makeDb();
  const app = createApp({ db, config, clock: () => NOW });
  const as = (userId, method, path) => request(app)[method](path).set('Cookie', `${COOKIE_NAME}=${signToken(userId, config.auth)}`);
  return { db, app, as };
};

test('doctor portal requires a doctor session and a doctor profile', async () => {
  const { app, as } = setup();
  for (const path of ['/api/doctor/schedule', '/api/doctor/appointments']) {
    assert.equal((await request(app).get(path)).status, 401);
    assert.equal((await as(1, 'get', path)).status, 403, 'patient');
    assert.equal((await as(4, 'get', path)).status, 403, 'admin');
    const orphan = await as(9, 'get', path);
    assert.equal(orphan.status, 403);
    assert.equal(orphan.body.error.code, 'DOCTOR_PROFILE_REQUIRED');
  }
});

test('doctor portal is strictly read-only: write methods have no route', async () => {
  const { as, db } = setup();
  for (const path of ['/api/doctor/schedule', '/api/doctor/appointments', '/api/doctor/appointments/1']) {
    for (const method of ['post', 'put', 'patch', 'delete']) {
      assert.equal((await as(3, method, path).send({})).status, 404, `${method} ${path}`);
    }
  }
  assert.ok(db.log.every((e) => !/^\s*(INSERT|UPDATE|DELETE)/i.test(e.sql)));
});

test('data is scoped to the session doctor; a doctorId parameter is ignored', async () => {
  const { as, db } = setup();
  const res = await as(3, 'get', '/api/doctor/appointments?from=2026-10-28&to=2026-11-03&doctorId=8');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.appointments.map((a) => a.id), [1, 2, 3]); // لا يظهر حجز الطبيب 8
  const query = db.log.find((e) => /FROM public\.appointments/.test(e.sql));
  assert.equal(query.params[0], 7);
  assert.match(query.sql, /a\.doctor_id = \$1 AND a\.status = 'booked'/);
  assert.deepEqual(db.log.find((e) => /FROM public\.doctors d/.test(e.sql)).params, [3]); // user_id من الجلسة
  const other = await as(6, 'get', '/api/doctor/appointments?from=2026-10-28&to=2026-11-03');
  assert.deepEqual(other.body.appointments.map((a) => a.id), [4]);
});

test('appointments list exposes only the three patient fields and derives end time for upcoming only', async () => {
  const { as, db } = setup();
  const res = await as(3, 'get', '/api/doctor/appointments?from=2026-10-28&to=2026-10-31');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.appointments[0], {
    id: 1, date: '2026-10-28', startTime: '09:00', endTime: null, phase: 'past',
    patient: { firstName: 'اسم1', lastName: 'عائلة1', phone: '0900000010' },
  });
  assert.deepEqual(res.body.appointments[1].endTime, '10:00'); // 09:30 + 30
  assert.deepEqual(Object.keys(res.body.appointments[1].patient), ['firstName', 'lastName', 'phone']);
  const sql = db.log.find((e) => /FROM public\.appointments/.test(e.sql)).sql;
  assert.doesNotMatch(sql, /p\.(email|birth_date|address|gender|blood_type|user_id|patient_id\s*,)|password/i);
  assert.doesNotMatch(JSON.stringify(res.body), /email|birth|address|gender|blood|password|patientId/i);
});

test('appointments range: defaults to today + 6 days, validates dates and the 31-day maximum', async () => {
  const { as } = setup();
  const def = await as(3, 'get', '/api/doctor/appointments');
  assert.deepEqual([def.body.from, def.body.to], ['2026-10-28', '2026-11-03']);
  assert.equal((await as(3, 'get', '/api/doctor/appointments?from=2026-10-01&to=2026-10-31')).status, 200); // 31 يوماً
  for (const query of ['from=2026-02-30', 'from=abc', 'to=2026-13-01', 'from=2026-10-10&to=2026-10-09', 'from=2026-10-01&to=2026-11-02', 'from=2026-10-01&from=2026-10-02']) {
    const res = await as(3, 'get', `/api/doctor/appointments?${query}`);
    assert.equal(res.status, 400, query);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
});

test('day view: Friday closed, working hours 09:00-17:00, duration from the specialty, available/booked/past', async () => {
  const { as } = setup();
  const friday = await as(3, 'get', '/api/doctor/schedule?view=day&date=2026-10-30');
  assert.deepEqual(friday.body.days, [{ date: '2026-10-30', closed: true, slots: [] }]);

  const today = await as(3, 'get', '/api/doctor/schedule'); // الافتراضي: يومي، اليوم في دمشق
  assert.equal(today.status, 200);
  assert.deepEqual([today.body.view, today.body.from, today.body.to, today.body.timeZone, today.body.slotDuration], ['day', '2026-10-28', '2026-10-28', 'Asia/Damascus', 30]);
  const slots = today.body.days[0].slots;
  assert.equal(slots.length, 16);
  assert.deepEqual([slots[0].startTime, slots.at(-1).endTime], ['09:00', '17:00']);
  assert.deepEqual(slots[0], { startTime: '09:00', endTime: '09:30', booked: true, past: true, appointment: { id: 1, patient: { firstName: 'اسم1', lastName: 'عائلة1', phone: '0900000010' } } });
  const flags = (s) => [s.booked, s.past];
  assert.deepEqual(flags(slots[1]), [false, true]); // 09:30 مضى وغير محجوز
  assert.deepEqual(flags(slots[3]), [false, true]); // 10:30 بدأ الآن فيُعد ماضياً
  assert.deepEqual(flags(slots[4]), [false, false]); // 11:00 متاح
  assert.equal(slots[4].appointment, null);

  const tomorrow = (await as(3, 'get', '/api/doctor/schedule?date=2026-10-29')).body.days[0].slots;
  assert.deepEqual(flags(tomorrow[1]), [true, false]); // 09:30 محجوز وقادم
  assert.ok(tomorrow.filter((s) => s.past).length === 0);
  const yesterday = (await as(3, 'get', '/api/doctor/schedule?date=2026-10-27')).body.days[0].slots;
  assert.ok(yesterday.every((s) => s.past));
});

test('appointment duration comes from the doctor specialty (20 minutes gives 24 slots)', async () => {
  const { as } = setup();
  const res = await as(6, 'get', '/api/doctor/schedule?date=2026-10-29');
  assert.equal(res.body.slotDuration, 20);
  const slots = res.body.days[0].slots;
  assert.equal(slots.length, 24);
  assert.equal(slots[0].booked, true);
  assert.deepEqual([slots[1].startTime, slots[1].endTime], ['09:20', '09:40']);
  assert.equal(slots.at(-1).endTime, '17:00');
});

test('week view starts on Saturday, has 7 days and ends with the closed Friday', async () => {
  const { as } = setup();
  for (const date of ['2026-10-28', '2026-10-24', '2026-10-30', '2026-10-25']) {
    const res = await as(3, 'get', `/api/doctor/schedule?view=week&date=${date}`);
    assert.equal(res.status, 200, date);
    assert.deepEqual([res.body.from, res.body.to], ['2026-10-24', '2026-10-30'], date);
    assert.equal(res.body.days.length, 7);
    assert.equal(res.body.days[0].date, '2026-10-24'); // السبت
    assert.deepEqual(res.body.days.at(-1), { date: '2026-10-30', closed: true, slots: [] });
    assert.equal(res.body.days.filter((d) => d.closed).length, 1);
  }
  const week = (await as(3, 'get', '/api/doctor/schedule?view=week&date=2026-10-28')).body;
  const bookedIds = week.days.flatMap((d) => d.slots.filter((s) => s.booked).map((s) => s.appointment.id));
  assert.deepEqual(bookedIds, [1, 2]); // حجز 3 يوم 10-31 خارج الأسبوع
  const next = (await as(3, 'get', '/api/doctor/schedule?view=week&date=2026-10-31')).body;
  assert.equal(next.from, '2026-10-31');
  assert.equal(next.days[0].slots[15].appointment.id, 3); // 16:30
});

test('schedule rejects invalid view and dates', async () => {
  const { as } = setup();
  for (const query of ['view=month', 'view=day&view=week', 'date=2026-02-30', 'date=29-10-2026', 'date=2026-10-28&date=2026-10-29']) {
    const res = await as(3, 'get', `/api/doctor/schedule?${query}`);
    assert.equal(res.status, 400, query);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
});
