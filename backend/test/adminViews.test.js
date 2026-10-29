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
  1: { user_id: 1, email: 'p@example.com', role: 'patient', is_active: true },
  3: { user_id: 3, email: 'd@example.com', role: 'doctor', is_active: true },
  4: { user_id: 4, email: 'admin@example.com', role: 'admin', is_active: true },
};
const ADMIN = 4;

const PATIENTS = [
  { id: 11, first: 'سارة', last: 'أحمد', phone: '0911111111', email: 'sara@example.com', birth: '1995-03-20', address: 'دمشق', gender: 'female', blood: null },
  { id: 12, first: 'ليلى', last: 'علي', phone: '0922222222', email: 'laila@example.com', birth: '1990-01-01', address: 'حلب', gender: 'female', blood: 'A+' },
  { id: 13, first: 'خالد', last: 'سعيد', phone: '0933333333', email: 'khaled@example.com', birth: '1985-07-09', address: 'حمص', gender: 'male', blood: 'O-' },
  { id: 14, first: 'نور', last: 'حسن', phone: '0944444444', email: 'nour@example.com', birth: '2000-12-31', address: 'اللاذقية', gender: 'female', blood: null },
  { id: 15, first: 'عمر', last: 'منصور', phone: '0955555555', email: 'omar@example.com', birth: '1999-05-05', address: 'طرطوس', gender: 'male', blood: 'B+' },
];
const DOCTORS = {
  7: { first: 'محمد', last: 'ميداني', specialtyId: 2, specialty: 'أمراض القلب', duration: 30 },
  8: { first: 'ريما', last: 'العلي', specialtyId: 3, specialty: 'طب الأطفال', duration: 20 },
};
// نتيجة الترتيب المتوقعة (الأحدث أولاً): 4 ثم 1 ثم 3 ثم 2
const APPOINTMENTS = [
  { id: 1, patient: 11, doctor: 7, date: '2026-10-29', time: '09:00:00', status: 'booked', phase: 'upcoming' },
  { id: 2, patient: 12, doctor: 8, date: '2026-10-20', time: '10:30:00', status: 'booked', phase: 'past' },
  { id: 3, patient: 13, doctor: 7, date: '2026-10-25', time: '11:00:00', status: 'cancelled', phase: 'cancelled' },
  { id: 4, patient: 12, doctor: 8, date: '2026-10-29', time: '09:30:00', status: 'booked', phase: 'upcoming' },
];

// قاعدة وهمية للقراءة فقط: أي كتابة أو معاملة أو دالة تنفيذ/إلغاء طلبات تُسقط الاختبار
function makeDb() {
  const log = [];
  const patientRow = (p) => ({ patient_id: p.id, first_name: p.first, last_name: p.last, phone: p.phone, email: p.email });
  const appointmentRow = (a) => {
    const d = DOCTORS[a.doctor];
    const p = PATIENTS.find((x) => x.id === a.patient);
    return {
      appointment_id: a.id, status: a.status, appointment_date: a.date, appointment_time: a.time, phase: a.phase,
      doctor_id: a.doctor, doctor_first_name: d.first, doctor_last_name: d.last,
      specialty_id: d.specialtyId, specialty_name: d.specialty, appointment_duration: d.duration,
      patient_id: p.id, patient_first_name: p.first, patient_last_name: p.last,
    };
  };
  return {
    log,
    withTransaction: async () => {
      throw new Error('admin views must not open transactions');
    },
    ping: async () => {},
    query: async (sql, params = []) => {
      log.push({ sql, params });
      assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE)\b|execute_due|execute_next|cancel_pending/i, 'admin views must be read-only');
      assert.doesNotMatch(sql, /password_hash|\*\s+FROM/i, 'no secrets or SELECT *');
      if (/FROM public\.users u\s+LEFT JOIN public\.patients/.test(sql)) {
        const u = USERS[params[0]];
        return { rows: u ? [{ ...u, first_name: null, last_name: null }] : [] };
      }
      if (/FROM public\.patients p\s+JOIN public\.users u[\s\S]*WHERE p\.patient_id = \$1/.test(sql)) {
        const p = PATIENTS.find((x) => x.id === params[0]);
        return { rows: p ? [{ ...patientRow(p), birth_date: p.birth, address: p.address, gender: p.gender, blood_type: p.blood }] : [] };
      }
      if (/FROM public\.patients p\s+JOIN public\.users u[\s\S]*ORDER BY p\.patient_id/.test(sql)) {
        const [limit, offset] = params;
        return { rows: PATIENTS.slice(offset, offset + limit).map(patientRow) };
      }
      if (/FROM public\.appointments a/.test(sql)) {
        const [date, doctorId, limit, offset] = params;
        const rows = APPOINTMENTS.filter((a) => (date === null || a.date === date) && (doctorId === null || a.doctor === doctorId))
          .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time) || b.id - a.id)
          .slice(offset, offset + limit);
        return { rows: rows.map(appointmentRow) };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

const setup = () => {
  const db = makeDb();
  const app = createApp({ db, config });
  const as = (userId, method, path) => request(app)[method](path).set('Cookie', `${COOKIE_NAME}=${signToken(userId, config.auth)}`);
  return { db, app, as, admin: (method, path) => as(ADMIN, method, path) };
};
const dataQueries = (db) => db.log.filter((e) => !/FROM public\.users u/.test(e.sql));
const keyNames = (v) => (v !== null && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...keyNames(x)]) : []);
const PATHS = ['/api/admin/patients', '/api/admin/patients/11', '/api/admin/appointments'];

// ---------- الصلاحيات والقراءة فقط ----------

test('admin views require an authenticated admin (401 anonymous, 403 patient and doctor)', async () => {
  const { app, as, db } = setup();
  for (const path of PATHS) {
    assert.equal((await request(app).get(path)).status, 401, `anonymous ${path}`);
    assert.equal((await as(1, 'get', path)).status, 403, `patient ${path}`);
    assert.equal((await as(3, 'get', path)).status, 403, `doctor ${path}`);
  }
  assert.equal(dataQueries(db).length, 0, 'no data query runs for rejected callers');
});

test('the views are strictly read-only: write methods have no route', async () => {
  const { admin, db } = setup();
  for (const path of PATHS) {
    for (const method of ['post', 'put', 'patch', 'delete']) {
      assert.equal((await admin(method, path).send({})).status, 404, `${method} ${path}`);
    }
  }
  assert.equal(dataQueries(db).length, 0);
});

// ---------- المرضى ----------

test('patients list returns the basic fields in registration order, with no secrets', async () => {
  const { admin, db } = setup();
  const res = await admin('get', '/api/admin/patients');
  assert.equal(res.status, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.deepEqual(res.body.patients[0], { id: 11, firstName: 'سارة', lastName: 'أحمد', email: 'sara@example.com', phone: '0911111111' });
  assert.deepEqual(res.body.patients.map((p) => p.id), [11, 12, 13, 14, 15]);
  assert.deepEqual([res.body.limit, res.body.offset, res.body.hasMore], [100, 0, false]);
  const secrets = keyNames(res.body).filter((k) => /password|hash|user_?id|role|token|birth|address|gender|blood/i.test(k));
  assert.deepEqual(secrets, [], 'no secret or detail-only keys in the list');
  const query = dataQueries(db)[0];
  assert.match(query.sql, /ORDER BY p\.patient_id/);
  assert.deepEqual(query.params, [101, 0]); // limit + 1 لمعرفة hasMore
});

test('patients pagination: limit, offset and hasMore; invalid parameters are rejected', async () => {
  const { admin, db } = setup();
  const first = await admin('get', '/api/admin/patients?limit=2');
  assert.deepEqual([first.body.patients.map((p) => p.id), first.body.hasMore, first.body.limit], [[11, 12], true, 2]);
  const last = await admin('get', '/api/admin/patients?limit=2&offset=4');
  assert.deepEqual([last.body.patients.map((p) => p.id), last.body.hasMore, last.body.offset], [[15], false, 4]);
  const exact = await admin('get', '/api/admin/patients?limit=5');
  assert.equal(exact.body.hasMore, false, 'exactly limit rows means no more');
  assert.equal((await admin('get', '/api/admin/patients?limit=500')).status, 200);

  const before = dataQueries(db).length;
  for (const query of ['limit=0', 'limit=501', 'limit=abc', 'limit=-1', 'limit=1.5', 'limit=', 'limit=007', 'offset=-1', 'offset=abc', 'offset=1.5', 'limit=1&limit=2', 'offset=1&offset=2']) {
    const res = await admin('get', `/api/admin/patients?${query}`);
    assert.equal(res.status, 400, query);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.fields.limit || res.body.error.fields.offset, query);
  }
  assert.equal(dataQueries(db).length, before, 'no data query for malformed paging');
});

test('patient details return the extra fields, null blood type, and 404 for unknown or malformed ids', async () => {
  const { admin, db } = setup();
  const unknownBlood = await admin('get', '/api/admin/patients/11');
  assert.equal(unknownBlood.status, 200);
  assert.deepEqual(unknownBlood.body.patient, {
    id: 11, firstName: 'سارة', lastName: 'أحمد', email: 'sara@example.com', phone: '0911111111',
    birthdate: '1995-03-20', address: 'دمشق', gender: 'female', bloodType: null,
  });
  assert.equal((await admin('get', '/api/admin/patients/12')).body.patient.bloodType, 'A+');
  assert.deepEqual(keyNames(unknownBlood.body).filter((k) => /password|hash|user_?id|role|token/i.test(k)), []);
  assert.deepEqual(dataQueries(db)[0].params, [11]);

  const before = dataQueries(db).length;
  for (const bad of ['abc', '0', '-3', '1.5', '99999999999']) {
    const res = await admin('get', `/api/admin/patients/${bad}`);
    assert.equal(res.status, 404, bad);
    assert.equal(res.body.error.code, 'PATIENT_NOT_FOUND');
  }
  assert.equal(dataQueries(db).length, before, 'no query for malformed ids');
  assert.equal((await admin('get', '/api/admin/patients/999')).status, 404);
});

// ---------- الحجوزات ----------

test('appointments list: booked and cancelled, newest first, with consistent doctor/patient/specialty data', async () => {
  const { admin, db } = setup();
  const res = await admin('get', '/api/admin/appointments');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.appointments.map((a) => a.id), [4, 1, 3, 2]); // التاريخ ثم الوقت ثم المعرّف تنازلياً
  assert.deepEqual([res.body.limit, res.body.offset, res.body.hasMore], [100, 0, false]);
  const byId = Object.fromEntries(res.body.appointments.map((a) => [a.id, a]));

  assert.deepEqual(byId[1], {
    id: 1, status: 'booked', phase: 'upcoming', date: '2026-10-29', startTime: '09:00', endTime: '09:30',
    doctorId: 7, doctorName: 'د. محمد ميداني', specialtyId: 2, specialtyName: 'أمراض القلب', patientId: 11, patientName: 'سارة أحمد',
  });
  assert.deepEqual([byId[4].doctorName, byId[4].specialtyName, byId[4].patientName, byId[4].endTime], ['د. ريما العلي', 'طب الأطفال', 'ليلى علي', '09:50']); // مدة اختصاصه 20
  assert.deepEqual([byId[2].status, byId[2].phase, byId[2].endTime, byId[2].startTime], ['booked', 'past', null, '10:30']);
  assert.deepEqual([byId[3].status, byId[3].phase, byId[3].endTime], ['cancelled', 'cancelled', null]);
  assert.deepEqual(new Set(res.body.appointments.map((a) => a.status)), new Set(['booked', 'cancelled']));

  const query = dataQueries(db)[0];
  assert.match(query.sql, /ORDER BY a\.appointment_date DESC, a\.appointment_time DESC, a\.appointment_id DESC/);
  assert.match(query.sql, /public\.clinic_local\(clock_timestamp\(\)\)/); // الطور بالوقت الفعلي في دمشق
  assert.deepEqual(query.params, [null, null, 101, 0]);
});

test('appointments expose no contact data or secrets', async () => {
  const { admin } = setup();
  const res = await admin('get', '/api/admin/appointments');
  const keys = new Set(keyNames(res.body));
  assert.deepEqual([...keys].filter((k) => /phone|email|password|hash|token|birth|address|gender|blood|user_?id|role/i.test(k)), []);
  assert.doesNotMatch(JSON.stringify(res.body), /0911111111|sara@example|@/); // لا هاتف ولا بريد في القيم أيضاً
});

test('appointment filters: date and doctorId (alone and combined) reach the query as parameters', async () => {
  const { admin, db } = setup();
  const ids = async (query) => (await admin('get', `/api/admin/appointments?${query}`)).body.appointments.map((a) => a.id);
  assert.deepEqual(await ids('date=2026-10-29'), [4, 1]);
  assert.deepEqual(await ids('doctorId=7'), [1, 3]);
  assert.deepEqual(await ids('date=2026-10-29&doctorId=7'), [1]);
  assert.deepEqual(await ids('date=2026-01-01'), [], 'no matches gives an empty list');
  assert.deepEqual(dataQueries(db).at(-1).params, ['2026-01-01', null, 101, 0]);
  assert.deepEqual(await ids('status=cancelled'), [4, 1, 3, 2], 'unsupported filters are ignored');

  const paged = await admin('get', '/api/admin/appointments?limit=2&offset=1');
  assert.deepEqual([paged.body.appointments.map((a) => a.id), paged.body.hasMore], [[1, 3], true]);
});

test('appointment query validation rejects malformed filters and paging without querying', async () => {
  const { admin, db } = setup();
  const before = dataQueries(db).length;
  const cases = [
    ['date=2026-02-30', 'date'], ['date=29-10-2026', 'date'], ['date=abc', 'date'], ['date=2026-10-29&date=2026-10-30', 'date'],
    ['doctorId=abc', 'doctorId'], ['doctorId=0', 'doctorId'], ['doctorId=-1', 'doctorId'], ['doctorId=1.5', 'doctorId'], ['doctorId=7&doctorId=8', 'doctorId'],
    ['limit=0', 'limit'], ['limit=501', 'limit'], ['offset=-1', 'offset'],
  ];
  for (const [query, field] of cases) {
    const res = await admin('get', `/api/admin/appointments?${query}`);
    assert.equal(res.status, 400, query);
    assert.ok(res.body.error.fields[field], `${query} -> ${field}`);
  }
  assert.equal(dataQueries(db).length, before);
});
