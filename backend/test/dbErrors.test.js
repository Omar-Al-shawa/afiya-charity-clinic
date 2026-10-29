import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toAppError } from '../src/errors/dbErrors.js';

const MAPPED = [
  ...Array.from({ length: 12 }, (_, i) => `AF${102 + i}`).filter((c) => c !== 'AF113'),
  'AF120', 'AF121', 'AF122',
];

test('every application SQLSTATE except AF113 maps to an Arabic message', () => {
  assert.equal(MAPPED.length, 14);
  for (const code of MAPPED) {
    const mapped = toAppError(Object.assign(new Error('x'), { code }));
    assert.ok(mapped, code);
    assert.equal(mapped.code, code);
    assert.match(mapped.message, /[؀-ۿ]/);
    assert.ok(mapped.status >= 400 && mapped.status < 500);
  }
});

test('AF113 and non-application codes are not mapped', () => {
  for (const code of ['AF113', '23505', 'ECONNREFUSED', 'toString', undefined]) {
    assert.equal(toAppError(Object.assign(new Error('x'), { code })), null);
  }
});
