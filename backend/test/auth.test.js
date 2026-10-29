import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAuthenticate, requireRole } from '../src/middleware/authenticate.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { COOKIE_NAME, signToken } from '../src/auth/tokens.js';
import { damascusToday } from '../src/utils/schedule.js';

const PASSWORD = 'Passw0rd!';
const ORIGIN = 'http://localhost:5173';

function makeConfig(overrides = {}) {
  return {
    allowedOrigins: [ORIGIN],
    auth: {
      jwtSecret: 'x'.repeat(40),
      tokenTtlSeconds: 8 * 3600,
      bcryptCost: 4,
      cookieSecure: false,
      rateLimit: { windowMs: 60000, max: 1000 },
      ...overrides,
    },
  };
}

// قاعدة بيانات وهمية تفسّر استعلامات المستودع وتسجّل ما يُنفَّذ (لا اتصال حقيقي بأي قاعدة)
function makeFakeDb() {
  const passwordHash = bcrypt.hashSync(PASSWORD, 4);
  const users = [
    { user_id: 1, email: 'patient@example.com', password_hash: passwordHash, role: 'patient', is_active: true, first_name: 'سارة', last_name: 'أحمد' },
    { user_id: 2, email: 'doctor@example.com', password_hash: passwordHash, role: 'doctor', is_active: false, first_name: 'خالد', last_name: 'علي' },
    { user_id: 3, email: 'admin@example.com', password_hash: passwordHash, role: 'admin', is_active: true, first_name: null, last_name: null },
  ];
  const patients = [];
  const log = [];
  let nextId = 100;

  async function run(sql, params) {
    log.push({ sql, params });
    if (/FROM public\.users u/.test(sql)) {
      const row = /u\.email = \$1/.test(sql)
        ? users.find((u) => u.email === params[0])
        : users.find((u) => u.user_id === params[0]);
      return { rows: row ? [{ ...row }] : [] };
    }
    if (/INSERT INTO public\.users/.test(sql)) {
      if (users.some((u) => u.email === params[0])) {
        throw Object.assign(new Error('duplicate'), { code: '23505', constraint: 'users_email_key' });
      }
      const user = { user_id: nextId++, email: params[0], password_hash: params[1], role: 'patient', is_active: true };
      users.push(user);
      return { rows: [{ user_id: user.user_id }] };
    }
    if (/INSERT INTO public\.patients/.test(sql)) {
      patients.push(params);
      return { rows: [] };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  }

  return {
    users,
    patients,
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

const validBody = () => ({
  firstName: ' سارة ',
  lastName: 'محمد',
  email: ' New.Patient@Example.COM ',
  password: PASSWORD,
  phone: '٠٩١٢٣٤٥٦٧٨',
  birthdate: '1995-03-20',
  address: 'دمشق - البرامكة',
  gender: 'female',
  bloodType: 'unknown',
});

const post = (app, path) => request(app).post(`/api/auth${path}`).set('Origin', ORIGIN);

// ---------- التسجيل ----------

test('register creates a patient in one READ COMMITTED transaction, hashed and normalized', async () => {
  const db = makeFakeDb();
  const res = await post(createApp({ db, config: makeConfig() }), '/register').send({ ...validBody(), role: 'admin' });

  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, 'patient');
  assert.equal(res.body.user.email, 'new.patient@example.com');
  assert.equal(res.headers['set-cookie'], undefined, 'no auto-login');
  assert.doesNotMatch(JSON.stringify(res.body), /password|hash/i);

  const saved = db.users.at(-1);
  assert.equal(saved.role, 'patient');
  assert.notEqual(saved.password_hash, PASSWORD);
  assert.ok(await bcrypt.compare(PASSWORD, saved.password_hash));

  // [user_id, first, last, phone, birth_date, address, gender, blood_type]
  const [, first, last, phone, birth, address, gender, blood] = db.patients[0];
  assert.deepEqual([first, last, phone, birth, address, gender, blood], ['سارة', 'محمد', '0912345678', '1995-03-20', 'دمشق - البرامكة', 'female', null]);

  const statements = db.log.map((e) => e.sql);
  assert.match(statements[0], /BEGIN ISOLATION LEVEL READ COMMITTED/);
  assert.match(statements[1], /INSERT INTO public\.users/);
  assert.match(statements[1], /VALUES \(\$1, \$2, 'patient'\)/);
  assert.doesNotMatch(statements[1], /\$3/);
  assert.match(statements[2], /INSERT INTO public\.patients/);
  assert.equal(statements[3], 'COMMIT');
});

test('register rejects invalid fields with per-field Arabic errors and no database call', async () => {
  const db = makeFakeDb();
  const app = createApp({ db, config: makeConfig() });
  const today = damascusToday();
  const bad = {
    firstName: 'A1',
    lastName: '',
    email: 'not-an-email',
    password: 'short',
    phone: '0812345678',
    birthdate: today,
    address: ' ',
    gender: 'other',
    bloodType: 'Z+',
  };
  const res = await post(app, '/register').send(bad);
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.deepEqual(Object.keys(res.body.error.fields).sort(), Object.keys(bad).sort());
  for (const message of Object.values(res.body.error.fields)) assert.match(message, /[؀-ۿ]/);
  assert.equal(db.log.length, 0);

  const edge = await post(app, '/register').send({ ...validBody(), phone: '09123456789', birthdate: '1899-12-31' });
  assert.deepEqual(Object.keys(edge.body.error.fields).sort(), ['birthdate', 'phone']);
  const impossible = await post(app, '/register').send({ ...validBody(), birthdate: '2001-02-30' });
  assert.deepEqual(Object.keys(impossible.body.error.fields), ['birthdate']);
});

test('register accepts Persian digits and a real blood type, and rejects non-object bodies', async () => {
  const db = makeFakeDb();
  const app = createApp({ db, config: makeConfig() });
  const ok = await post(app, '/register').send({ ...validBody(), phone: '۰۹۱۲۳۴۵۶۷۸', bloodType: 'AB-' });
  assert.equal(ok.status, 201);
  assert.equal(db.patients[0][3], '0912345678');
  assert.equal(db.patients[0][7], 'AB-');
  const none = await post(app, '/register').set('Content-Type', 'application/json').send('[]');
  assert.equal(none.status, 400);
});

test('register rejects passwords over 72 bytes (never truncates) and accepts exactly 72', async () => {
  const db = makeFakeDb();
  const app = createApp({ db, config: makeConfig() });
  const long = await post(app, '/register').send({ ...validBody(), password: 'ع'.repeat(37) }); // 74 بايت
  assert.equal(long.status, 400);
  assert.match(long.body.error.fields.password, /72/);
  const ok = await post(app, '/register').send({ ...validBody(), password: 'a'.repeat(72) });
  assert.equal(ok.status, 201);
});

test('register with an existing email returns 409 and rolls back', async () => {
  const db = makeFakeDb();
  const res = await post(createApp({ db, config: makeConfig() }), '/register').send({ ...validBody(), email: 'PATIENT@example.com' });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'EMAIL_TAKEN');
  assert.ok(res.body.error.fields.email);
  assert.equal(db.log.at(-1).sql, 'ROLLBACK');
  assert.equal(db.patients.length, 0);
});

// ---------- الدخول والخروج ----------

test('login sets an httpOnly SameSite=Lax cookie and returns a safe user (role from the database)', async () => {
  const db = makeFakeDb();
  const res = await post(createApp({ db, config: makeConfig() }), '/login').send({ email: ' Patient@Example.com ', password: PASSWORD });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { user: { id: 1, email: 'patient@example.com', role: 'patient', firstName: 'سارة', lastName: 'أحمد' } });
  const cookie = res.headers['set-cookie'][0];
  assert.match(cookie, new RegExp(`^${COOKIE_NAME}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.doesNotMatch(cookie, /Secure/);
  assert.doesNotMatch(JSON.stringify(res.body), /hash|is_active/i);
});

test('login cookie is Secure when configured for production', async () => {
  const res = await post(createApp({ db: makeFakeDb(), config: makeConfig({ cookieSecure: true }) }), '/login').send({ email: 'patient@example.com', password: PASSWORD });
  assert.match(res.headers['set-cookie'][0], /Secure/);
});

test('wrong password and unknown email give the same generic 401', async () => {
  const app = createApp({ db: makeFakeDb(), config: makeConfig() });
  const wrong = await post(app, '/login').send({ email: 'patient@example.com', password: 'wrong-password' });
  const unknown = await post(app, '/login').send({ email: 'nobody@example.com', password: PASSWORD });
  const tooLong = await post(app, '/login').send({ email: 'patient@example.com', password: PASSWORD + 'x'.repeat(80) });
  for (const res of [wrong, unknown, tooLong]) {
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
    assert.equal(res.headers['set-cookie'], undefined);
  }
  assert.deepEqual(wrong.body, unknown.body);
});

test('inactive account: 403 only with the correct password, otherwise the generic 401', async () => {
  const app = createApp({ db: makeFakeDb(), config: makeConfig() });
  const right = await post(app, '/login').send({ email: 'doctor@example.com', password: PASSWORD });
  assert.equal(right.status, 403);
  assert.equal(right.body.error.code, 'ACCOUNT_INACTIVE');
  assert.equal(right.headers['set-cookie'], undefined);
  const wrong = await post(app, '/login').send({ email: 'doctor@example.com', password: 'nope-nope' });
  assert.equal(wrong.status, 401);
});

test('login requires email and password', async () => {
  const res = await post(createApp({ db: makeFakeDb(), config: makeConfig() }), '/login').send({ email: '  ' });
  assert.equal(res.status, 400);
  assert.deepEqual(Object.keys(res.body.error.fields).sort(), ['email', 'password']);
});

test('logout clears the cookie', async () => {
  const res = await post(createApp({ db: makeFakeDb(), config: makeConfig() }), '/logout');
  assert.equal(res.status, 204);
  assert.match(res.headers['set-cookie'][0], new RegExp(`^${COOKIE_NAME}=;`));
});

// ---------- الحماية والأدوار ----------

test('GET /me requires a valid session and returns only safe fields', async () => {
  const app = createApp({ db: makeFakeDb(), config: makeConfig() });
  assert.equal((await request(app).get('/api/auth/me')).status, 401);

  const agent = request.agent(app);
  await agent.post('/api/auth/login').set('Origin', ORIGIN).send({ email: 'admin@example.com', password: PASSWORD });
  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.deepEqual(me.body, { user: { id: 3, email: 'admin@example.com', role: 'admin', firstName: null, lastName: null } });
});

function guardedApp(db, config, roles) {
  const app = express();
  app.use(cookieParser());
  app.get('/guarded', createAuthenticate({ db, auth: config.auth }), requireRole(...roles), (req, res) => res.json({ role: req.user.role }));
  app.use(errorHandler);
  return app;
}

test('authenticate rejects missing, tampered, expired and alg:none tokens', async () => {
  const db = makeFakeDb();
  const config = makeConfig();
  const app = guardedApp(db, config, ['patient']);
  const good = signToken(1, config.auth);
  const withCookie = (token) => request(app).get('/guarded').set('Cookie', `${COOKIE_NAME}=${token}`);

  assert.equal((await withCookie(good)).status, 200);
  assert.equal((await request(app).get('/guarded')).status, 401);
  assert.equal((await withCookie(good.slice(0, -2) + (good.endsWith('A') ? 'BB' : 'AA'))).status, 401);
  assert.equal((await withCookie(jwt.sign({}, config.auth.jwtSecret, { algorithm: 'HS256', subject: '1', expiresIn: -10 }))).status, 401);
  assert.equal((await withCookie(jwt.sign({}, 'y'.repeat(40), { algorithm: 'HS256', subject: '1', expiresIn: 60 }))).status, 401);
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"1"}').toString('base64url')}.`;
  assert.equal((await withCookie(none)).status, 401);
});

test('requireRole uses the role currently in the database, not the token, and deactivation ends access', async () => {
  const db = makeFakeDb();
  const config = makeConfig();
  const token = signToken(1, config.auth);
  const get = (roles) => request(guardedApp(db, config, roles)).get('/guarded').set('Cookie', `${COOKIE_NAME}=${token}`);

  assert.equal((await get(['admin'])).status, 403);
  assert.equal((await get(['patient'])).status, 200);

  db.users[0].role = 'doctor';
  assert.equal((await get(['patient'])).status, 403);
  assert.equal((await get(['doctor', 'admin'])).status, 200);

  db.users[0].is_active = false;
  assert.equal((await get(['doctor'])).status, 401);
});

// ---------- CSRF والمعدّل ----------

test('state-changing requests with a foreign Origin are rejected; allowed, same-origin and missing Origin pass', async () => {
  const app = createApp({ db: makeFakeDb(), config: makeConfig() });
  const body = { email: 'patient@example.com', password: PASSWORD };
  const login = (origin) => {
    const req = request(app).post('/api/auth/login');
    return (origin === undefined ? req : req.set('Origin', origin)).send(body);
  };
  assert.equal((await login('https://evil.example')).status, 403);
  assert.equal((await login('null')).status, 403);
  assert.equal((await login(ORIGIN)).status, 200);
  assert.equal((await login(undefined)).status, 200);
  const same = await request(app).post('/api/auth/login').set('Host', 'clinic.test').set('Origin', 'http://clinic.test').send(body);
  assert.equal(same.status, 200);
  const logout = await request(app).post('/api/auth/logout').set('Origin', 'https://evil.example');
  assert.equal(logout.status, 403);
});

test('login and register are rate limited separately', async (t) => {
  const config = makeConfig({ rateLimit: { windowMs: 60000, max: 2 } });
  const app = createApp({ db: makeFakeDb(), config });
  const attempt = () => post(app, '/login').send({ email: 'patient@example.com', password: 'wrong-password' });
  assert.equal((await attempt()).status, 401);
  assert.equal((await attempt()).status, 401);
  const limited = await attempt();
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error.code, 'RATE_LIMITED');
  assert.equal((await post(app, '/register').send({})).status, 400, 'register has its own counter');
});

test('successful logins do not count toward the login limit; failed attempts still do', async () => {
  const config = makeConfig({ rateLimit: { windowMs: 60000, max: 2 } });
  const app = createApp({ db: makeFakeDb(), config });
  const good = () => post(app, '/login').send({ email: 'patient@example.com', password: PASSWORD });
  const bad = () => post(app, '/login').send({ email: 'patient@example.com', password: 'wrong-password' });
  for (let i = 0; i < 5; i += 1) assert.equal((await good()).status, 200, `successful login ${i + 1} is not limited`);
  assert.equal((await bad()).status, 401);
  assert.equal((await good()).status, 200, 'a success between failures does not use the budget');
  assert.equal((await bad()).status, 401);
  const limited = await bad();
  assert.equal(limited.status, 429, 'the third failed attempt hits the limit of 2');
  assert.equal(limited.body.error.code, 'RATE_LIMITED');
});
