import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefault } from '../../src/domain/character.js';
import { createStore } from '../../src/application/store.js';
import { getCalculableComponents } from '../../src/domain/calculableComponents.js';
import { previewComponentConfiguration } from '../../src/application/componentConfiguration.js';
import { calculateCharacter } from '../../src/auto_calc_engine/characterCalculator.js';
import { referenceFor } from '../../src/domain/calculations.js';
import { migrateDocument } from '../../src/infrastructure/migrations/document.js';
import { createSession } from '../../src/application/session.js';
import { createMemoryBackend, createSheetRepository, SHEET_KEY, BACKUP_KEY } from '../../src/infrastructure/sheetRepository.js';

const values = store => calculateCharacter(store.getState()).values;
const formula = (store, componentId, expression, extra = {}) => store.configureComponent({ componentId, rule: { mode: 'formula', formula: expression }, ...extra });

test('registry covers both skill tables, numeric results and aliases without DOM or duplicate state', () => {
  const store = createStore(createDefault()), components = getCalculableComponents(store.getDocument());
  for (const id of ['attribute:int', 'resource:hp', 'skill:acrobatics', 'skill:t20_luta', 'save:des', 'indicator:proficiency', 'metric:armor', 'metric:initiative', 'metric:passive', 'attack:damage', 'armor:total', 'spellcasting']) assert.ok(components.some(c => c.id === id), id);
  assert.deepEqual(components.find(c => c.id === 'resource:hp').aliases, ['metric:hp']);
  assert.equal(components.some(c => c.id === 'field:info.level'), false);
  assert.equal(components.find(c => c.id === 'resource:atp').nonNegative, true);
});

test('resource IDs named current stay distinct from current-value reference nodes', () => {
  const c = createDefault(); c.resources.push({ id: 'current', name: 'Reserva', type: 'custom', current: 3, max: 8 });
  const store = createStore(c);
  formula(store, 'metric:armor', `${referenceFor('resource:current')} + ${referenceFor('resource:current:current')}`);
  assert.equal(values(store)['metric:armor'], 11);
});

test('import rejects malformed nonnegative policies and missing derived manual values', () => {
  const store = createStore(createDefault());
  for (const rule of [{ mode: 'default', nonNegative: null }, { mode: 'default', nonNegative: 'false' }, { mode: 'manual' }]) {
    const doc = structuredClone(store.getDocument()); doc.character.calculations.rules['metric:armor'] = rule;
    assert.throws(() => migrateDocument(doc));
  }
});

test('preview is pure; commit saves name, parameters and calculation with one notification', () => {
  const store = createStore(createDefault()), before = store.getDocument(); let notifications = 0;
  store.subscribe(() => notifications++);
  const patch = { componentId: 'skill:acrobatics', name: 'Equilíbrio', parameters: { ability: 'int', bonus: 2, proficient: true, expertise: true }, rule: { mode: 'formula', formula: 'VALOR_PADRAO + 3' } };
  const preview = previewComponentConfiguration(before, patch);
  assert.equal(preview.result.values['skill:acrobatics'], 9); assert.deepEqual(store.getDocument(), before); assert.equal(notifications, 0);
  store.configureComponent(patch); assert.equal(values(store)['skill:acrobatics'], 9); assert.equal(notifications, 1);
  const saved = store.getDocument();
  assert.throws(() => store.configureComponent({ ...patch, name: 'Outro', rule: { mode: 'formula', formula: '1/0' } }), /zero/);
  assert.deepEqual(store.getDocument(), saved); assert.equal(notifications, 1);
});

test('new characteristics are drafted without publishing and only exist after commit', () => {
  const store = createStore(createDefault()), before = store.getDocument();
  const patch = { componentId: 'characteristic:stat_new', createCharacteristic: { id: 'stat_new' }, name: 'Reserva', rule: { mode: 'formula', formula: 'INT * 2' } };
  assert.equal(previewComponentConfiguration(before, patch).result.values['characteristic:stat_new'], 20);
  assert.deepEqual(store.getDocument(), before);
  store.configureComponent(patch); assert.equal(values(store)['characteristic:stat_new'], 20);
  assert.throws(() => store.configureComponent(patch), /inválido/);
});

test('configured proficiency feeds skills, saves, attacks, casting and passive perception', () => {
  const store = createStore(createDefault());
  store.dispatch('setSkill', { key: 'perception', field: 'expertise', value: true });
  store.dispatch('setSave', { key: 'des', value: true });
  formula(store, 'indicator:proficiency', 'VALOR_PADRAO + 3');
  const v = values(store);
  assert.equal(v['indicator:proficiency'], 5); assert.equal(v['skill:perception'], 10);
  assert.equal(v['metric:passive'], 20); assert.equal(v['save:des'], 5);
  assert.equal(v['attack:bonus'], 5); assert.equal(v.spellcasting, 13);
  assert.throws(() => formula(store, 'indicator:proficiency', 'PROFICIENCIA + 1'), /circular/);
});

test('resource current is normalized in the graph before evaluating downstream calculations', () => {
  const store = createStore(createDefault()), ref = referenceFor('resource:atp:current');
  formula(store, 'metric:armor', `10 + ${ref}`);
  store.dispatch('setResource', { id: 'atp', key: 'current', value: 4 }); assert.equal(values(store)['metric:armor'], 14);
  formula(store, 'resource:atp', '2');
  assert.equal(store.getState().resources.find(r => r.id === 'atp').current, 2); assert.equal(values(store)['metric:armor'], 12);
  formula(store, 'resource:atp', '50'); assert.equal(values(store)['metric:armor'], 12);
  assert.throws(() => formula(store, 'resource:atp', `${ref} + 1`), /circular/);
  assert.throws(() => formula(store, 'resource:atp', referenceFor('metric:armor')), /circular/);
});

test('negative balances obey the same policy for edits, events, preview and import', () => {
  const store = createStore(createDefault());
  store.configureComponent({ componentId: 'resource:atp', rule: { mode: 'manual' }, value: 10, nonNegative: false });
  store.dispatch('setResource', { id: 'atp', key: 'current', value: -3 });
  formula(store, 'metric:initiative', referenceFor('resource:atp:current'));
  store.dispatch('saveEffect', { id: 'drain', data: { name: 'Consumo', target: 'resource:atp', kind: 'resource', amount: -4, event: 'turn', durationUnit: 'unlimited', active: true } });
  store.dispatch('advanceEvent', { event: 'turn' }); assert.equal(values(store)['metric:initiative'], -7);
  const reopened = createStore(migrateDocument(JSON.parse(JSON.stringify(store.getDocument()))));
  assert.equal(values(reopened)['resource:atp:current'], -7);
  reopened.configureComponent({ componentId: 'resource:atp', nonNegative: true });
  assert.equal(values(reopened)['resource:atp:current'], 0);
  formula(reopened, 'resource:atp', '-20', { nonNegative: false }); assert.equal(values(reopened)['resource:atp'], 0);
});

test('numeric defaults and overrides apply external and temporary bonuses once', () => {
  const store = createStore(createDefault());
  store.dispatch('saveBuff', { data: { title: 'Proteção', armorClass: 3 } });
  store.dispatch('saveEffect', { id: 'shield', data: { name: 'Escudo', target: 'metric:armor', kind: 'bonus', amount: 2, durationUnit: 'unlimited', active: true } });
  formula(store, 'metric:armor', 'VALOR_PADRAO + 1'); assert.equal(values(store)['metric:armor'], 16);
  store.configureComponent({ componentId: 'metric:armor', rule: { mode: 'default' } }); assert.equal(values(store)['metric:armor'], 15);
  store.configureComponent({ componentId: 'metric:armor', rule: { mode: 'manual' }, value: 8 }); assert.equal(values(store)['metric:armor'], 10);
});

test('standard calculations can be repaired atomically with new rules and parameters', () => {
  const store = createStore(createDefault());
  store.configureComponent({ componentId: 'resource:hp', parameters: { 'dnd.vitality.firstLevelFormula': '1/0' }, rule: { mode: 'formula', formula: '20' } });
  assert.equal(values(store)['resource:hp'], 20);
  store.configureComponent({ componentId: 'resource:hp', parameters: { 'dnd.vitality.firstLevelFormula': '12 + CON' }, rule: { mode: 'default' } });
  assert.equal(values(store)['resource:hp'], 12);
});

test('HP/global DT aliases share rules and generic spell results are referenceable', () => {
  const store = createStore(createDefault());
  formula(store, 'metric:hp', '22'); assert.equal(values(store)['resource:hp'], 22);
  formula(store, 'metric:dt', '18'); assert.equal(values(store).spellcasting, 18);
  store.dispatch('saveEntry', { list: 'spells', data: { id: 'light', title: 'Luz', circle: 2, dt: { mode: 'global', bonus: 1, resistance: '' } } });
  formula(store, 'spell:light', 'VALOR_PADRAO + CIRCULO'); assert.equal(values(store)['spell:light'], 21);
  formula(store, 'metric:initiative', referenceFor('spell:light')); assert.equal(values(store)['metric:initiative'], 21);
  assert.throws(() => store.dispatch('deleteEntry', { list: 'spells', id: 'light' }), /removida/);
});

test('missing numeric DT cannot silently become zero in another formula', () => {
  const store = createStore(createDefault());
  store.dispatch('saveEntry', { list: 'spells', data: { id: 'empty', title: 'Sem DT', dt: { mode: 'none', bonus: 0, resistance: '' } } });
  assert.throws(() => formula(store, 'metric:armor', referenceFor('spell:empty')), /numérico/);
});

test('inherited spell DT preserves the global calculation breakdown', () => {
  const store = createStore(createDefault());
  store.dispatch('saveEntry', { list: 'spells', data: { id: 'global', title: 'Global', dt: { mode: 'global', bonus: 2, resistance: '' } } });
  const result = calculateCharacter(store.getState());
  assert.deepEqual(result.spells.global.variables, result.casting.variables);
  assert.equal(result.spells.global.variables.PROFICIENCIA, 2);
  assert.deepEqual(result.details['spell:global'][0].variables, result.casting.variables);
});

test('inactive tables keep custom rules; removing a referenced row is atomic', () => {
  const store = createStore(createDefault());
  formula(store, 'skill:t20_luta', '7'); formula(store, 'metric:armor', referenceFor('skill:t20_luta'));
  store.dispatch('switchSkillTemplate', { id: 'tormenta20' }); assert.equal(values(store)['metric:armor'], 7);
  const before = store.getDocument();
  assert.throws(() => store.dispatch('saveSkillTemplate', { id: 'tormenta20', skills: store.getState().skillTables.templates.tormenta20.filter(s => s.key !== 't20_luta') }), /removida/);
  assert.deepEqual(store.getDocument(), before);
});

test('runtime failures propagate to numeric dependents and recover without substitute values', () => {
  const store = createStore(createDefault());
  formula(store, 'metric:armor', '10 / (INT - 12)'); formula(store, 'metric:initiative', referenceFor('metric:armor'));
  store.dispatch('setAttribute', { key: 'int', value: 12 });
  const result = calculateCharacter(store.getState());
  assert.equal(result.values['metric:armor'], undefined); assert.match(result.errors['metric:initiative'], /zero/);
  const reopened = createStore(migrateDocument(store.getDocument(), { allowRuntimeErrors: true }));
  reopened.dispatch('setAttribute', { key: 'int', value: 14 }); assert.equal(values(reopened)['metric:initiative'], 5);
});

test('schema 3 migrates to 5 with a backup; current schema does not replace it', () => {
  const legacy = createDefault(); legacy.schemaVersion = 3;
  const backend = createMemoryBackend(), repository = createSheetRepository(() => backend);
  const raw = JSON.stringify({ formatVersion: 1, character: legacy, sheetAppearance: { version: 1, components: {}, layouts: { desktop: {}, mobile: {} } } });
  backend.setItem(SHEET_KEY, raw);
  const session = createSession({ repository, migrate: migrateDocument });
  assert.equal(session.ok, true); assert.equal(session.store.getState().schemaVersion, 5); assert.equal(backend.getItem(BACKUP_KEY), raw);
  createSession({ repository, migrate: migrateDocument }); assert.equal(backend.getItem(BACKUP_KEY), raw);
});

test('recorded progression for a new derived target survives renaming and JSON roundtrip', () => {
  const store = createStore(createDefault());
  const rule = { mode: 'progression', initial: '10', gain: '2', policy: 'recorded', bonuses: [] };
  store.configureComponent({ componentId: 'metric:armor', name: 'Defesa', rule });
  store.dispatch('setField', { path: 'info.level', value: 3 }); assert.equal(values(store)['metric:armor'], 14);
  const history = store.getState().calculations.rules['metric:armor'].history;
  store.configureComponent({ componentId: 'metric:armor', name: 'Proteção', rule });
  assert.deepEqual(store.getState().calculations.rules['metric:armor'].history, history);
  const saved = store.getDocument(), reopened = createStore(migrateDocument(JSON.parse(JSON.stringify(saved))));
  assert.deepEqual(reopened.getDocument(), saved);
});
