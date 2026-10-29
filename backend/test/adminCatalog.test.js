import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { COOKIE_NAME, signToken } from '../src/auth/tokens.js';
import { checkSpecialtyName } from '../src/validation/admin.js';

const config = {
  allowedOrigins: [],
  auth: { jwtSecret: 'x'.repeat(40), tokenTtlSeconds: 3600, bcryptCost: 4, cookieSecure: false, rateLimit: { windowMs: 60000, max: 1000 } },
};
const ADMIN = 4;
const EFFECTIVE = '2026-11-11';

// قاعدة وهمية تحاكي ما تفرضه القاعدة الحقيقية (قيود فريدة، AF120/AF121/AF122، التراجع الذري) وتسجّل ما يُنفَّذ.
// أي UPDATE/DELETE لطبيب أو اختصاص موجود أو أي دالة تنفيذ طلبات تُسقط الاختبار.
function makeDb(overrides = {}) {
  const state = {
    specialties: [
      { id: 1, name: 'أمراض القلب', duration: 30 },
      { id: 2, name: 'طب الأطفال', duration: 20 },
    ],
    users: [
      { user_id: 1, email: 'p@example.com', role: 'patient', is_active: true },
      { user_id: 3, email: 'doc@example.com', role: 'doctor', is_active: true },
      { user_id: 4, email: 'admin@example.com', role: 'admin', is_active: true },
      { user_id: 30, email: 'd7@example.com', role: 'doctor', is_active: true },
      { user_id: 31, email: 'd8@example.com', role: 'doctor', is_active: false },
    ],
    doctors: [
      { id: 7, userId: 30, specialtyId: 1, first: 'محمد', last: 'ميداني', birth: '1994-11-15', phone: '0911111111', image: null, bio: null, years: 6 },
      { id: 8, userId: 31, specialtyId: 1, first: 'ريما', last: 'العلي', birth: '1996-01-02', phone: '0922222222', image: '/images/doctors/doctor-02.png', bio: 'سيرة', years: 4 },
    ],
    pending: [],
    nextId: 100,
    ...overrides,
  };
  const log = [];
  const specialtyOf = (id) => state.specialties.find((s) => s.id === id);
  const userOf = (id) => state.users.find((u) => u.user_id === id);

  const pendingRow = (p) => {
    const d = state.doctors.find((x) => x.id === p.doctorId);
    return {
      change_id: p.id, doctor_id: p.doctorId ?? null, specialty_id: p.specialtyId ?? null, change_type: p.type, new_data: p.newData ?? null,
      status: p.status, created_at: new Date('2026-10-28T10:00:00Z'), execute_at: new Date('2026-11-10T21:00:00Z'),
      failure_reason: p.failureReason ?? null, effective_date: EFFECTIVE,
      doctor_first_name: d?.first ?? null, doctor_last_name: d?.last ?? null, specialty_name: specialtyOf(p.specialtyId)?.name ?? null,
    };
  };
  const doctorRow = (d) => ({
    doctor_id: d.id, first_name: d.first, last_name: d.last, birth_date: d.birth, phone: d.phone, image_url: d.image, biography: d.bio,
    years_of_experience: d.years, specialty_id: d.specialtyId, specialty_name: specialtyOf(d.specialtyId).name,
    appointment_duration: specialtyOf(d.specialtyId).duration, email: userOf(d.userId).email, is_active: userOf(d.userId).is_active,
  });
  const specialtyRow = (s) => {
    const docs = state.doctors.filter((d) => d.specialtyId === s.id);
    return {
      specialty_id: s.id, specialty_name: s.name, appointment_duration: s.duration, doctors_count: docs.length,
      active_doctors_count: docs.filter((d) => userOf(d.userId).is_active).length,
    };
  };
  const pgError = (code, constraint) => Object.assign(new Error('pg'), { code, constraint });
  const pendingFor = (doctorId, specialtyId) => state.pending.find((p) => p.status === 'pending' && (doctorId ? p.doctorId === doctorId : p.specialtyId === specialtyId));

  async function run(sql, params = []) {
    log.push({ sql, params });
    assert.doesNotMatch(sql, /UPDATE public\.(doctors|specialties)|DELETE FROM|execute_due_pending_change|execute_next_pending_change/i);
    if (/^\s*SET LOCAL lock_timeout/.test(sql)) return { rows: [] };
    if (/FROM public\.users u\s+LEFT JOIN public\.patients/.test(sql)) {
      const u = userOf(params[0]);
      return { rows: u ? [{ ...u, first_name: null, last_name: null }] : [] };
    }
    // الاختصاصات
    if (/FROM public\.specialties s\s+LEFT JOIN public\.doctors d/.test(sql)) {
      const list = /WHERE s\.specialty_id = \$1/.test(sql) ? state.specialties.filter((s) => s.id === params[0]) : state.specialties;
      return { rows: list.map(specialtyRow) };
    }
    if (/^INSERT INTO public\.specialties/.test(sql)) {
      if (state.specialties.some((s) => s.name === params[0])) throw pgError('23505', 'specialties_specialty_name_key');
      const s = { id: state.nextId++, name: params[0], duration: params[1] };
      state.specialties.push(s);
      return { rows: [{ specialty_id: s.id }] };
    }
    if (/^SELECT 1 FROM public\.specialties WHERE specialty_id/.test(sql)) return { rows: specialtyOf(params[0]) ? [{}] : [] };
    if (/^SELECT 1 FROM public\.specialties WHERE specialty_name/.test(sql)) {
      return { rows: state.specialties.some((s) => s.name === params[0] && s.id !== params[1]) ? [{}] : [] };
    }
    // الأطباء
    if (/SELECT d\.doctor_id, d\.user_id, u\.is_active/.test(sql)) {
      const d = state.doctors.find((x) => x.id === params[0]);
      return { rows: d ? [{ doctor_id: d.id, user_id: d.userId, is_active: userOf(d.userId).is_active }] : [] };
    }
    if (/FROM public\.doctors d\s+JOIN public\.users u ON u\.user_id = d\.user_id\s+JOIN public\.specialties s/.test(sql)) {
      const list = /WHERE d\.doctor_id = \$1/.test(sql) ? state.doctors.filter((d) => d.id === params[0]) : state.doctors;
      return { rows: list.map(doctorRow) };
    }
    if (/^SELECT 1 FROM public\.users WHERE email/.test(sql)) {
      return { rows: state.users.some((u) => u.email === params[0] && u.user_id !== params[1]) ? [{}] : [] };
    }
    if (/^INSERT INTO public\.users/.test(sql)) {
      if (state.users.some((u) => u.email === params[0])) throw pgError('23505', 'users_email_key');
      const u = { user_id: state.nextId++, email: params[0], password_hash: params[1], role: /'doctor'/.test(sql) ? 'doctor' : 'other', is_active: true };
      state.users.push(u);
      return { rows: [{ user_id: u.user_id }] };
    }
    if (/^INSERT INTO public\.doctors/.test(sql)) {
      const [userId, specialtyId, first, last, birth, phone, image, bio, years] = params;
      if (!specialtyOf(specialtyId)) throw pgError('23503', 'doctors_specialty_id_fkey');
      if (state.pending.some((p) => p.status === 'pending' && p.specialtyId === specialtyId && p.type === 'delete')) throw pgError('AF121');
      const d = { id: state.nextId++, userId, specialtyId, first, last, birth, phone, image, bio, years };
      state.doctors.push(d);
      return { rows: [{ doctor_id: d.id }] };
    }
    // الطلبات المعلّقة
    if (/FROM public\.pending_changes pc/.test(sql)) {
      const list = /WHERE pc\.change_id = \$1/.test(sql)
        ? state.pending.filter((p) => p.id === params[0])
        : state.pending.filter((p) => params[0].includes(p.status)).reverse();
      return { rows: list.map(pendingRow) };
    }
    if (/^INSERT INTO public\.pending_changes/.test(sql)) {
      const [doctorId, specialtyId, type, json] = params;
      if (doctorId && pendingFor(doctorId, null)) throw pgError('23505', 'pending_changes_one_per_doctor');
      if (specialtyId && pendingFor(null, specialtyId)) throw pgError('23505', 'pending_changes_one_per_specialty');
      if (specialtyId && type === 'delete' && state.doctors.some((d) => d.specialtyId === specialtyId)) throw pgError('AF120');
      const p = { id: state.nextId++, doctorId, specialtyId, type, newData: json ? JSON.parse(json) : null, status: 'pending' };
      state.pending.push(p);
      return { rows: [{ change_id: p.id }] };
    }
    if (/^SELECT public\.cancel_pending_change/.test(sql)) {
      const p = state.pending.find((x) => x.id === params[0]);
      if (!p || p.status !== 'pending') throw pgError('AF122');
      p.status = 'cancelled';
      return { rows: [{}] };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  }

  return {
    state,
    log,
    query: run,
    ping: async () => {},
    withTransaction: async (fn) => {
      const snapshot = structuredClone(state);
      log.push({ sql: 'BEGIN ISOLATION LEVEL READ COMMITTED' });
      try {
        const result = await fn({ query: run });
        log.push({ sql: 'COMMIT' });
        return result;
      } catch (err) {
        Object.assign(state, snapshot); // تراجع ذري
        log.push({ sql: 'ROLLBACK' });
        throw err;
      }
    },
  };
}

const setup = (overrides) => {
  const db = makeDb(overrides);
  const app = createApp({ db, config });
  const as = (userId, method, path) => request(app)[method](path).set('Cookie', `${COOKIE_NAME}=${signToken(userId, config.auth)}`);
  return { db, app, admin: (method, path) => as(ADMIN, method, path), as };
};

const DOCTOR_BODY = {
  firstName: ' سامر ', lastName: 'الحلبي', email: ' New.Doctor@Example.COM ', password: 'Passw0rd!', phone: '٠٩٣٣٣٣٣٣٣٣',
  birthdate: '1990-05-17', specialtyId: 1,
};
const noPrivate = (body) => assert.doesNotMatch(JSON.stringify(body), /password|hash/i);

// ---------- الصلاحيات ----------

test('every admin route requires an authenticated admin', async () => {
  const { app, as } = setup();
  const routes = [
    ['get', '/api/admin/specialties'], ['post', '/api/admin/specialties'], ['patch', '/api/admin/specialties/1'], ['delete', '/api/admin/specialties/1'],
    ['get', '/api/admin/doctors'], ['post', '/api/admin/doctors'], ['patch', '/api/admin/doctors/7'], ['delete', '/api/admin/doctors/7'],
    ['get', '/api/admin/pending-changes'], ['post', '/api/admin/pending-changes/1/cancel'],
  ];
  for (const [method, path] of routes) {
    assert.equal((await request(app)[method](path).send({})).status, 401, `${method} ${path} anonymous`);
    assert.equal((await as(1, method, path).send({})).status, 403, `${method} ${path} patient`);
    assert.equal((await as(3, method, path).send({})).status, 403, `${method} ${path} doctor`);
  }
});

// ---------- الاختصاصات: إنشاء فوري ----------

test('specialty creation is immediate, validated and rejects duplicates', async () => {
  const { admin, db } = setup();
  const res = await admin('post', '/api/admin/specialties').send({ name: '  طب   الأسنان  ', appointmentDuration: 25 });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.specialty, { id: 100, name: 'طب الأسنان', appointmentDuration: 25, doctorsCount: 0, activeDoctorsCount: 0, pendingChange: null });
  assert.deepEqual(db.log.find((e) => /^INSERT INTO public\.specialties/.test(e.sql)).params, ['طب الأسنان', 25]);

  const before = db.log.length;
  const bad = [
    {}, { name: 'A', appointmentDuration: 20 }, { name: 'طب 2', appointmentDuration: 20 }, { name: 'م'.repeat(101), appointmentDuration: 20 },
    { name: 'طب', appointmentDuration: 0 }, { name: 'طب', appointmentDuration: 481 }, { name: 'طب', appointmentDuration: 1.5 }, { name: 'طب' },
    { name: 'طب', appointmentDuration: 'abc' },
  ];
  for (const body of bad) {
    const r = await admin('post', '/api/admin/specialties').send(body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.ok(Object.keys(r.body.error.fields).length > 0);
  }
  const rejectedQueries = db.log.slice(before);
  assert.ok(rejectedQueries.every((e) => /FROM public\.users u/.test(e.sql)), 'rejected requests run authentication queries only');
  assert.ok(!rejectedQueries.some((e) => /^INSERT/.test(e.sql)), 'rejected requests perform no INSERT');

  const dup = await admin('post', '/api/admin/specialties').send({ name: 'أمراض   القلب', appointmentDuration: 30 });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'SPECIALTY_EXISTS');
  assert.ok(dup.body.error.fields.name);
});

test('the specialty name rule accepts the existing approved specialty names', async () => {
  const { specialties } = await import('../../frontend/src/mock/specialties.js'); // قراءة فقط
  assert.ok(specialties.length > 0);
  for (const { name } of specialties) assert.equal(checkSpecialtyName(name).value, name, name);
  assert.equal(checkSpecialtyName('Pediatrics - Child').value, 'Pediatrics - Child');
});

// ---------- الأطباء: إنشاء فوري بحساب ----------

test('doctor creation makes the account and the doctor atomically with a hashed password', async () => {
  const { admin, db } = setup();
  const res = await admin('post', '/api/admin/doctors').send({ ...DOCTOR_BODY, imageUrl: '/images/doctors/doctor-62.png', biography: ' سيرة قصيرة ', yearsOfExperience: 5, role: 'admin' });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.doctor, {
    id: 101, firstName: 'سامر', lastName: 'الحلبي', email: 'new.doctor@example.com', phone: '0933333333', birthdate: '1990-05-17',
    imageUrl: '/images/doctors/doctor-62.png', biography: 'سيرة قصيرة', yearsOfExperience: 5, specialtyId: 1, specialtyName: 'أمراض القلب',
    appointmentDuration: 30, isActive: true, pendingChange: null,
  });
  noPrivate(res.body);

  const user = db.state.users.find((u) => u.email === 'new.doctor@example.com');
  assert.equal(user.role, 'doctor');
  assert.notEqual(user.password_hash, DOCTOR_BODY.password);
  assert.ok(await bcrypt.compare(DOCTOR_BODY.password, user.password_hash));

  const sqls = db.log.map((e) => e.sql);
  const first = sqls.indexOf('BEGIN ISOLATION LEVEL READ COMMITTED');
  assert.match(sqls[first + 1], /SET LOCAL lock_timeout = '5s'/);
  assert.match(sqls[first + 2], /INSERT INTO public\.users[\s\S]*'doctor'/);
  assert.doesNotMatch(sqls[first + 2], /\$3/); // الدور ليس معاملاً
  assert.match(sqls[first + 3], /INSERT INTO public\.doctors/);
  assert.ok(sqls.indexOf('COMMIT') > first + 3);
});

test('doctor creation validates input and the optional fields', async () => {
  const { admin, db } = setup();
  const ok = async (extra) => (await admin('post', '/api/admin/doctors').send({ ...DOCTOR_BODY, email: `e${Math.random().toString(36).slice(2)}@example.com`, ...extra })).status;
  assert.equal(await ok({}), 201);
  assert.equal(await ok({ imageUrl: null, biography: null, yearsOfExperience: null }), 201);
  assert.equal(await ok({ imageUrl: 'https://example.com/photos/a.jpg' }), 201);
  assert.equal(await ok({ yearsOfExperience: 0 }), 201);
  assert.equal(await ok({ yearsOfExperience: 60 }), 201);
  assert.equal(await ok({ biography: 'م'.repeat(2000) }), 201);
  const last = db.state.doctors.at(-1);
  assert.equal(last.bio.length, 2000);

  const reject = async (extra, field) => {
    const r = await admin('post', '/api/admin/doctors').send({ ...DOCTOR_BODY, ...extra });
    assert.equal(r.status, 400, JSON.stringify(extra));
    assert.ok(r.body.error.fields[field], field);
  };
  await reject({ imageUrl: 'http://example.com/a.jpg' }, 'imageUrl');
  await reject({ imageUrl: '//evil.example/a.jpg' }, 'imageUrl');
  await reject({ imageUrl: 'javascript:alert(1)' }, 'imageUrl');
  await reject({ imageUrl: '/a/../b.png' }, 'imageUrl');
  await reject({ imageUrl: 'https://user:pw@example.com/a.jpg' }, 'imageUrl');
  await reject({ imageUrl: `/${'a'.repeat(500)}` }, 'imageUrl');
  await reject({ biography: 'م'.repeat(2001) }, 'biography');
  await reject({ yearsOfExperience: 61 }, 'yearsOfExperience');
  await reject({ yearsOfExperience: -1 }, 'yearsOfExperience');
  await reject({ yearsOfExperience: 1.5 }, 'yearsOfExperience');
  await reject({ password: 'short' }, 'password');
  await reject({ phone: '0812345678' }, 'phone');
  await reject({ email: 'not-an-email' }, 'email');
  await reject({ birthdate: '2999-01-01' }, 'birthdate');
  await reject({ specialtyId: 'x' }, 'specialtyId');
  await reject({ firstName: '' }, 'firstName');
});

test('doctor creation failures roll back atomically (no orphan user) and map to Arabic errors', async () => {
  const unknown = setup();
  const noSpecialty = await unknown.admin('post', '/api/admin/doctors').send({ ...DOCTOR_BODY, specialtyId: 999 });
  assert.equal(noSpecialty.status, 400);
  assert.equal(noSpecialty.body.error.code, 'SPECIALTY_NOT_FOUND');
  assert.equal(unknown.db.state.users.some((u) => u.email === 'new.doctor@example.com'), false, 'user row rolled back');
  assert.equal(unknown.db.log.at(-1).sql, 'ROLLBACK');

  const pendingDelete = setup({ pending: [{ id: 50, specialtyId: 1, type: 'delete', status: 'pending' }] });
  const blocked = await pendingDelete.admin('post', '/api/admin/doctors').send(DOCTOR_BODY);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code, 'AF121');
  assert.equal(pendingDelete.db.state.users.length, 5, 'no orphan user after AF121');

  const taken = setup();
  const dup = await taken.admin('post', '/api/admin/doctors').send({ ...DOCTOR_BODY, email: 'D7@example.com' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'EMAIL_TAKEN');
  assert.ok(dup.body.error.fields.email);
  assert.equal(taken.db.state.doctors.length, 2);
});

// ---------- الطلبات المؤجَّلة ----------

test('specialty PATCH and DELETE create deferred requests (202) and never modify the specialty', async () => {
  const { admin, db } = setup();
  const patch = await admin('patch', '/api/admin/specialties/2').send({ name: ' طب  الأطفال الجديد ', appointmentDuration: 25, specialtyId: 9, junk: 1 });
  assert.equal(patch.status, 202);
  assert.deepEqual(patch.body.pendingChange, {
    id: 100, target: { type: 'specialty', id: 2, name: 'طب الأطفال' }, changeType: 'update',
    newData: { name: 'طب الأطفال الجديد', appointmentDuration: 25 }, status: 'pending', createdAt: patch.body.pendingChange.createdAt,
    effectiveDate: EFFECTIVE, failureReason: null,
  });
  const insert = db.log.find((e) => /^INSERT INTO public\.pending_changes/.test(e.sql));
  assert.match(insert.sql, /\(doctor_id, specialty_id, change_type, new_data\)/);
  assert.doesNotMatch(insert.sql, /created_at|execute_at|status/);
  assert.deepEqual(insert.params, [null, 2, 'update', JSON.stringify({ specialty_name: 'طب الأطفال الجديد', appointment_duration: 25 })]);
  assert.deepEqual(db.state.specialties[1], { id: 2, name: 'طب الأطفال', duration: 20 }, 'specialty unchanged');

  const del = await admin('delete', '/api/admin/specialties/2');
  assert.equal(del.status, 409); // ثاني طلب على الهدف نفسه
  assert.equal(del.body.error.code, 'PENDING_CHANGE_EXISTS');
  assert.equal(db.state.specialties.length, 2);
});

test('specialty change requests: delete is blocked by doctors, validation, conflicts and 404s', async () => {
  const { admin, db } = setup();
  const withDoctors = await admin('delete', '/api/admin/specialties/1');
  assert.equal(withDoctors.status, 409);
  assert.equal(withDoctors.body.error.code, 'AF120');

  const deleted = await admin('delete', '/api/admin/specialties/2');
  assert.equal(deleted.status, 202);
  assert.deepEqual([deleted.body.pendingChange.changeType, deleted.body.pendingChange.newData], ['delete', null]);
  assert.equal(db.log.find((e) => /^INSERT INTO public\.pending_changes/.test(e.sql) && e.params[2] === 'delete').params[3], null);

  const other = setup();
  const nameTaken = await other.admin('patch', '/api/admin/specialties/2').send({ name: 'أمراض القلب' });
  assert.equal(nameTaken.status, 409);
  assert.equal(nameTaken.body.error.code, 'SPECIALTY_EXISTS');
  for (const [body, field] of [[{}, 'body'], [{ junk: 1 }, 'body'], [{ name: '1' }, 'name'], [{ appointmentDuration: 481 }, 'appointmentDuration']]) {
    const r = await other.admin('patch', '/api/admin/specialties/2').send(body);
    assert.equal(r.status, 400);
    assert.ok(r.body.error.fields[field], field);
  }
  assert.equal((await other.admin('patch', '/api/admin/specialties/99').send({ name: 'طب' })).status, 404);
  assert.equal((await other.admin('delete', '/api/admin/specialties/abc')).status, 404);
  assert.ok(!other.db.log.some((e) => /^INSERT INTO public\.pending_changes/.test(e.sql)));
});

test('doctor PATCH and DELETE create deferred requests; the specialty is immutable', async () => {
  const { admin, db } = setup();
  const patch = await admin('patch', '/api/admin/doctors/7').send({
    firstName: ' سامر ', phone: '٠٩٣٣٣٣٣٣٣٣', email: 'Changed@Example.com', birthdate: '1990-01-01', imageUrl: null, biography: 'سيرة', yearsOfExperience: 9,
  });
  assert.equal(patch.status, 202);
  assert.deepEqual(patch.body.pendingChange.newData, {
    firstName: 'سامر', phone: '0933333333', email: 'changed@example.com', birthdate: '1990-01-01', imageUrl: null, biography: 'سيرة', yearsOfExperience: 9,
  });
  assert.deepEqual(patch.body.pendingChange.target, { type: 'doctor', id: 7, name: 'د. محمد ميداني' });
  assert.equal(db.state.doctors[0].first, 'محمد', 'doctor unchanged');
  assert.equal(db.state.users.find((u) => u.user_id === 30).email, 'd7@example.com', 'account email unchanged');

  const dup = await admin('delete', '/api/admin/doctors/7');
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'PENDING_CHANGE_EXISTS');

  const fresh = setup();
  const specialty = await fresh.admin('patch', '/api/admin/doctors/7').send({ specialtyId: 2, phone: '0933333333' });
  assert.equal(specialty.status, 400);
  assert.equal(specialty.body.error.fields.specialtyId, 'لا يمكن تغيير اختصاص الطبيب.');
  assert.ok(!fresh.db.log.some((e) => /^INSERT INTO public\.pending_changes/.test(e.sql)));

  const del = await fresh.admin('delete', '/api/admin/doctors/7');
  assert.equal(del.status, 202);
  assert.equal(del.body.pendingChange.changeType, 'delete');
  assert.equal(fresh.db.state.users.find((u) => u.user_id === 30).is_active, true, 'doctor is not deactivated by the request');

  for (const [body, field] of [[{}, 'body'], [{ phone: '123' }, 'phone'], [{ email: 'bad' }, 'email'], [{ yearsOfExperience: 70 }, 'yearsOfExperience']]) {
    const r = await setup().admin('patch', '/api/admin/doctors/7').send(body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.ok(r.body.error.fields[field], field);
  }
  const taken = await setup().admin('patch', '/api/admin/doctors/7').send({ email: 'ADMIN@example.com' });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.error.code, 'EMAIL_TAKEN');
  assert.equal((await setup().admin('patch', '/api/admin/doctors/99').send({ phone: '0933333333' })).status, 404);
});

test('change requests for an inactive doctor are rejected with 409', async () => {
  const { admin, db } = setup();
  const patch = await admin('patch', '/api/admin/doctors/8').send({ phone: '0933333333' });
  const del = await admin('delete', '/api/admin/doctors/8');
  for (const res of [patch, del]) {
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'DOCTOR_INACTIVE');
  }
  assert.equal(db.state.pending.length, 0);
  assert.ok(db.log.filter((e) => e.sql === 'ROLLBACK').length >= 2);
});

// ---------- القوائم والإلغاء ----------

const SEEDED = () => [
  { id: 90, specialtyId: 2, type: 'update', newData: { specialty_name: 'طب الأطفال 2' }, status: 'failed', failureReason: 'duplicate key value violates unique constraint' },
  { id: 91, doctorId: 7, type: 'update', newData: { phone: '0955555555' }, status: 'pending' },
  { id: 92, specialtyId: 1, type: 'update', newData: { appointment_duration: 40 }, status: 'executed' },
];

test('pending-change listing shows pending and failed (with reasons) by default and supports filters', async () => {
  const { admin, db } = setup({ pending: SEEDED() });
  const res = await admin('get', '/api/admin/pending-changes');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.pendingChanges.map((p) => [p.id, p.status]), [[91, 'pending'], [90, 'failed']]);
  const failed = res.body.pendingChanges.find((p) => p.id === 90);
  assert.equal(failed.failureReason, 'duplicate key value violates unique constraint');
  assert.deepEqual(failed.target, { type: 'specialty', id: 2, name: 'طب الأطفال' });
  assert.deepEqual(failed.newData, { name: 'طب الأطفال 2' });
  assert.equal(res.body.pendingChanges.find((p) => p.id === 91).effectiveDate, EFFECTIVE);
  noPrivate(res.body);

  const ids = async (query) => (await admin('get', `/api/admin/pending-changes${query}`)).body.pendingChanges.map((p) => p.id).sort();
  assert.deepEqual(await ids('?status=executed'), [92]);
  assert.deepEqual(await ids('?status=failed'), [90]);
  assert.deepEqual(await ids('?status=all'), [90, 91, 92]);
  assert.equal((await admin('get', '/api/admin/pending-changes?status=bogus')).status, 400);
  assert.equal((await admin('get', '/api/admin/pending-changes?status=pending&status=failed')).status, 400);
  assert.ok(db.log.every((e) => !/execute_due|execute_next/.test(e.sql)));
});

test('specialty and doctor lists embed the pending request, include inactive doctors, and expose no secrets', async () => {
  const { admin } = setup({ pending: SEEDED() });
  const specialties = await admin('get', '/api/admin/specialties');
  const byId = Object.fromEntries(specialties.body.specialties.map((s) => [s.id, s]));
  assert.deepEqual([byId[1].doctorsCount, byId[1].activeDoctorsCount, byId[1].pendingChange], [2, 1, null]);
  assert.equal(byId[2].pendingChange, null, 'a failed request is not embedded as pending');
  const doctors = await admin('get', '/api/admin/doctors');
  const d = Object.fromEntries(doctors.body.doctors.map((x) => [x.id, x]));
  assert.deepEqual([d[7].isActive, d[8].isActive, d[7].pendingChange.id, d[8].pendingChange], [true, false, 91, null]);
  assert.equal(d[7].email, 'd7@example.com');
  noPrivate(specialties.body);
  noPrivate(doctors.body);
});

test('cancelling a pending request uses cancel_pending_change and reports the database rules', async () => {
  const { admin, db } = setup({ pending: SEEDED() });
  const ok = await admin('post', '/api/admin/pending-changes/91/cancel');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.pendingChange.status, 'cancelled');
  assert.deepEqual(db.log.find((e) => /cancel_pending_change/.test(e.sql)).params, [91]);
  assert.match(db.log.find((e) => /cancel_pending_change/.test(e.sql)).sql, /^SELECT public\.cancel_pending_change\(\$1\)$/);
  assert.equal(db.state.doctors[0].phone, '0911111111', 'doctor data unchanged');

  const again = await admin('post', '/api/admin/pending-changes/91/cancel');
  const executed = await admin('post', '/api/admin/pending-changes/92/cancel');
  for (const res of [again, executed]) {
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'AF122');
  }
  assert.equal((await admin('post', '/api/admin/pending-changes/999/cancel')).status, 404);
  assert.equal((await admin('post', '/api/admin/pending-changes/abc/cancel')).status, 404);

  // بعد الإلغاء يمكن تسجيل طلب جديد للهدف نفسه
  const next = await admin('patch', '/api/admin/doctors/7').send({ phone: '0966666666' });
  assert.equal(next.status, 202);
});
