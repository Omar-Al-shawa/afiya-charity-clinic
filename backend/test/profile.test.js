import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { COOKIE_NAME, signToken } from '../src/auth/tokens.js';

const PASSWORD = 'Passw0rd!';
const makeConfig = (max = 1000) => ({
  allowedOrigins: [],
  auth: { jwtSecret: 'x'.repeat(40), tokenTtlSeconds: 3600, bcryptCost: 4, cookieSecure: false, rateLimit: { windowMs: 60000, max } },
});
const cookieFor = (userId, config) => `${COOKIE_NAME}=${signToken(userId, config.auth)}`;

// قاعدة وهمية: users وpatients فقط، وتسجّل عبارات UPDATE (لا اتصال حقيقي بأي قاعدة)
function makeDb() {
  const hash = bcrypt.hashSync(PASSWORD, 4);
  const users = {
    1: { user_id: 1, email: 'p1@example.com', role: 'patient', is_active: true, password_hash: hash, first_name: 'سارة', last_name: 'أحمد' },
    2: { user_id: 2, email: 'p2@example.com', role: 'patient', is_active: true, password_hash: hash, first_name: 'ليلى', last_name: 'علي' },
    3: { user_id: 3, email: 'd@example.com', role: 'doctor', is_active: true, password_hash: hash, first_name: 'خالد', last_name: 'محمد' },
    4: { user_id: 4, email: 'a@example.com', role: 'admin', is_active: true, password_hash: hash, first_name: null, last_name: null },
  };
  const patients = {
    1: { first_name: 'سارة', last_name: 'أحمد', phone: '0911111111', birth_date: '1995-03-20', address: 'دمشق', gender: 'female', blood_type: null },
    2: { first_name: 'ليلى', last_name: 'علي', phone: '0922222222', birth_date: '1990-01-01', address: 'حلب', gender: 'female', blood_type: 'A+' },
  };
  const log = [];
  return {
    users, patients, log,
    query: async (sql, params = []) => {
      log.push({ sql, params });
      if (/FROM public\.users u/.test(sql)) return { rows: users[params[0]] ? [{ ...users[params[0]] }] : [] };
      if (/^SELECT password_hash FROM public\.users/.test(sql)) return { rows: users[params[0]] ? [{ password_hash: users[params[0]].password_hash }] : [] };
      if (/^UPDATE public\.users SET password_hash/.test(sql)) {
        users[params[0]].password_hash = params[1];
        return { rows: [] };
      }
      if (/^SELECT .* FROM public\.patients WHERE user_id = \$1/s.test(sql)) return { rows: patients[params[0]] ? [{ ...patients[params[0]] }] : [] };
      if (/^UPDATE public\.patients/.test(sql)) {
        const row = patients[params[0]];
        if (!row) return { rows: [] };
        [row.first_name, row.last_name, row.phone, row.address] = params.slice(1);
        return { rows: [{ ...row }] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
    withTransaction: async () => {
      throw new Error('not used');
    },
  };
}

const setup = (max) => {
  const config = makeConfig(max);
  const db = makeDb();
  const app = createApp({ db, config });
  const as = (userId, method, path) => request(app)[method](path).set('Cookie', cookieFor(userId, config));
  return { db, app, as };
};
const VALID = { firstName: ' ريم ', lastName: 'الحسن', phone: '٠٩٣٣٣٣٣٣٣٣', address: ' اللاذقية - الزراعة ' };

// ---------- الصلاحيات ----------

test('profile endpoints are patient-only; change-password is patient, doctor and admin only', async () => {
  const { app, as } = setup();
  for (const [method, path] of [['get', '/api/patient/profile'], ['put', '/api/patient/profile']]) {
    assert.equal((await request(app)[method](path).send(VALID)).status, 401);
    assert.equal((await as(3, method, path).send(VALID)).status, 403, 'doctor');
    assert.equal((await as(4, method, path).send(VALID)).status, 403, 'admin');
  }
  const body = { currentPassword: PASSWORD, newPassword: 'NewPassw0rd', confirmPassword: 'NewPassw0rd' };
  assert.equal((await request(app).post('/api/auth/change-password').send(body)).status, 401);
  assert.equal((await as(1, 'post', '/api/auth/change-password').send(body)).status, 204);
  assert.equal((await as(3, 'post', '/api/auth/change-password').send(body)).status, 204);
  // المدير يغيّر كلمة مروره هو فقط (المريض والطبيب أعلاه بقيا كما هما)
  const { as: asAdmin, db } = setup();
  const adminBefore = db.users[4].password_hash;
  const others = [1, 2, 3].map((id) => db.users[id].password_hash);
  const adminBody = { currentPassword: PASSWORD, newPassword: 'NewPassw0rd12', confirmPassword: 'NewPassw0rd12' };
  assert.equal((await asAdmin(4, 'post', '/api/auth/change-password').send(adminBody)).status, 204, 'admin');
  assert.notEqual(db.users[4].password_hash, adminBefore);
  assert.deepEqual([1, 2, 3].map((id) => db.users[id].password_hash), others, 'only the admin hash changed');
});

// ---------- الملف الشخصي ----------

test('GET profile returns the safe shape for the session patient only', async () => {
  const { as, db } = setup();
  const res = await as(1, 'get', '/api/patient/profile');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    profile: {
      email: 'p1@example.com', firstName: 'سارة', lastName: 'أحمد', phone: '0911111111',
      birthdate: '1995-03-20', address: 'دمشق', gender: 'female', bloodType: null,
    },
  });
  assert.doesNotMatch(JSON.stringify(res.body), /hash|user_id|patient_id|role/i);
  assert.deepEqual(db.log.find((e) => /FROM public\.patients/.test(e.sql)).params, [1]);
});

test('PUT profile updates only the four editable fields of the session patient', async () => {
  const { as, db } = setup();
  const res = await as(1, 'put', '/api/patient/profile').send({
    ...VALID, email: 'hacker@example.com', birthdate: '2000-01-01', gender: 'male', bloodType: 'O+', role: 'admin', userId: 2, patientId: 2,
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.profile, {
    email: 'p1@example.com', firstName: 'ريم', lastName: 'الحسن', phone: '0933333333', birthdate: '1995-03-20',
    address: 'اللاذقية - الزراعة', gender: 'female', bloodType: null,
  });
  const update = db.log.find((e) => /^UPDATE public\.patients/.test(e.sql));
  assert.deepEqual(update.params, [1, 'ريم', 'الحسن', '0933333333', 'اللاذقية - الزراعة']);
  assert.match(update.sql, /SET first_name = \$2, last_name = \$3, phone = \$4, address = \$5\s+WHERE user_id = \$1/);
  assert.doesNotMatch(update.sql, /email|birth_date\s*=|gender\s*=|blood_type\s*=|role|user_id\s*=\s*\$[2-9]/i);
  assert.equal(db.users[1].email, 'p1@example.com');
  assert.equal(db.patients[2].first_name, 'ليلى', "another patient's row is untouched");
  assert.equal(db.patients[1].gender, 'female');
});

test('PUT profile rejects invalid data with per-field Arabic errors and no UPDATE', async () => {
  const { as, db } = setup();
  const cases = [
    [{}, ['firstName', 'lastName', 'phone', 'address']],
    [{ ...VALID, firstName: 'A1' }, ['firstName']],
    [{ ...VALID, lastName: 'x' }, ['lastName']],
    [{ ...VALID, phone: '0812345678' }, ['phone']],
    [{ ...VALID, phone: '09 33333333' }, ['phone']],
    [{ ...VALID, address: '   ' }, ['address']],
    [{ ...VALID, address: 'م'.repeat(201) }, ['address']],
    [{ ...VALID, firstName: 123 }, ['firstName']],
  ];
  for (const [body, fields] of cases) {
    const res = await as(1, 'put', '/api/patient/profile').send(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(Object.keys(res.body.error.fields).sort(), fields.sort());
    for (const message of Object.values(res.body.error.fields)) assert.match(message, /[؀-ۿ]/);
  }
  assert.ok(!db.log.some((e) => /^UPDATE/.test(e.sql)));
});

// ---------- تغيير كلمة المرور ----------

const change = (as, userId, body) => as(userId, 'post', '/api/auth/change-password').send(body);
const GOOD = { currentPassword: PASSWORD, newPassword: 'NewPassw0rd', confirmPassword: 'NewPassw0rd' };

test('change-password verifies the current password, then stores a new bcrypt hash for the session user only', async () => {
  const { as, db } = setup();
  const before = db.users[1].password_hash;
  const otherBefore = db.users[2].password_hash;
  const res = await change(as, 1, { ...GOOD, userId: 2 });
  assert.equal(res.status, 204);
  assert.equal(res.text, '');
  assert.notEqual(db.users[1].password_hash, before);
  assert.ok(await bcrypt.compare('NewPassw0rd', db.users[1].password_hash));
  assert.ok(!(await bcrypt.compare(PASSWORD, db.users[1].password_hash)));
  assert.equal(db.users[2].password_hash, otherBefore, 'no other user is changed');

  const update = db.log.find((e) => /^UPDATE public\.users/.test(e.sql));
  assert.equal(update.params[0], 1);
  assert.match(update.sql, /SET password_hash = \$2 WHERE user_id = \$1/);
  assert.doesNotMatch(update.sql, /email|role|is_active/);
});

test('the admin new password needs 12 characters (counted as characters); patients and doctors keep 8', async () => {
  const { as, db } = setup();
  const with8 = { currentPassword: PASSWORD, newPassword: 'Passw0rd', confirmPassword: 'Passw0rd' };
  const adminHash = db.users[4].password_hash;

  // 8 أحرف: مرفوضة للمدير (400 برسالة 12 حرفاً)، ومقبولة للمريض والطبيب
  for (const short of ['Passw0rd', 'Passw0rd123']) {
    const res = await change(as, 4, { ...with8, newPassword: short, confirmPassword: short });
    assert.equal(res.status, 400, `admin with ${short.length} characters`);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.equal(res.body.error.fields.newPassword, 'كلمة المرور يجب ألا تقل عن 12 حرفاً.');
  }
  assert.equal(db.users[4].password_hash, adminHash, 'a rejected change does not touch the hash');
  assert.equal((await change(as, 1, with8)).status, 204, 'patient keeps 8');
  assert.equal((await change(as, 3, with8)).status, 204, 'doctor keeps 8');
  const patientShort = await change(as, 2, { ...with8, newPassword: 'Short1!', confirmPassword: 'Short1!' });
  assert.equal(patientShort.body.error.fields.newPassword, 'كلمة المرور يجب ألا تقل عن 8 أحرف.', 'the patient message is unchanged');

  // 12 حرفاً بالضبط مقبولة (وبالحروف لا بالبايتات: 12 حرفاً عربياً = 24 بايتاً)
  const exactly12 = 'Passw0rd1234';
  assert.equal((await change(as, 4, { ...with8, newPassword: exactly12, confirmPassword: exactly12 })).status, 204);
  assert.ok(await bcrypt.compare(exactly12, db.users[4].password_hash));
  const arabic12 = 'كلمةمرورطويلة'.slice(0, 12);
  assert.equal([...arabic12].length, 12);
  assert.equal((await change(as, 4, { currentPassword: exactly12, newPassword: arabic12, confirmPassword: arabic12 })).status, 204);
});

test('the admin keeps every other password rule: current password, confirmation and the 72-byte maximum', async () => {
  const { as, db } = setup();
  const hash = db.users[4].password_hash;
  const good = 'Passw0rd1234';
  const wrongCurrent = await change(as, 4, { currentPassword: 'not-the-password', newPassword: good, confirmPassword: good });
  assert.equal(wrongCurrent.status, 400);
  assert.ok(wrongCurrent.body.error.fields.currentPassword);
  const mismatch = await change(as, 4, { currentPassword: PASSWORD, newPassword: good, confirmPassword: `${good}x` });
  assert.equal(mismatch.status, 400);
  assert.ok(mismatch.body.error.fields.confirmPassword);
  const tooLong = 'ك'.repeat(37); // 74 بايتاً
  const oversized = await change(as, 4, { currentPassword: PASSWORD, newPassword: tooLong, confirmPassword: tooLong });
  assert.equal(oversized.status, 400);
  assert.ok(oversized.body.error.fields.newPassword);
  assert.equal(db.users[4].password_hash, hash, 'nothing was stored');
});

test('change-password rejects a wrong current password, a mismatch, and weak or oversized new passwords', async () => {
  const { as, db } = setup();
  const hash = db.users[1].password_hash;
  const cases = [
    [{ ...GOOD, currentPassword: 'wrong-password' }, 'currentPassword'],
    [{ ...GOOD, currentPassword: PASSWORD + 'x'.repeat(80) }, 'currentPassword'],
    [{ ...GOOD, confirmPassword: 'Different123' }, 'confirmPassword'],
    [{ ...GOOD, confirmPassword: '' }, 'confirmPassword'],
    [{ ...GOOD, newPassword: 'short', confirmPassword: 'short' }, 'newPassword'],
    [{ ...GOOD, newPassword: 'ع'.repeat(37), confirmPassword: 'ع'.repeat(37) }, 'newPassword'], // 74 بايت
    [{ ...GOOD, newPassword: undefined }, 'newPassword'],
    [{ ...GOOD, currentPassword: undefined }, 'currentPassword'],
  ];
  for (const [body, field] of cases) {
    const res = await change(as, 1, body);
    assert.equal(res.status, 400, field);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.fields[field], field);
    assert.match(res.body.error.fields[field], /[؀-ۿ]/);
  }
  assert.equal(db.users[1].password_hash, hash, 'hash unchanged after every rejection');
  assert.equal((await change(as, 1, { ...GOOD, newPassword: 'a'.repeat(72), confirmPassword: 'a'.repeat(72) })).status, 204, 'exactly 72 bytes is accepted');
});

test('change-password is rate limited', async () => {
  const { as } = setup(2);
  const bad = { ...GOOD, currentPassword: 'wrong-password' };
  assert.equal((await change(as, 1, bad)).status, 400);
  assert.equal((await change(as, 1, bad)).status, 400);
  const limited = await change(as, 1, bad);
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error.code, 'RATE_LIMITED');
});
