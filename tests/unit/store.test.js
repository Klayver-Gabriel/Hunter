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

test('renomear altera apenas o rótulo e publica aparência imutável', () => {
  const store = createStore(createDefault());
  const character = store.getState(), previous = store.getDocument().sheetAppearance;
  let notifications = 0;
  store.subscribe((state, scope) => {
    notifications++; assert.equal(state, character); assert.equal(scope, 'renameComponent');
  });
  store.renameComponent('resource:hp', '  Vitalidade  ');
  assert.equal(store.getState(), character);
  assert.deepEqual(previous.components, {});
  assert.deepEqual(store.getDocument().sheetAppearance.components['resource:hp'], { label: 'Vitalidade' });
  assert.throws(() => { store.getDocument().sheetAppearance.components['resource:hp'].label = 'Outro'; });
  assert.equal(store.renameComponent('resource:hp', 'Vitalidade'), false);
  assert.equal(notifications, 1);
  for (const label of ['', '   ', 'x'.repeat(121), undefined, { label: 'Nome', x: 100 }]) {
    assert.throws(() => store.renameComponent('resource:hp', label));
  }
  assert.throws(() => store.renameComponent('__proto__', 'Nome'));
  assert.equal(notifications, 1);
});

test('restaurar o nome preserva cores e posições legadas', () => {
  const store = createStore(createDefault());
  const document = structuredClone(store.getDocument());
  document.sheetAppearance.components['resource:hp'] = { label: 'Vida', colors: { dark: { accent: '#123456' } } };
  document.sheetAppearance.layouts.desktop['resource:hp'] = { parent: 'root', x: 0, y: 0, w: 50, h: 50 };
  store.replaceDocument(document);
  store.renameComponent('resource:hp', null);
  assert.deepEqual(store.getDocument().sheetAppearance.components['resource:hp'], { colors: { dark: { accent: '#123456' } } });
  assert.deepEqual(store.getDocument().sheetAppearance.layouts, document.sheetAppearance.layouts);
  store.renameComponent('attribute:con', 'Vigor');
  store.renameComponent('attribute:con', null);
  assert.equal(store.getDocument().sheetAppearance.components['attribute:con'], undefined);
});
