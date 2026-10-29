import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import {
  ADMIN_BCRYPT_COST,
  ADMIN_PASSWORD_MIN,
  AdminSetupError,
  createAdminAccount,
  validateAdminInput,
} from '../src/auth/adminSetup.js';

const PASSWORD = 'correct horse battery 9';

// قاعدة وهمية: لا اتصال بأي قاعدة حقيقية؛ تسجّل كل استعلام ومعامل
function makeDb({ existingAdmin = false, insertError = null } = {}) {
  const log = { queries: [], inserts: [], transactions: 0 };
  return {
    log,
    query: async (sql, params = []) => {
      log.queries.push({ sql, params });
      return { rows: existingAdmin ? [{ '?column?': 1 }] : [] };
    },
    withTransaction: async (fn) => {
      log.transactions += 1;
      return fn({
        query: async (sql, params) => {
          log.inserts.push({ sql, params });
          if (insertError) throw insertError;
          return { rows: [{ user_id: 7 }] };
        },
      });
    },
  };
}

test('creates the admin with a bcrypt hash of the password, role fixed in SQL, and a normalized email', async () => {
  const db = makeDb();
  const result = await createAdminAccount(db, { email: '  Admin@Example.COM ', password: PASSWORD, bcryptCost: 4 });
  assert.deepEqual(result, { userId: 7, email: 'admin@example.com' });
  assert.equal(db.log.transactions, 1);
  assert.equal(db.log.inserts.length, 1);
  const [{ sql, params }] = db.log.inserts;
  assert.match(sql, /INSERT INTO public\.users \(email, password_hash, role\) VALUES \(\$1, \$2, 'admin'\)/);
  assert.equal(params.length, 2);
  assert.equal(params[0], 'admin@example.com');
  assert.notEqual(params[1], PASSWORD);
  assert.equal(bcrypt.getRounds(params[1]), 4);
  assert.equal(await bcrypt.compare(PASSWORD, params[1]), true);
  assert.equal(await bcrypt.compare('another password 1', params[1]), false);
});

test('the default bcrypt cost is 12', async () => {
  assert.equal(ADMIN_BCRYPT_COST, 12);
  const db = makeDb();
  await createAdminAccount(db, { email: 'admin@example.com', password: PASSWORD });
  assert.equal(bcrypt.getRounds(db.log.inserts[0].params[1]), 12);
});

test('refuses when an administrator already exists, without hashing or inserting', async () => {
  const db = makeDb({ existingAdmin: true });
  await assert.rejects(
    createAdminAccount(db, { email: 'admin@example.com', password: PASSWORD, bcryptCost: 4 }),
    (err) => err instanceof AdminSetupError && err.code === 'ADMIN_EXISTS',
  );
  assert.match(db.log.queries[0].sql, /role = 'admin'/);
  assert.equal(db.log.transactions, 0);
  assert.equal(db.log.inserts.length, 0);
  // لا استعلام تعديل أو حذف على الإطلاق
  assert.ok(db.log.queries.every(({ sql }) => !/\b(UPDATE|DELETE)\b/i.test(sql)));
});

test('a unique-violation race is handled: users_one_admin and users_email_key map to clean errors', async () => {
  const oneAdmin = makeDb({ insertError: Object.assign(new Error('dup'), { code: '23505', constraint: 'users_one_admin' }) });
  await assert.rejects(
    createAdminAccount(oneAdmin, { email: 'admin@example.com', password: PASSWORD, bcryptCost: 4 }),
    (err) => err instanceof AdminSetupError && err.code === 'ADMIN_EXISTS',
  );
  const emailTaken = makeDb({ insertError: Object.assign(new Error('dup'), { code: '23505', constraint: 'users_email_key' }) });
  await assert.rejects(
    createAdminAccount(emailTaken, { email: 'admin@example.com', password: PASSWORD, bcryptCost: 4 }),
    (err) => err instanceof AdminSetupError && err.code === 'EMAIL_TAKEN',
  );
});

test('other database errors are rethrown unchanged (the CLI prints only a safe code)', async () => {
  const failure = Object.assign(new Error('connection lost'), { code: '08006' });
  await assert.rejects(
    createAdminAccount(makeDb({ insertError: failure }), { email: 'admin@example.com', password: PASSWORD, bcryptCost: 4 }),
    (err) => err === failure,
  );
});

test('invalid email and weak passwords are rejected before any database access', async () => {
  const bad = [
    { email: '', password: PASSWORD },
    { email: 'not-an-email', password: PASSWORD },
    { email: 'admin@example.com\nBcc:x@y.com', password: PASSWORD },
    { email: 'admin@example.com', password: '' },
    { email: 'admin@example.com', password: 'a'.repeat(ADMIN_PASSWORD_MIN - 1) },
    { email: 'admin@example.com', password: 'a'.repeat(73) },
    { email: 'admin@example.com', password: 'ع'.repeat(37) }, // 74 بايت
    { email: 'admin@example.com', password: 123456789012 },
  ];
  for (const input of bad) {
    const db = makeDb();
    await assert.rejects(createAdminAccount(db, { ...input, bcryptCost: 4 }), (err) => {
      assert.ok(err instanceof AdminSetupError);
      assert.equal(err.code, 'INVALID_INPUT');
      return true;
    }, JSON.stringify(input));
    assert.equal(db.log.queries.length, 0);
    assert.equal(db.log.transactions, 0);
  }
  assert.equal(ADMIN_PASSWORD_MIN, 12);
});

test('the minimum is 12 characters (counted as characters, not bytes) and surrounding spaces are kept', () => {
  assert.equal(validateAdminInput({ email: 'a@example.com', password: 'a'.repeat(12) }).valid, true);
  assert.equal(validateAdminInput({ email: 'a@example.com', password: 'ع'.repeat(12) }).valid, true);
  assert.equal(validateAdminInput({ email: 'a@example.com', password: ' '.repeat(11) }).valid, false);
  assert.equal(validateAdminInput({ email: 'a@example.com', password: ` ${'a'.repeat(12)} ` }).values.password, ` ${'a'.repeat(12)} `);
});

test('the plaintext password never appears in queries, results, or error messages', async () => {
  const secret = 'Zx9-unique-plaintext-secret-QQ';
  const db = makeDb();
  const result = await createAdminAccount(db, { email: 'admin@example.com', password: secret, bcryptCost: 4 });
  assert.ok(!JSON.stringify([db.log, result]).includes(secret));

  for (const failing of [makeDb({ existingAdmin: true }), makeDb({ insertError: Object.assign(new Error('x'), { code: '23505', constraint: 'users_one_admin' }) })]) {
    const err = await createAdminAccount(failing, { email: 'admin@example.com', password: secret, bcryptCost: 4 }).catch((e) => e);
    assert.ok(!JSON.stringify({ message: err.message, fields: err.fields }).includes(secret));
  }
  const invalid = await createAdminAccount(makeDb(), { email: 'bad', password: `${secret}`.slice(0, 5) }).catch((e) => e);
  assert.ok(!JSON.stringify({ message: invalid.message, fields: invalid.fields }).includes(secret.slice(0, 5)));
});
