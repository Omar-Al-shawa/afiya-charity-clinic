import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { COOKIE_NAME, signToken } from '../src/auth/tokens.js';

const config = {
  allowedOrigins: [],
  auth: { jwtSecret: 'x'.repeat(40), tokenTtlSeconds: 3600, bcryptCost: 4, cookieSecure: false, rateLimit: { windowMs: 60000, max: 1000 } },
};

const USERS = {
  1: { user_id: 1, email: 'p1@example.com', role: 'patient', is_active: true, first_name: 'سارة', last_name: 'أحمد' },
  2: { user_id: 2, email: 'p2@example.com', role: 'patient', is_active: true, first_name: 'ليلى', last_name: 'علي' },
  3: { user_id: 3, email: 'd@example.com', role: 'doctor', is_active: true, first_name: 'خالد', last_name: 'محمد' },
  4: { user_id: 4, email: 'a@example.com', role: 'admin', is_active: true, first_name: null, last_name: null },
  5: { user_id: 5, email: 'orphan@example.com', role: 'patient', is_active: true, first_name: null, last_name: null }, // بلا ملف مريض
};
const PATIENT_OF_USER = { 1: 11, 2: 12 };
const cookieFor = (userId) => `${COOKIE_NAME}=${signToken(userId, config.auth)}`;

const doctor = { doctor_id: 7, first_name: 'محمد', last_name: 'ميداني', specialty_id: 2, specialty_name: 'أمراض القلب', appointment_duration: 30 };

// قاعدة وهمية بمخزن مواعيد صغير تفسّر عبارات المستودع وتسجّل ما يُنفَّذ (لا اتصال حقيقي بأي قاعدة)
function makeDb({ appointments = [], insertError = null } = {}) {
  const store = appointments.map((a) => ({ status: 'booked', started: false, ...a }));
  const log = [];
  let nextId = 500;
  const phaseOf = (a) => (a.status === 'cancelled' ? 'cancelled' : a.started ? 'past' : 'upcoming');
  const toRow = (a) => ({
    appointment_id: a.id, status: a.status, appointment_date: a.date, appointment_time: a.time,
    ...doctor, phase: phaseOf(a),
  });

  async function run(sql, params = []) {
    log.push({ sql, params });
    if (/FROM public\.users u/.test(sql)) return { rows: USERS[params[0]] ? [{ ...USERS[params[0]] }] : [] };
    if (/^\s*SET LOCAL lock_timeout/.test(sql)) return { rows: [] };
    if (/SELECT patient_id FROM public\.patients/.test(sql)) {
      return { rows: PATIENT_OF_USER[params[0]] ? [{ patient_id: PATIENT_OF_USER[params[0]] }] : [] };
    }
    if (/INSERT INTO public\.appointments/.test(sql)) {
      if (insertError) throw insertError;
      const a = { id: nextId++, patientId: params[0], doctorId: params[1], date: params[2], time: `${params[3]}:00`, status: 'booked', started: false };
      store.push(a);
      return { rows: [{ appointment_id: a.id }] };
    }
    if (/UPDATE public\.appointments/.test(sql)) {
      const a = store.find((x) => x.id === params[0] && x.patientId === params[1] && x.status === 'booked' && !x.started);
      if (a) a.status = 'cancelled';
      return { rows: a ? [{ appointment_id: a.id }] : [] };
    }
    if (/^SELECT status FROM public\.appointments/.test(sql)) {
      const a = store.find((x) => x.id === params[0] && x.patientId === params[1]);
      return { rows: a ? [{ status: a.status }] : [] };
    }
    if (/WHERE a\.appointment_id = \$1 AND a\.patient_id = \$2/.test(sql)) {
      const a = store.find((x) => x.id === params[0] && x.patientId === params[1]);
      return { rows: a ? [toRow(a)] : [] };
    }
    if (/WHERE a\.patient_id = \$1/.test(sql)) {
      return { rows: store.filter((x) => x.patientId === params[0]).map(toRow) };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  }

  return {
    store,
    log,
    query: run,
    withTransaction: async (fn) => {
      log.push({ sql: 'BEGIN ISOLATION LEVEL READ COMMITTED' });
      try {
        const result = await fn({ query: run });
        log.push({ sql: 'COMMIT' });
        return result;
      } catch (err) {
        log.push({ sql: 'ROLLBACK' });
        throw err;
      }
    },
    ping: async () => {},
  };
}

const appFor = (db) => createApp({ db, config });
const as = (app, userId, method, path) => request(app)[method](path).set('Cookie', cookieFor(userId));
const BOOKING = { doctorId: 7, date: '2026-10-29', time: '09:30' };
const dbWork = (db) => db.log.filter((e) => !/FROM public\.users u/.test(e.sql)); // بلا استعلام المصادقة

// ---------- المصادقة والصلاحيات ----------

test('all appointment endpoints require a patient session', async () => {
  const app = appFor(makeDb());
  for (const [method, path] of [['post', '/api/appointments'], ['get', '/api/appointments'], ['post', '/api/appointments/1/cancel']]) {
    assert.equal((await request(app)[method](path).send(BOOKING)).status, 401, `${method} ${path} anonymous`);
    for (const userId of [3, 4]) {
      const res = await as(app, userId, method, path).send(BOOKING);
      assert.equal(res.status, 403, `${method} ${path} role of user ${userId}`);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    }
    const orphan = await as(app, 5, method, path).send(BOOKING);
    assert.equal(orphan.status, 403, `${method} ${path} patient without profile`);
    assert.equal(orphan.body.error.code, 'PATIENT_PROFILE_REQUIRED');
  }
});

// ---------- الحجز ----------

test('booking takes the patient from the session (body patientId is ignored) in one READ COMMITTED transaction', async () => {
  const db = makeDb();
  const res = await as(appFor(db), 1, 'post', '/api/appointments').send({ ...BOOKING, patientId: 12, role: 'admin' });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body, {
    appointment: {
      id: 500, status: 'booked', phase: 'upcoming', canCancel: true, date: '2026-10-29', startTime: '09:30', endTime: '10:00',
      doctorId: 7, doctorName: 'د. محمد ميداني', specialtyId: 2, specialtyName: 'أمراض القلب',
    },
  });

  const lookup = db.log.find((e) => /SELECT patient_id FROM public\.patients/.test(e.sql));
  assert.deepEqual(lookup.params, [1]); // user_id من الجلسة
  const insert = db.log.find((e) => /INSERT INTO public\.appointments/.test(e.sql));
  assert.deepEqual(insert.params, [11, 7, '2026-10-29', '09:30']); // patient_id 11 لا 12
  assert.doesNotMatch(insert.sql, /status/); // يأخذ الافتراضي booked
  assert.equal(db.store[0].patientId, 11);

  const order = db.log.map((e) => e.sql);
  assert.ok(order.indexOf('BEGIN ISOLATION LEVEL READ COMMITTED') < order.findIndex((s) => /SET LOCAL lock_timeout = '5s'/.test(s)));
  assert.ok(order.findIndex((s) => /SET LOCAL/.test(s)) < order.findIndex((s) => /INSERT INTO public\.appointments/.test(s)));
  assert.equal(order.at(-1), 'COMMIT');
});

test('booking rejects malformed input with 400 and opens no transaction', async () => {
  const db = makeDb();
  const app = appFor(db);
  const bad = [
    {}, { ...BOOKING, doctorId: 'abc' }, { ...BOOKING, doctorId: 0 }, { ...BOOKING, doctorId: 1.5 }, { ...BOOKING, doctorId: null },
    { ...BOOKING, date: '2026-02-30' }, { ...BOOKING, date: '29/10/2026' }, { ...BOOKING, date: 20261029 },
    { ...BOOKING, time: '9:30' }, { ...BOOKING, time: '24:00' }, { ...BOOKING, time: '09:30:00' }, { ...BOOKING, time: '' },
  ];
  for (const body of bad) {
    const res = await as(app, 1, 'post', '/api/appointments').send(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(Object.keys(res.body.error.fields).length > 0);
  }
  assert.equal(dbWork(db).length, 0);
  // رقم نصي مقبول (من معلمة مسار مثلاً)
  assert.equal((await as(app, 1, 'post', '/api/appointments').send({ ...BOOKING, doctorId: '7' })).status, 201);
});

test('booking conflicts and database errors map to Arabic messages, and the transaction rolls back', async () => {
  const cases = [
    [{ code: 'AF102' }, 404, 'AF102'], [{ code: 'AF103' }, 422, 'AF103'], [{ code: 'AF104' }, 422, 'AF104'],
    [{ code: 'AF105' }, 422, 'AF105'], [{ code: 'AF106' }, 422, 'AF106'], [{ code: 'AF107' }, 409, 'AF107'],
    [{ code: 'AF108' }, 409, 'AF108'], [{ code: 'AF109' }, 422, 'AF109'], [{ code: 'AF110' }, 400, 'AF110'],
    [{ code: 'AF111' }, 422, 'AF111'],
    [{ code: '23505', constraint: 'appointments_doctor_slot_uq' }, 409, 'AF107'],
    [{ code: '23505', constraint: 'appointments_patient_slot_uq' }, 409, 'AF108'],
    [{ code: '40P01' }, 503, 'TRY_AGAIN'], [{ code: '55P03' }, 503, 'TRY_AGAIN'],
  ];
  for (const [pgError, status, code] of cases) {
    const db = makeDb({ insertError: Object.assign(new Error('pg'), pgError) });
    const res = await as(appFor(db), 1, 'post', '/api/appointments').send(BOOKING);
    assert.equal(res.status, status, JSON.stringify(pgError));
    assert.equal(res.body.error.code, code);
    assert.match(res.body.error.message, /[؀-ۿ]/);
    assert.equal(db.log.at(-1).sql, 'ROLLBACK');
    assert.ok(!db.log.some((e) => e.sql === 'COMMIT'));
    assert.equal(db.store.length, 0);
  }
});

test('unexpected booking errors return a generic 500 and roll back', async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const err of [new Error('boom relation x'), Object.assign(new Error('iso'), { code: 'AF113' })]) {
    const db = makeDb({ insertError: err });
    const res = await as(appFor(db), 1, 'post', '/api/appointments').send(BOOKING);
    assert.equal(res.status, 500);
    assert.equal(res.body.error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(res.body), /boom|relation|iso/);
    assert.equal(db.log.at(-1).sql, 'ROLLBACK');
  }
});

// ---------- الإلغاء ----------

const own = { id: 900, patientId: 11, date: '2026-10-29', time: '09:00:00' };

test('cancel updates the status atomically (ownership, booked, not started) and keeps the record', async () => {
  const db = makeDb({ appointments: [own] });
  const res = await as(appFor(db), 1, 'post', '/api/appointments/900/cancel');
  assert.equal(res.status, 200);
  assert.equal(res.body.appointment.status, 'cancelled');
  assert.equal(res.body.appointment.phase, 'cancelled');
  assert.equal(res.body.appointment.canCancel, false);
  assert.equal(res.body.appointment.endTime, null);
  assert.equal(db.store.length, 1, 'record is not deleted');

  const update = db.log.find((e) => /UPDATE public\.appointments/.test(e.sql));
  assert.deepEqual(update.params, [900, 11]);
  assert.match(update.sql, /patient_id = \$2/);
  assert.match(update.sql, /status = 'booked'/);
  assert.match(update.sql, /> public\.clinic_local\(clock_timestamp\(\)\)/);
  assert.doesNotMatch(db.log.map((e) => e.sql).join(' '), /DELETE/i);
  assert.equal(db.log.at(-1).sql, 'COMMIT');
});

test("a patient cannot cancel another patient's appointment: same 404 as a nonexistent one", async () => {
  const db = makeDb({ appointments: [{ ...own, patientId: 12 }] });
  const app = appFor(db);
  const foreign = await as(app, 1, 'post', '/api/appointments/900/cancel');
  const missing = await as(app, 1, 'post', '/api/appointments/901/cancel');
  assert.equal(foreign.status, 404);
  assert.deepEqual(foreign.body, missing.body);
  assert.equal(foreign.body.error.code, 'APPOINTMENT_NOT_FOUND');
  assert.equal(db.store[0].status, 'booked');
});

test('already cancelled and started appointments cannot be cancelled', async () => {
  const db = makeDb({
    appointments: [
      { ...own, id: 910, status: 'cancelled' },
      { ...own, id: 911, started: true },
    ],
  });
  const app = appFor(db);
  const again = await as(app, 1, 'post', '/api/appointments/910/cancel');
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'ALREADY_CANCELLED');
  const started = await as(app, 1, 'post', '/api/appointments/911/cancel');
  assert.equal(started.status, 409);
  assert.equal(started.body.error.code, 'APPOINTMENT_STARTED');
  assert.equal(db.store.find((a) => a.id === 911).status, 'booked');
  assert.equal(db.log.at(-1).sql, 'ROLLBACK');
});

test('malformed cancel ids return 404 without touching the database', async () => {
  const db = makeDb();
  for (const bad of ['abc', '0', '-1', '1.5', '99999999999']) {
    const res = await as(appFor(db), 1, 'post', `/api/appointments/${bad}/cancel`);
    assert.equal(res.status, 404, bad);
  }
  assert.equal(dbWork(db).length, 0);
});

// ---------- السجل ----------

test('history returns only the patient\'s own appointments with phase, canCancel and derived end time', async () => {
  const db = makeDb({
    appointments: [
      { id: 1, patientId: 11, date: '2026-10-29', time: '09:00:00' },
      { id: 2, patientId: 11, date: '2026-10-20', time: '10:30:00', started: true },
      { id: 3, patientId: 11, date: '2026-10-25', time: '11:00:00', status: 'cancelled' },
      { id: 4, patientId: 12, date: '2026-10-29', time: '12:00:00' }, // مريض آخر
    ],
  });
  const res = await as(appFor(db), 1, 'get', '/api/appointments');
  assert.equal(res.status, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  const byId = Object.fromEntries(res.body.appointments.map((a) => [a.id, a]));
  assert.deepEqual(Object.keys(byId).sort(), ['1', '2', '3']);

  assert.deepEqual([byId[1].phase, byId[1].canCancel, byId[1].endTime], ['upcoming', true, '09:30']);
  assert.deepEqual([byId[2].phase, byId[2].canCancel, byId[2].endTime, byId[2].status], ['past', false, null, 'booked']);
  assert.deepEqual([byId[3].phase, byId[3].canCancel, byId[3].endTime, byId[3].status], ['cancelled', false, null, 'cancelled']);
  assert.equal(byId[2].startTime, '10:30');
  assert.deepEqual(Object.keys(byId[1]).sort(), ['canCancel', 'date', 'doctorId', 'doctorName', 'endTime', 'id', 'phase', 'specialtyId', 'specialtyName', 'startTime', 'status']);

  const query = db.log.find((e) => /WHERE a\.patient_id = \$1/.test(e.sql));
  assert.deepEqual(query.params, [11]);
  assert.match(query.sql, /clinic_local\(clock_timestamp\(\)\)/); // الوقت الفعلي في دمشق لا التاريخ وحده
  assert.doesNotMatch(query.sql, /phone|email|password|biography|birth/i);
});

test('history is empty for a patient with no appointments', async () => {
  const res = await as(appFor(makeDb()), 2, 'get', '/api/appointments');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { appointments: [] });
});
