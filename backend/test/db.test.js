import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/pool.js';
import { runDuePendingChanges } from '../src/db/pendingChanges.js';

test('loadConfig requires DB and JWT settings and applies defaults', () => {
  assert.throws(() => loadConfig({}), /DB_NAME, DB_USER, JWT_SECRET/);
  const base = { DB_NAME: 'n', DB_USER: 'u' };
  assert.throws(() => loadConfig({ ...base, JWT_SECRET: 'short' }), /at least 32/);
  const secret = 's'.repeat(32);
  const config = loadConfig({ ...base, JWT_SECRET: secret });
  assert.deepEqual(config.db, { host: 'localhost', port: 5432, database: 'n', user: 'u', password: undefined });
  assert.equal(config.port, 3001);
  assert.deepEqual(config.allowedOrigins, ['http://localhost:5173', 'http://127.0.0.1:5173']);
  assert.equal(config.auth.tokenTtlSeconds, 8 * 3600);
  assert.equal(config.auth.cookieSecure, false);
  assert.equal(loadConfig({ ...base, JWT_SECRET: secret, NODE_ENV: 'production' }).auth.cookieSecure, true);
  assert.deepEqual(loadConfig({ ...base, JWT_SECRET: secret, NODE_ENV: 'production' }).allowedOrigins, []);
  assert.throws(() => loadConfig({ ...base, JWT_SECRET: secret, PORT: 'abc' }), /PORT/);
  assert.throws(() => loadConfig({ ...base, JWT_SECRET: secret, ALLOWED_ORIGINS: 'nope' }), /ALLOWED_ORIGINS/);
});

test('createDb sets string parsers for DATE/TIME without connecting', async () => {
  const db = createDb({ host: 'localhost', port: 1, database: 'x', user: 'x' });
  assert.equal(pg.types.getTypeParser(1082)('2026-10-28'), '2026-10-28');
  assert.equal(pg.types.getTypeParser(1083)('09:00:00'), '09:00:00');
  await db.close();
});

function stubDb(results) {
  const queue = [...results];
  const calls = [];
  return {
    calls,
    withTransaction: async (fn) =>
      fn({
        query: async (sql) => {
          calls.push(sql);
          return { rows: [{ change_id: queue.shift() }] };
        },
      }),
  };
}

test('runDuePendingChanges repeats until NULL and only calls execute_due_pending_change()', async () => {
  const db = stubDb([5, 6, 6, null]);
  assert.deepEqual(await runDuePendingChanges(db), [5, 6, 6]);
  assert.equal(db.calls.length, 4);
  for (const sql of db.calls) assert.match(sql, /execute_due_pending_change\(\)/);
  assert.ok(db.calls.every((sql) => !/execute_next/.test(sql)));
});

test('runDuePendingChanges returns [] when nothing is due and stops at the iteration cap', async () => {
  assert.deepEqual(await runDuePendingChanges(stubDb([null])), []);
  await assert.rejects(runDuePendingChanges(stubDb([1, 1, 1, 1]), { maxIterations: 3 }), /did not finish/);
});

test('loadConfig supports DATABASE_URL without DB_NAME/DB_USER and keeps the DB_* path unchanged', () => {
  const secret = 's'.repeat(32);
  const url = 'postgresql://hostuser:hostpass@db.example.test:5432/hosted';
  const config = loadConfig({ JWT_SECRET: secret, DATABASE_URL: url });
  assert.deepEqual(config.db, { connectionString: url, database: 'hosted' });
  assert.equal(loadConfig({ JWT_SECRET: secret, DATABASE_URL: url, DATABASE_SSL: 'true' }).db.ssl, true);
  assert.deepEqual(loadConfig({ JWT_SECRET: secret, DATABASE_URL: url, DATABASE_SSL: 'no-verify' }).db.ssl, { rejectUnauthorized: false });
  assert.throws(() => loadConfig({ DATABASE_URL: url }), /JWT_SECRET/);
  assert.throws(() => loadConfig({ JWT_SECRET: secret, DATABASE_URL: url, DATABASE_SSL: 'maybe' }), /DATABASE_SSL/);
  // الرابط غير الصالح يُرفض دون إظهار قيمته
  assert.throws(() => loadConfig({ JWT_SECRET: secret, DATABASE_URL: 'mysql://u:secret@h/d' }), (err) => {
    assert.match(err.message, /DATABASE_URL/);
    assert.doesNotMatch(err.message, /secret/);
    return true;
  });
  // بلا DATABASE_URL يبقى DB_NAME وDB_USER مطلوبين
  assert.throws(() => loadConfig({ JWT_SECRET: secret }), /DB_NAME, DB_USER/);
});

test('loadConfig parses TRUST_PROXY as a hop count and keeps it disabled by default', () => {
  const base = { DB_NAME: 'n', DB_USER: 'u', JWT_SECRET: 's'.repeat(32) };
  assert.equal(loadConfig(base).trustProxy, false);
  assert.equal(loadConfig({ ...base, TRUST_PROXY: '1' }).trustProxy, 1);
  assert.equal(loadConfig({ ...base, TRUST_PROXY: '0' }).trustProxy, false);
  assert.throws(() => loadConfig({ ...base, TRUST_PROXY: 'true' }), /TRUST_PROXY/);
  assert.throws(() => loadConfig({ ...base, TRUST_PROXY: '-1' }), /TRUST_PROXY/);
});
