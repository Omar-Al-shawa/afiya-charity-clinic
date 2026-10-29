import { test } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { CONTACT_SUBJECT, createMailer } from '../src/services/mailer.js';

const config = {
  allowedOrigins: [],
  auth: { jwtSecret: 'x'.repeat(40), tokenTtlSeconds: 60, bcryptCost: 4, cookieSecure: false, rateLimit: { windowMs: 60000, max: 100 } },
};
const db = { ping: async () => {} };
const SMTP = {
  host: 'smtp.example.test',
  port: 587,
  user: 'mailer-user',
  password: 'S3cret-Pa55-word',
  from: 'clinic@example.test',
  recipient: 'management@example.test',
};
const VALID = { name: 'سارة أحمد', email: 'Sara@Example.com', subject: 'استفسار عن المواعيد', message: 'أرغب في الاستفسار عن مواعيد العيادة.' };

function fakeMailer() {
  const calls = [];
  return { calls, sendContact: async (values) => void calls.push(values) };
}
const post = (mailer, body, appConfig = config) =>
  request(createApp({ db, config: appConfig, mailer })).post('/api/contact').send(body);

test('valid request returns 200 { sent: true } and passes normalized values to the mailer', async () => {
  const mailer = fakeMailer();
  const res = await post(mailer, { name: '  سارة   أحمد ', email: ' Sara@Example.com ', subject: '  استفسار   عن  المواعيد ', message: '\n  سطر أول\r\nسطر ثانٍ\rسطر ثالث  \n', extra: 'ignored' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { sent: true });
  assert.deepEqual(mailer.calls, [{ name: 'سارة أحمد', email: 'sara@example.com', subject: 'استفسار عن المواعيد', message: 'سطر أول\nسطر ثانٍ\nسطر ثالث' }]);
});

test('the email is built with the fixed subject prefix plus the visitor subject, configured sender and recipient, and Reply-To only from the visitor', async () => {
  const jsonTransport = nodemailer.createTransport({ jsonTransport: true });
  let options;
  let info;
  const transport = {
    sendMail: async (opts) => {
      options = opts;
      info = await jsonTransport.sendMail(opts); // يركّب الرسالة فعلاً دون أي إرسال
    },
  };
  const res = await post(createMailer(SMTP, { transport }), VALID);
  assert.equal(res.status, 200);
  assert.equal(options.from, SMTP.from);
  assert.equal(options.to, SMTP.recipient);
  assert.equal(options.replyTo, 'sara@example.com');
  assert.equal(options.subject, `${CONTACT_SUBJECT}: استفسار عن المواعيد`);
  assert.equal(options.subject, 'رسالة جديدة من نموذج تواصل معنا: استفسار عن المواعيد');
  assert.equal(options.html, undefined);
  assert.match(options.text, /الاسم: سارة أحمد/);
  assert.match(options.text, /البريد الإلكتروني: sara@example\.com/);
  assert.match(options.text, /الموضوع: استفسار عن المواعيد/);
  assert.ok(options.text.includes(VALID.message));
  const composed = JSON.parse(info.message);
  assert.equal(composed.from.address, SMTP.from);
  assert.equal(composed.replyTo[0].address, 'sara@example.com');
  assert.equal(composed.subject, 'رسالة جديدة من نموذج تواصل معنا: استفسار عن المواعيد');
});

test('invalid name, email, subject, and message are rejected with 400 VALIDATION_ERROR and no mail is sent', async () => {
  const cases = [
    [{ ...VALID, name: '' }, 'name'],
    [{ ...VALID, name: 'س' }, 'name'],
    [{ ...VALID, name: 'Ali123' }, 'name'],
    [{ ...VALID, name: 'a'.repeat(101) }, 'name'],
    [{ ...VALID, name: 42 }, 'name'],
    [{ ...VALID, email: '' }, 'email'],
    [{ ...VALID, email: 'not-an-email' }, 'email'],
    [{ ...VALID, email: `${'a'.repeat(250)}@x.com` }, 'email'],
    [{ ...VALID, email: ['a@b.com'] }, 'email'],
    [{ ...VALID, subject: '' }, 'subject'],
    [{ ...VALID, subject: '   ' }, 'subject'],
    [{ ...VALID, subject: 'عن' }, 'subject'],
    [{ ...VALID, subject: 'م'.repeat(101) }, 'subject'],
    [{ ...VALID, subject: undefined }, 'subject'],
    [{ ...VALID, subject: 7 }, 'subject'],
    [{ ...VALID, message: '' }, 'message'],
    [{ ...VALID, message: '   ' }, 'message'],
    [{ ...VALID, message: 'قصيرة' }, 'message'],
    [{ ...VALID, message: null }, 'message'],
  ];
  for (const [body, field] of cases) {
    const mailer = fakeMailer();
    const res = await post(mailer, body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60));
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.fields[field], `${field} error expected`);
    assert.equal(mailer.calls.length, 0);
  }
  const mailer = fakeMailer();
  for (const body of [undefined, [], 'text']) {
    const res = await post(mailer, body);
    assert.equal(res.status, 400);
    assert.deepEqual(Object.keys(res.body.error.fields).sort(), ['email', 'message', 'name', 'subject']);
  }
});

test('header injection and control characters are rejected', async () => {
  const bodies = [
    { ...VALID, name: 'Ali\r\nBcc: attacker@example.com' },
    { ...VALID, name: 'Ali\nSmith' },
    { ...VALID, name: 'Ali\u0000Smith' },
    { ...VALID, name: 'Ali\u{2028}Smith' },
    { ...VALID, name: 'Ali\u{2029}Smith' },
    { ...VALID, subject: 'موضوع\r\nBcc: attacker@example.com' },
    { ...VALID, subject: 'موضوع\nآخر' },
    { ...VALID, subject: 'موضوع\u0000آخر' },
    { ...VALID, subject: 'موضوع\u{2028}آخر' },
    { ...VALID, email: 'a@example.com\r\nBcc: attacker@example.com' },
    { ...VALID, email: 'a@example.com\n' },
    { ...VALID, email: 'a@example.com>\nBcc:x@y.com' },
    { ...VALID, message: 'رسالة طويلة بما يكفي\u0000مع محرف تحكم' },
    { ...VALID, message: 'رسالة طويلة بما يكفي\u001b[31m' },
    { ...VALID, message: 'رسالة طويلة بما يكفي\u0085وأخرى' },
    { ...VALID, message: 'رسالة طويلة بما يكفي\u{2028}وأخرى' },
  ];
  for (const body of bodies) {
    const mailer = fakeMailer();
    const res = await post(mailer, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(mailer.calls.length, 0);
  }
});

test('subject length limits: 3 to 100 characters, inner whitespace collapsed', async () => {
  const mailer = fakeMailer();
  assert.equal((await post(mailer, { ...VALID, subject: 'م'.repeat(3) })).status, 200);
  assert.equal((await post(mailer, { ...VALID, subject: ` ${'م'.repeat(100)} ` })).status, 200);
  assert.equal((await post(mailer, { ...VALID, subject: 'م'.repeat(101) })).status, 400);
  assert.equal((await post(mailer, { ...VALID, subject: 'م'.repeat(2) })).status, 400);
  assert.equal((await post(mailer, { ...VALID, subject: 'م  م' })).status, 200);
  assert.deepEqual(mailer.calls.map((call) => call.subject), ['م'.repeat(3), 'م'.repeat(100), 'م م']);
});

test('message length limits: 10 to 2000 characters, never truncated', async () => {
  const mailer = fakeMailer();
  const longest = 'ع'.repeat(2000);
  assert.equal((await post(mailer, { ...VALID, message: `  ${longest}\n` })).status, 200);
  assert.equal(mailer.calls[0].message, longest);
  assert.equal((await post(mailer, { ...VALID, message: 'ع'.repeat(10) })).status, 200);
  assert.equal((await post(mailer, { ...VALID, message: 'ع'.repeat(2001) })).status, 400);
  assert.equal((await post(mailer, { ...VALID, message: 'ع'.repeat(9) })).status, 400);
  assert.equal(mailer.calls.length, 2);
});

test('SMTP failure returns 502 MAIL_DELIVERY_FAILED without leaking credentials, details, or visitor data', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const mailer = {
    sendContact: async () => {
      throw Object.assign(new Error(`Invalid login: 535 for ${SMTP.user} password ${SMTP.password} at ${SMTP.host}`), {
        code: 'EAUTH',
        response: `535 ${SMTP.password}`,
      });
    },
  };
  const res = await post(mailer, VALID);
  assert.equal(res.status, 502);
  assert.equal(res.body.error.code, 'MAIL_DELIVERY_FAILED');
  const forbidden = [SMTP.password, SMTP.user, SMTP.host, 'EAUTH', 'sara@example.com', VALID.message];
  const everything = JSON.stringify(res.body) + JSON.stringify(logged.mock.calls.map((c) => c.arguments));
  for (const secret of forbidden.filter((s) => s !== 'EAUTH')) assert.ok(!everything.includes(secret), `leaked: ${secret}`);
  assert.ok(!JSON.stringify(res.body).includes('EAUTH'));
  assert.deepEqual(logged.mock.calls[0].arguments, ['[contact] delivery failed:', 'EAUTH']);
});

test('an unexpected error code shape is logged as UNKNOWN, never verbatim', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const mailer = { sendContact: async () => Promise.reject(Object.assign(new Error('x'), { code: `bad ${SMTP.password}` })) };
  assert.equal((await post(mailer, VALID)).status, 502);
  assert.deepEqual(logged.mock.calls[0].arguments, ['[contact] delivery failed:', 'UNKNOWN']);
});

test('no mailer configured returns 503 CONTACT_UNAVAILABLE', async () => {
  for (const mailer of [null, undefined]) {
    const res = await post(mailer, VALID);
    assert.equal(res.status, 503);
    assert.equal(res.body.error.code, 'CONTACT_UNAVAILABLE');
  }
  const res = await request(createApp({ db, config })).post('/api/contact').send(VALID);
  assert.equal(res.status, 503);
});

test('rate limit: 5 requests per hour per IP, the 6th is 429', async () => {
  const app = createApp({ db, config, mailer: fakeMailer() });
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await request(app).post('/api/contact').send(VALID)).status, 200, `request ${i + 1}`);
  }
  const res = await request(app).post('/api/contact').send(VALID);
  assert.equal(res.status, 429);
  assert.equal(res.body.error.code, 'RATE_LIMITED');
});

test('the endpoint is public and does not require a cookie or a role', async () => {
  const res = await post(fakeMailer(), VALID);
  assert.equal(res.status, 200);
});

test('createMailer: null without SMTP; TLS is mandatory in the real transport settings', (t) => {
  assert.equal(createMailer(null), null);
  const created = [];
  t.mock.method(nodemailer, 'createTransport', (options) => {
    created.push(options);
    return { sendMail: async () => {} };
  });
  createMailer({ ...SMTP, port: 465 });
  createMailer({ ...SMTP, port: 587 });
  assert.equal(created[0].secure, true);
  assert.equal(created[0].requireTLS, false);
  assert.equal(created[1].secure, false);
  assert.equal(created[1].requireTLS, true);
  for (const options of created) {
    assert.deepEqual(options.auth, { user: SMTP.user, pass: SMTP.password });
    assert.equal(options.tls.minVersion, 'TLSv1.2');
    assert.ok(options.connectionTimeout > 0 && options.greetingTimeout > 0 && options.socketTimeout > 0);
  }
});

const ENV = { DB_NAME: 'n', DB_USER: 'u', JWT_SECRET: 's'.repeat(40) };
const SMTP_ENV = {
  SMTP_HOST: SMTP.host,
  SMTP_PORT: '587',
  SMTP_USER: SMTP.user,
  SMTP_PASSWORD: SMTP.password,
  SMTP_FROM: SMTP.from,
  CONTACT_RECIPIENT: SMTP.recipient,
};

test('config: SMTP is null when absent, complete when fully set, and an incomplete or invalid setup fails without leaking values', () => {
  assert.equal(loadConfig(ENV).smtp, null);
  assert.deepEqual(loadConfig({ ...ENV, ...SMTP_ENV }).smtp, SMTP);

  const { SMTP_PASSWORD, ...withoutPassword } = SMTP_ENV;
  assert.throws(() => loadConfig({ ...ENV, ...withoutPassword }), (err) => {
    assert.match(err.message, /Incomplete SMTP configuration, missing: SMTP_PASSWORD/);
    assert.ok(!err.message.includes(SMTP.user) && !err.message.includes(SMTP.host));
    return true;
  });
  assert.throws(() => loadConfig({ ...ENV, SMTP_HOST: 'h' }), /missing: SMTP_PORT, SMTP_USER/);
  assert.throws(() => loadConfig({ ...ENV, ...SMTP_ENV, SMTP_PORT: 'abc' }), /SMTP_PORT/);
  assert.throws(() => loadConfig({ ...ENV, ...SMTP_ENV, SMTP_PORT: '70000' }), /SMTP_PORT/);
  assert.throws(() => loadConfig({ ...ENV, ...SMTP_ENV, SMTP_FROM: 'Clinic <a@b.com>' }), /SMTP_FROM/);
  assert.throws(() => loadConfig({ ...ENV, ...SMTP_ENV, CONTACT_RECIPIENT: 'x' }), (err) => {
    assert.match(err.message, /CONTACT_RECIPIENT/);
    assert.ok(!err.message.includes(SMTP.password));
    return true;
  });
});
