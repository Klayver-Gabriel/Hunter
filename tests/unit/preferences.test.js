import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreferences, PREFERENCES_KEY } from '../../src/infrastructure/preferences.js';
test('preferências validam tema e persistem separadamente', () => {
  const values = new Map();
  const p = createPreferences(() => ({ getItem: k => values.get(k), setItem: (k,v) => values.set(k,v) }));
  assert.equal(p.load().value.theme, null);
  assert.equal(p.save('light').ok, true);
  assert.equal(p.load().value.theme, 'light');
  assert.equal(p.save('pergaminho').ok, false);
  assert.equal(values.size, 1);
  values.set(PREFERENCES_KEY, '{broken');
  assert.equal(p.load().value.theme, null);
});
test('preferências reportam acesso negado sem impedir a aplicação', () => {
  const p = createPreferences(() => { throw Error('denied'); });
  assert.equal(p.load().ok, false);
  assert.equal(p.save('dark').ok, false);
});
