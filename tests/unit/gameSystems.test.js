import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefault } from '../../src/domain/character.js';
import { createDefaultSystems, validateSystemProfile } from '../../src/domain/gameSystems.js';
import { createStore } from '../../src/application/store.js';
import { migrateDocument } from '../../src/infrastructure/migrations/document.js';

test('systems padrão identificam D&D e Tormenta e rejeitam perfis inválidos', () => {
  const systems = createDefaultSystems();
  assert.deepEqual(systems.map(system => system.title), ['D&D 5e', 'Tormenta20']);
  assert.equal(validateSystemProfile(systems[0]).config.skills.length, 18);
  assert.equal(validateSystemProfile(systems[1]).config.skills.length, 29);
  assert.throws(() => validateSystemProfile({ ...systems[0], config: { ...systems[0].config, skills: [{ ...systems[0].config.skills[0], ability: 'invalid' }] } }));
});

test('migração vincula a tabela ativa ao sistema correspondente e guarda diferenças por ficha', () => {
  const legacy = createDefault();
  delete legacy.systemId;
  delete legacy.systemOverrides;
  legacy.skillTables.activeId = 'tormenta20';
  legacy.skillTables.templates.tormenta20[0].name = 'Atletismo da mesa';
  legacy.dnd.skills.t20_atletismo = { proficient: true, expertise: false };
  const document = migrateDocument(legacy);
  assert.equal(document.character.systemId, 'tormenta20');
  assert.deepEqual(document.character.systemOverrides.skillsBySystem.tormenta20[0], {
    ...legacy.skillTables.templates.tormenta20[0]
  });
  assert.deepEqual(document.character.dnd.skills.t20_atletismo, { proficient: true, expertise: false });
});

test('herança atualiza padrões ao recarregar e mantém ajustes individuais da ficha', () => {
  const [dnd, tormenta] = createDefaultSystems();
  dnd.config.calculations.characteristics.push({ id: 'system_focus', name: 'Foco do sistema', base: 4 });
  dnd.config.attributes.labels.for = 'Poder';
  const character = createDefault();
  character.systemId = 'dnd5e';
  character.systemOverrides = {
    skillsBySystem: { dnd5e: [{ key: 'acrobatics', name: 'Acrobacia pessoal' }] },
    calculations: {
      rules: { 'resource:hp': { mode: 'manual', value: 27 } },
      characteristics: [{ id: 'system_focus', name: 'Foco pessoal' }]
    }
  };
  const store = createStore(migrateDocument(character));
  store.setSystemProfiles([dnd, tormenta]);
  assert.equal(store.getState().skillTables.templates.dnd5e.find(skill => skill.key === 'acrobatics').name, 'Acrobacia pessoal');
  assert.equal(store.getState().calculations.rules['resource:hp'].value, 27);
  assert.equal(store.getState().calculations.characteristics[0].name, 'Foco pessoal');
  assert.equal(store.getDocument().sheetAppearance.components['attribute:for'].label, 'Poder');

  const updated = structuredClone(dnd);
  updated.revision++;
  updated.config.skills.find(skill => skill.key === 'acrobatics').bonus = 5;
  updated.config.calculations.characteristics[0].base = 6;
  updated.config.calculations.characteristics.push({ id: 'system_stat', name: 'Vigor', base: 2 });
  updated.config.attributes.labels.for = 'Força do sistema';
  store.setSystemProfiles([updated, tormenta]);
  const inherited = store.getState();
  assert.equal(inherited.skillTables.templates.dnd5e.find(skill => skill.key === 'acrobatics').bonus, 5);
  assert.equal(inherited.skillTables.templates.dnd5e.find(skill => skill.key === 'acrobatics').name, 'Acrobacia pessoal');
  assert.equal(inherited.calculations.characteristics[0].name, 'Foco pessoal');
  assert.equal(inherited.calculations.characteristics[0].base, 6);
  assert.equal(inherited.calculations.characteristics[1].name, 'Vigor');
  assert.equal(store.getDocument().sheetAppearance.components['attribute:for'].label, 'Força do sistema');
  assert.equal(inherited.calculations.rules['resource:hp'].value, 27);
  const saved = store.getPersistentDocument();
  assert.equal(saved.character.systemId, 'dnd5e');
  assert.equal(saved.character.systemOverrides.profiles.dnd5e.skills.length, 1);
});

test('a troca de sistema usa os padrões escolhidos e guarda ajustes da ficha por sistema', () => {
  const [dnd, tormenta] = createDefaultSystems();
  tormenta.config.attributes.values.for = 14;
  tormenta.config.calculations.characteristics.push({ id: 't20_focus', name: 'Foco T20', base: 6 });
  const store = createStore(migrateDocument(createDefault()));
  store.setSystemProfiles([dnd, tormenta]);
  store.dispatch('setAttribute', { key: 'for', value: 16 });
  store.selectSystem('tormenta20');
  assert.equal(store.getState().attributes.for, 14);
  assert.equal(store.getState().calculations.characteristics.some(row => row.id === 't20_focus'), true);
  assert.equal(store.getState().skillTables.activeId, 'tormenta20');

  store.dispatch('setAttribute', { key: 'for', value: 12 });
  store.selectSystem('dnd5e');
  assert.equal(store.getState().attributes.for, 16);
  store.selectSystem('tormenta20');
  assert.equal(store.getState().attributes.for, 12);

  const saved = store.getPersistentDocument().character.systemOverrides.profiles;
  assert.equal(saved.dnd5e.attributes.for, 16);
  assert.equal(saved.tormenta20.attributes.for, 12);
  assert.notEqual(saved.dnd5e, saved.tormenta20);
});
