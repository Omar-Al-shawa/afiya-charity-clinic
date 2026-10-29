import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { AppError } from '../src/errors/AppError.js';

const config = {
  allowedOrigins: [],
  auth: { jwtSecret: 'x'.repeat(40), tokenTtlSeconds: 60, bcryptCost: 4, cookieSecure: false, rateLimit: { windowMs: 60000, max: 100 } },
};
const dbUp = { ping: async () => {} };
const dbDown = {
  ping: async () => {
    throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432 secret-detail'), { code: 'ECONNREFUSED' });
  },
};

test('GET /api/health returns 200 when the database is reachable', async () => {
  const res = await request(createApp({ db: dbUp, config })).get('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok', db: 'up' });
  assert.equal(res.headers['x-powered-by'], undefined);
  assert.ok(res.headers['x-content-type-options']);
});

test('GET /api/health returns 503 without leaking error details', async (t) => {
  t.mock.method(console, 'error', () => {});
  const res = await request(createApp({ db: dbDown, config })).get('/api/health');
  assert.equal(res.status, 503);
  assert.deepEqual(res.body, { status: 'error', db: 'down' });
});

test('unknown routes return a JSON Arabic 404', async () => {
  const res = await request(createApp({ db: dbUp, config })).get('/api/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
  assert.match(res.body.error.message, /غير موجود/);
});

test('malformed JSON returns 400 INVALID_JSON', async () => {
  const res = await request(createApp({ db: dbUp, config }))
    .post('/api/health')
    .set('Content-Type', 'application/json')
    .send('{bad');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_JSON');
});

function appThrowing(err) {
  const app = express();
  app.get('/boom', () => {
    throw err;
  });
  app.get('/boom-async', async () => {
    throw err;
  });
  app.use(errorHandler);
  return app;
}

test('error handler maps AF SQLSTATE errors to Arabic messages and status', async () => {
  const res = await request(appThrowing(Object.assign(new Error('x'), { code: 'AF107' }))).get('/boom-async');
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'AF107');
  assert.match(res.body.error.message, /[؀-ۿ]/);
});

test('error handler passes AppError through', async () => {
  const res = await request(appThrowing(new AppError(403, 'FORBIDDEN', 'ممنوع'))).get('/boom');
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { error: { code: 'FORBIDDEN', message: 'ممنوع' } });
});

test('unexpected errors (including AF113) return a generic 500 without details', async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const err of [new Error('relation "users" does not exist'), Object.assign(new Error('iso'), { code: 'AF113' })]) {
    const res = await request(appThrowing(err)).get('/boom');
    assert.equal(res.status, 500);
    assert.equal(res.body.error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(res.body), /relation|iso/);
  }
});
