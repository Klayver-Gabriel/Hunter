import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefault } from '../../src/domain/character.js';
import { createStore } from '../../src/application/store.js';
test('comandos publicam um snapshot imutável e recalculam HP antes de notificar', () => {
  const store = createStore(createDefault()), previous = store.getState(); let notifications = 0;
  store.subscribe(c => { notifications++; assert.equal(c.resources[0].max, 12); });
  store.dispatch('setAttribute', { key: 'con', value: 14 });
  assert.equal(previous.attributes.con, 10);
  assert.equal(store.getState().attributes.con, 14);
  assert.equal(notifications, 1);
  assert.throws(() => { store.getState().attributes.con = 20; });
});
test('expertise implica proficiência; comandos inválidos não publicam estado', () => {
  const store = createStore(createDefault());
  store.dispatch('setSkill', { key: 'acrobatics', field: 'expertise', value: true });
  assert.equal(store.getState().dnd.skills.acrobatics.proficient, true);
  store.dispatch('setSkill', { key: 'acrobatics', field: 'proficient', value: false });
  assert.equal(store.getState().dnd.skills.acrobatics.expertise, false);
  const before = store.getState();
  assert.throws(() => store.dispatch('setField', { path: '__proto__.polluted', value: true }));
  assert.equal(store.getState(), before);
});
test('remoção de equipamento limpa referências', () => {
  const store = createStore(createDefault()), id = store.getState().equipment.weaponId;
  store.dispatch('deleteWeapon', { id });
  assert.equal(store.getState().equipment.weaponId, null);
  assert.equal(store.getState().masteries[id], undefined);
});
