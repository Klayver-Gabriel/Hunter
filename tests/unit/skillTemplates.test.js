import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefault } from '../../src/domain/character.js';
import { activeSkills } from '../../src/domain/skillTemplates.js';
import { displayName, componentCatalog } from '../../src/domain/componentCatalog.js';
import { createStore } from '../../src/application/store.js';
import { createSession } from '../../src/application/session.js';
import { migrateDocument } from '../../src/infrastructure/migrations/document.js';
import { createMemoryBackend, createSheetRepository, SHEET_KEY, BACKUP_KEY } from '../../src/infrastructure/sheetRepository.js';
import { skillBreakdown, attackBreakdown, armorClassBreakdown, initiativeBreakdown } from '../../src/auto_calc_engine/index.js';

test('trocar tabela preserva toda a mecânica, recursos, históricos e flags das duas tabelas', () => {
  const store = createStore(createDefault());
  store.dispatch('setAttribute', { key: 'for', value: 18 });
  store.dispatch('setResource', { id: 'hp', key: 'current', value: 3 });
  store.dispatch('setCalculationRule', { target: 'resource:atp', rule: { mode: 'progression', initial: '10', gain: '2', bonuses: [], policy: 'recorded' } });
  store.dispatch('setSkill', { key: 'acrobatics', field: 'expertise', value: true });
  store.dispatch('setSkill', { key: 't20_luta', field: 'proficient', value: true });
  const original = store.getState(); let snapshots = 0;
  store.subscribe(() => snapshots++);
  store.dispatch('switchSkillTemplate', { id: 'tormenta20' });
  assert.equal(activeSkills(store.getState()).length, 29);
  assert.equal(activeSkills(store.getState()).find(s => s.key === 't20_oficio').ability, 'int');
  for (const key of Object.keys(original).filter(key => !['meta', 'skillTables'].includes(key))) {
    assert.deepEqual(store.getState()[key], original[key], key);
  }
  for (const calculator of [attackBreakdown, armorClassBreakdown, initiativeBreakdown]) assert.deepEqual(calculator(store.getState()), calculator(original));
  assert.equal(skillBreakdown(store.getState(), activeSkills(store.getState()).find(s => s.key === 't20_luta')).total, 6);
  store.dispatch('switchSkillTemplate', { id: 'dnd5e' });
  assert.deepEqual(store.getState().skillTables, original.skillTables);
  assert.deepEqual(store.getState().dnd.skills, original.dnd.skills);
  assert.equal(snapshots, 2);
});

test('templates editáveis mantêm IDs, somam bônus uma vez e isolam perícias de mesmo nome', () => {
  const store = createStore(createDefault());
  const skills = structuredClone(store.getState().skillTables.templates.tormenta20);
  const acrobatics = skills.find(s => s.key === 't20_acrobacia');
  Object.assign(acrobatics, { name: 'Equilíbrio', ability: 'for', bonus: -1 });
  skills.push({ key: 't20_custom_alchemy', name: 'Ofício (Alquimista)', ability: 'int', bonus: 3 });
  store.dispatch('saveSkillTemplate', { id: 'tormenta20', skills });
  store.dispatch('setAttribute', { key: 'for', value: 16 });
  store.dispatch('setSkill', { key: 't20_acrobacia', field: 'expertise', value: true });
  store.dispatch('saveBuff', { data: { title: 'Equilíbrio', skill: 't20_acrobacia', skillBonus: 2 } });
  store.dispatch('saveBuff', { data: { title: 'Somente D&D', skill: 'acrobatics', skillBonus: 20 } });
  const weapon = store.getState().library.weapons[0];
  store.dispatch('saveWeapon', { id: weapon.id, data: { ...weapon, title: weapon.name, masteryUnlocks: '1|Treino|skill.t20_acrobacia:3' } });
  const breakdown = skillBreakdown(store.getState(), acrobatics);
  assert.deepEqual(breakdown, { ability: 3, proficiency: 4, external: 2, mastery: 3, manual: -1, total: 11, profMultiplier: 2 });
  assert.equal(store.getState().skillTables.templates.dnd5e.find(s => s.key === 'acrobatics').name, 'Acrobacia');
  assert.equal(store.getState().dnd.skills.t20_custom_alchemy.proficient, false);
  assert.throws(() => { store.getState().skillTables.templates.tormenta20[0].name = 'Mutação'; });
  store.dispatch('saveSkillTemplate', { id: 'tormenta20', skills: [] });
  assert.equal(store.getState().dnd.skills.t20_custom_alchemy, undefined);
  assert.equal(store.getState().buffs.length, 2);
});

test('tabelas inválidas nunca publicam snapshot, inclusive templates inativos importados', () => {
  const store = createStore(createDefault()), original = store.getDocument(); let notifications = 0;
  store.subscribe(() => notifications++);
  assert.throws(() => store.dispatch('switchSkillTemplate', { id: '__proto__' }));
  for (const update of [
    row => { row.name = ' '; }, row => { row.ability = 'xyz'; }, row => { row.bonus = Infinity; },
    row => { row.key = '__proto__'; }, row => { row.key = 'acrobatics'; }
  ]) {
    const skills = structuredClone(original.character.skillTables.templates.tormenta20); update(skills[0]);
    assert.throws(() => store.dispatch('saveSkillTemplate', { id: 'tormenta20', skills }));
    const document = structuredClone(original); document.character.skillTables.templates.tormenta20 = skills;
    assert.throws(() => migrateDocument(document));
  }
  const repeated = [original.character.skillTables.templates.tormenta20[0], original.character.skillTables.templates.tormenta20[0]];
  assert.throws(() => store.dispatch('saveSkillTemplate', { id: 'tormenta20', skills: repeated }));
  assert.deepEqual(store.getDocument(), original); assert.equal(notifications, 0);
});

test('nomes personalizados, visibilidade e templates sobrevivem ao JSON e à reabertura', () => {
  const store = createStore(createDefault());
  store.renameComponent('skill:acrobatics', 'Equilíbrio D&D');
  store.dispatch('switchSkillTemplate', { id: 'tormenta20' });
  store.renameComponent('skill:t20_acrobacia', 'Acrobacia de Tormenta');
  store.setComponentHidden('skill:t20_acrobacia', true);
  const skills = structuredClone(activeSkills(store.getState()));
  skills.find(s => s.key === 't20_acrobacia').name = 'Equilíbrio Tormenta';
  store.dispatch('saveSkillTemplate', { id: 'tormenta20', skills });
  const doc = store.getDocument();
  assert.equal(displayName(doc.character, doc.sheetAppearance, 'skill:t20_acrobacia'), 'Equilíbrio Tormenta');
  assert.deepEqual(doc.sheetAppearance.components['skill:t20_acrobacia'], { hidden: true });
  const catalog = componentCatalog(doc.character, doc.sheetAppearance);
  assert.equal(catalog.some(row => row.id === 'skill:acrobatics'), false);
  assert.equal(catalog.filter(row => row.id.startsWith('skill:')).length, 29);
  const restored = createStore(migrateDocument(JSON.parse(JSON.stringify(doc))));
  assert.deepEqual(restored.getDocument(), doc);
  restored.dispatch('switchSkillTemplate', { id: 'dnd5e' });
  assert.equal(displayName(restored.getState(), restored.getDocument().sheetAppearance, 'skill:acrobatics'), 'Equilíbrio D&D');
});

test('ficha antiga recebe templates e backup sem alterar dados existentes', () => {
  const legacy = createDefault(); delete legacy.skillTables;
  legacy.dnd.skills.acrobatics = { proficient: true, expertise: true };
  const raw = JSON.stringify({ formatVersion: 1, character: legacy, sheetAppearance: { version: 1, components: {}, layouts: { desktop: {}, mobile: {} } } });
  const backend = createMemoryBackend(); backend.setItem(SHEET_KEY, raw);
  const session = createSession({ repository: createSheetRepository(() => backend), migrate: migrateDocument });
  assert.equal(session.ok, true);
  assert.equal(backend.getItem(BACKUP_KEY), raw);
  assert.equal(session.store.getState().skillTables.activeId, 'dnd5e');
  assert.deepEqual(session.store.getState().dnd.skills.acrobatics, legacy.dnd.skills.acrobatics);
  assert.deepEqual(session.store.getState().attributes, legacy.attributes);
});

test('documento da troca completa de sistema recupera o perfil D&D e os cadastros', () => {
  const original = createDefault(), weapon = original.library.weapons[0];
  original.attributes.for = 18; original.resources[0].current = 4;
  const profile = structuredClone(original);
  profile.recordRules = { weapons: { [weapon.id]: { ...weapon, damageDice: '3d8' } }, armors: {}, spells: {} };
  delete profile.library; delete profile.powers; delete profile.spells; delete profile.journal; delete profile.skillTables;
  const raw = { schemaVersion: 4, id: original.id, info: { name: 'Caçador' },
    library: { weapons: [{ id: weapon.id, name: weapon.name }], armors: [] }, powers: [], spells: [], journal: [],
    systemId: 'tormenta20', systemProfiles: { dnd5e: profile, tormenta20: { tormenta: { skills: { luta: { trained: true, bonus: 2 } }, crafts: [] } } } };
  // Mechanical profile information only; identity belongs to the shared record.
  profile.info = { level: 1, class: 'Guerreiro', subclass: '', xp: 0 };
  const before = structuredClone(raw), doc = migrateDocument(raw);
  assert.deepEqual(raw, before);
  assert.equal(doc.character.schemaVersion, 3);
  assert.equal(doc.character.systemProfiles, undefined);
  assert.equal(doc.character.systemId, undefined);
  assert.equal(doc.character.info.name, 'Caçador');
  assert.equal(doc.character.attributes.for, 18);
  assert.equal(doc.character.resources[0].current, 4);
  assert.equal(doc.character.library.weapons[0].damageDice, '3d8');
  assert.equal(doc.character.skillTables.activeId, 'tormenta20');
  assert.equal(doc.character.dnd.skills.t20_luta.proficient, true);
  const withAppearance = migrateDocument({ formatVersion: 1, character: raw, sheetAppearance: {
    version: 1, components: { 'skill:tormenta20:luta': { label: 'Esgrima', hidden: true } }, layouts: { desktop: {}, mobile: {} }
  } });
  assert.deepEqual(withAppearance.sheetAppearance.components['skill:t20_luta'], { label: 'Esgrima', hidden: true });
  assert.equal(withAppearance.sheetAppearance.components['skill:tormenta20:luta'], undefined);
});

test('falha de gravação mantém a tabela editada disponível para exportação', () => {
  const backend = createMemoryBackend(), repository = createSheetRepository(() => backend);
  const session = createSession({ repository, migrate: migrateDocument });
  const before = backend.getItem(SHEET_KEY);
  repository.save = () => ({ ok: false, error: Error('quota') });
  session.store.dispatch('switchSkillTemplate', { id: 'tormenta20' });
  assert.equal(session.flush().ok, false);
  assert.equal(backend.getItem(SHEET_KEY), before);
  assert.equal(session.store.getDocument().character.skillTables.activeId, 'tormenta20');
});
