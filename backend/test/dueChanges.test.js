import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { createApp } from '../src/app.js';

const config = {
  allowedOrigins: [],
  auth: { jwtSecret: 'x'.repeat(40), tokenTtlSeconds: 60, bcryptCost: 4, cookieSecure: false, rateLimit: { windowMs: 60000, max: 1000 } },
};

// أحداث مرتّبة: 'due' عند استدعاء المعالج و'db' عند أي استعلام؛ كل استعلام يعيد صفوفاً فارغة
function setup({ processDueChanges } = {}) {
  const events = [];
  const db = {
    query: async () => {
      events.push('db');
      return { rows: [] };
    },
    withTransaction: async () => {
      events.push('db');
      throw new Error('unexpected transaction');
    },
    ping: async () => {},
  };
  const due = processDueChanges ?? (async () => {
    events.push('due');
  });
  return { events, app: createApp({ db, config, processDueChanges: due }) };
}

// مسارات تعتمد على حالة التغييرات المعلّقة: المعالج يُستدعى مرة واحدة وقبل أي استعلام أو مصادقة
const DEPENDENT = [
  ['get', '/api/specialties', 200],
  ['get', '/api/doctors', 200],
  ['get', '/api/doctors/5/availability', 404],
  ['get', '/api/appointments', 401],
  ['get', '/api/doctor/schedule', 401],
  ['get', '/api/admin/specialties', 401], // موجّه الكتالوج الإداري
  ['get', '/api/admin/patients', 401], // موجّه العروض الإدارية: الحارس مُركَّب مرة واحدة قبل الموجّهين
  ['post', '/api/auth/login', 401],
  ['get', '/api/auth/me', 401],
];

for (const [method, path, status] of DEPENDENT) {
  test(`${method.toUpperCase()} ${path} processes due changes first, exactly once`, async () => {
    const { app, events } = setup();
    const req = request(app)[method](path);
    const res = await (method === 'post' ? req.send({ email: 'a@example.com', password: 'x' }) : req);
    assert.equal(res.status, status);
    assert.equal(events.filter((e) => e === 'due').length, 1);
    assert.equal(events[0], 'due', 'the processor runs before any database query or authentication');
  });
}

test('independent routes never invoke the processor', async () => {
  const { app, events } = setup();
  assert.equal((await request(app).get('/api/health')).status, 200);
  assert.equal((await request(app).post('/api/contact').send({})).status, 503);
  assert.equal((await request(app).post('/api/auth/register').send({})).status, 400);
  assert.equal((await request(app).post('/api/auth/logout')).status, 204);
  assert.equal((await request(app).post('/api/auth/change-password').send({})).status, 401);
  assert.equal((await request(app).get('/api/patient/profile')).status, 401);
  assert.deepEqual(events, [], 'no processor call and no database query');
});

test('a processor failure returns 503 TRY_AGAIN without running the route, leaking details, or using stale data', async (t) => {
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args));
  const failures = [
    [Object.assign(new Error('secret-detail postgres://user:pw@host/db'), { code: 'ECONNRESET' }), 'ECONNRESET'],
    [new Error('secret-detail without a code'), 'UNKNOWN'],
    [Object.assign(new Error('secret-detail'), { code: 'bad code with spaces and secrets' }), 'UNKNOWN'],
  ];
  for (const [failure, logged] of failures) {
    const { app, events } = setup({
      processDueChanges: async () => {
        throw failure;
      },
    });
    for (const [method, path] of [['get', '/api/doctors'], ['post', '/api/auth/login'], ['get', '/api/admin/patients']]) {
      const res = await request(app)[method](path).send(method === 'post' ? { email: 'a@example.com', password: 'x' } : undefined);
      assert.equal(res.status, 503);
      assert.equal(res.body.error.code, 'TRY_AGAIN');
      assert.doesNotMatch(JSON.stringify(res.body), /secret|postgres|pw@/);
      assert.deepEqual(events, [], 'the route and the database were not reached');
    }
    assert.ok(errors.length > 0);
    const [, code] = errors.at(-1);
    assert.equal(code, logged);
  }
  assert.doesNotMatch(JSON.stringify(errors), /secret|postgres|pw@/);
});

test('without an injected processor the guard is a no-op', async () => {
  const events = [];
  const db = { query: async () => (events.push('db'), { rows: [] }), ping: async () => {} };
  const res = await request(createApp({ db, config })).get('/api/specialties');
  assert.equal(res.status, 200);
  assert.deepEqual(events, ['db']);
});

test('server.js injects the real runDuePendingChanges processor into createApp (production wiring)', () => {
  const source = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ runDuePendingChanges \} from '\.\/db\/pendingChanges\.js'/);
  assert.match(source, /const processDueChanges = \(\) => runDuePendingChanges\(db\);/);
  assert.match(source, /createApp\(\{[^}]*\bprocessDueChanges\b[^}]*\}\)/);
});
