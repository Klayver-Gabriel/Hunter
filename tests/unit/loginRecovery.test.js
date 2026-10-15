import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoginRecovery, LOGIN_RECOVERY_KEY } from '../../src/infrastructure/loginRecovery.js';

function storageFixture() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
test('login recovery is isolated by account and removed after recovery or expiry', () => {
  let time = 1000; const storage = storageFixture(), recovery = createLoginRecovery(() => storage, () => time);
  const checkpoint = { version: 1, document: { private: true } };
  recovery.save('A', checkpoint);
  assert.equal(recovery.load('B'), null); recovery.clear('B'); assert.deepEqual(recovery.load('A'), checkpoint);
  recovery.clear('A'); assert.equal(storage.getItem(LOGIN_RECOVERY_KEY), null);
  recovery.save('A', checkpoint); time += 15 * 60 * 1000; assert.equal(recovery.load('A'), null);
  assert.equal(storage.getItem(LOGIN_RECOVERY_KEY), null);
});
test('unavailable recovery storage refuses to discard pending edits before redirect', () => {
  const recovery = createLoginRecovery(() => { throw Error('storage blocked'); });
  assert.throws(() => recovery.save('A', {}), /blocked/); assert.equal(recovery.load('A'), null);
  assert.doesNotThrow(() => recovery.clear('A'));
});
