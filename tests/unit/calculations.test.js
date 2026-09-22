import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefault } from '../../src/domain/character.js';
import { createStore } from '../../src/application/store.js';
import { calculateCharacter } from '../../src/auto_calc_engine/characterCalculator.js';
import { referenceFor } from '../../src/domain/calculations.js';
import { displayName } from '../../src/domain/componentCatalog.js';
import { migrateDocument } from '../../src/infrastructure/migrations/document.js';
import { evaluate } from '../../src/auto_calc_engine/formulaEvaluator.js';
const result = store => calculateCharacter(store.getState());
const setRule = (store, target, rule) => store.dispatch('setCalculationRule', { target, rule });
const level = (store, value) => store.dispatch('setField', { path: 'info.level', value });
const progression = (overrides = {}) => ({ mode: 'progression', initial: '10 + MOD_INT', gain: '3 + MOD_INT', bonuses: [{ level: 5, formula: '5' }], policy: 'current', ...overrides });
const resource = (store, id = 'atp') => store.getState().resources.find(r => r.id === id);
const spell = (store, id, dt, circle = null) => store.dispatch('saveEntry', { list: 'spells', data: { id, title: id, circle, dt: { bonus: 0, resistance: '', ...dt } } });
const effect = (store, id, data = {}) => store.dispatch('saveEffect', { id, data: { name: id, kind: 'resource', target: 'resource:atp', event: 'round', amount: 2, durationUnit: 'round', duration: 3, remaining: 3, active: true, ...data } });
const event = (store, name = 'round') => store.dispatch('advanceEvent', { event: name });

test('renomeação em lote é atômica, mantém IDs, cálculos e nomes dos cadastros', () => {
  const store = createStore(createDefault()), before = result(store), id = store.getState().equipment.weaponId;
  let notifications = 0; store.subscribe(() => notifications++);
  store.customizeComponents([{ id: 'attribute:con', label: 'Vigor' }, { id: `record:weapons:${id}`, label: 'Espada solar' }, { id: 'resource:hp', hidden: true }]);
  assert.equal(notifications, 1); assert.deepEqual(result(store), before);
  assert.equal(store.getState().library.weapons[0].name, 'Espada solar'); assert.equal(store.getState().equipment.weaponId, id);
  assert.equal(store.getDocument().sheetAppearance.components[`record:weapons:${id}`], undefined);
  assert.equal(displayName(store.getState(), store.getDocument().sheetAppearance, 'save:con'), 'Vigor');
  const saved = store.getDocument();
  assert.throws(() => store.customizeComponents([{ id: 'attribute:con', label: 'Outro' }, { id: 'resource:hp', label: '' }]));
  assert.deepEqual(store.getDocument(), saved);
  store.customizeComponents([{ id: `record:weapons:${id}`, label: null }, { id: 'attribute:con', label: null }, { id: 'resource:hp', hidden: false }]);
  assert.equal(store.getState().library.weapons[0].name, 'Long Sword da Guilda');
});

test('DT global, fórmula própria, fixa e ausente acompanham dependências', () => {
  const store = createStore(createDefault());
  spell(store, 'global', { mode: 'global', bonus: 1, resistance: 'des' });
  spell(store, 'own', { mode: 'formula', formula: '10 + floor(NIVEL / 2) + MOD_CONJURACAO + CIRCULO + BONUS_MAGIA', bonus: 2 }, 3);
  spell(store, 'fixed', { mode: 'fixed', fixed: 16, bonus: 2 }); spell(store, 'none', { mode: 'none' });
  assert.equal(result(store).spells.global.value, 11); assert.equal(result(store).spells.own.value, 15);
  assert.equal(result(store).spells.fixed.value, 18); assert.equal(result(store).spells.none.value, null);
  store.dispatch('setAttribute', { key: 'int', value: 18 }); level(store, 5);
  assert.equal(result(store).spells.global.value, 16); assert.equal(result(store).spells.own.value, 21);
  store.dispatch('setSpellcasting', { data: { ability: 'int', formula: '10 + floor(NIVEL / 2) + MOD_CONJURACAO + BONUS_DT', bonus: 3 } });
  assert.equal(result(store).spells.global.value, 20);
  assert.equal(result(store).spells.global.resistance, 'des');
});

test('círculo textual legado permanece intacto e não vira zero em fórmulas', () => {
  const raw = createDefault(); raw.schemaVersion = 2;
  raw.spells = [{ id: 'old', title: 'Antiga', level: 'Truque / especial' }, { id: 'numeric', title: 'Numérica', level: '2' }];
  const document = migrateDocument(raw), store = createStore(document);
  assert.equal(store.getState().spells[0].level, 'Truque / especial'); assert.equal(store.getState().spells[0].circle, undefined);
  assert.equal(result(store).spells.old.value, null); assert.equal(result(store).spells.old.resistance, '');
  assert.equal(store.getState().spells[1].circle, 2);
  assert.throws(() => store.dispatch('saveEntry', { list: 'spells', id: 'old', data: { dt: { mode: 'formula', formula: '10 + CIRCULO', bonus: 0, resistance: '' } } }), /CIRCULO/);
});

test('valores, modificadores, dependências ordenadas e referências estáveis', () => {
  const store = createStore(createDefault()); store.dispatch('addCharacteristic', { name: 'Potência' });
  const id = store.getState().calculations.characteristics[0].id;
  setRule(store, `characteristic:${id}`, { mode: 'formula', formula: `${referenceFor('resource:atp')} + INT + MOD_INT` });
  setRule(store, 'resource:atp', { mode: 'formula', formula: 'INT * 2' });
  store.dispatch('setAttribute', { key: 'int', value: 16 });
  assert.equal(resource(store).max, 32); assert.equal(result(store).values[`characteristic:${id}`], 51);
  store.customizeComponents([{ id: 'attribute:int', label: 'Intelecto' }]);
  assert.equal(result(store).values[`characteristic:${id}`], 51);
  assert.notEqual(referenceFor('resource:A'), referenceFor('resource:a'));
});

test('progressão avalia cada nível e distingue nível final do avaliado', () => {
  const store = createStore(createDefault());
  setRule(store, 'resource:atp', progression()); level(store, 5); assert.equal(resource(store).max, 27);
  store.dispatch('setAttribute', { key: 'int', value: 14 }); assert.equal(resource(store).max, 37);
  setRule(store, 'resource:atp', progression({ initial: 'NIVEL_FINAL', gain: 'NIVEL_AVALIADO', bonuses: [] }));
  assert.equal(resource(store).max, 19); // 5 + 2 + 3 + 4 + 5, not 5 + 4*5.
  setRule(store, 'resource:atp', progression({ initial: '0', gain: '1', min: 10, max: 12 })); assert.equal(resource(store).max, 10);
  level(store, 20); assert.equal(resource(store).max, 12);
});

test('histórico usa ponto inicial real e reutiliza ganhos ao recuperar níveis', () => {
  const store = createStore(createDefault()); level(store, 3);
  store.dispatch('setResource', { id: 'atp', key: 'max', value: 22 });
  setRule(store, 'resource:atp', progression({ policy: 'recorded' }));
  assert.equal(resource(store).max, 22); assert.deepEqual(store.getState().calculations.rules['resource:atp'].history, { anchorLevel: 3, anchorValue: 22, gains: {} });
  level(store, 4); assert.equal(resource(store).max, 25);
  store.dispatch('setAttribute', { key: 'int', value: 18 }); assert.equal(resource(store).max, 25);
  level(store, 5); assert.equal(resource(store).max, 37);
  level(store, 2); assert.equal(resource(store).max, 22);
  store.dispatch('setAttribute', { key: 'int', value: 10 }); level(store, 5); assert.equal(resource(store).max, 37);
  level(store, 6); assert.equal(resource(store).max, 40);
  const reopened = createStore(migrateDocument(JSON.parse(JSON.stringify(store.getDocument()))));
  assert.equal(resource(reopened).max, 40); assert.deepEqual(reopened.getDocument(), store.getDocument());
});

test('máximos não recuperam recursos e reduções limitam valor corrente', () => {
  const store = createStore(createDefault()); store.dispatch('setResource', { id: 'atp', key: 'current', value: 7 });
  setRule(store, 'resource:atp', { mode: 'formula', formula: 'INT * 2' }); assert.equal(resource(store).current, 7);
  setRule(store, 'resource:atp', { mode: 'formula', formula: '3' }); assert.equal(resource(store).current, 3);
  setRule(store, 'resource:atp', { mode: 'formula', formula: '50' }); assert.equal(resource(store).current, 3);
});

test('regras inválidas e ciclos não publicam alterações', () => {
  const store = createStore(createDefault());
  for (const formula of ['1 / 0', 'UNKNOWN + 1', '2 +', 'floor(1, 2)', 'max(1,)', 'constructor(1)']) {
    const before = store.getState(); assert.throws(() => setRule(store, 'resource:atp', { mode: 'formula', formula })); assert.equal(store.getState(), before);
  }
  assert.throws(() => evaluate('INT', { INT: NaN })); assert.throws(() => evaluate('INT', { INT: Infinity }));
  setRule(store, 'attribute:int', { mode: 'formula', formula: 'FOR' });
  assert.throws(() => setRule(store, 'attribute:for', { mode: 'formula', formula: 'MOD_INT' }), /circular/);
  assert.throws(() => setRule(store, 'resource:hp', { mode: 'formula', formula: referenceFor('resource:hp') }), /circular/);
});

test('dependência que fica inválida mostra erro sem resultado substituto', () => {
  const store = createStore(createDefault()); setRule(store, 'resource:atp', { mode: 'formula', formula: '100 / (INT - 12)' });
  store.dispatch('setAttribute', { key: 'int', value: 12 });
  assert.match(result(store).errors['resource:atp'], /zero/); assert.equal(result(store).values['resource:atp'], undefined);
  store.dispatch('setAttribute', { key: 'int', value: 14 }); assert.equal(resource(store).max, 50);
});

test('remoções referenciadas são bloqueadas sem perder dados', () => {
  const store = createStore(createDefault()); store.dispatch('addCharacteristic'); const id = store.getState().calculations.characteristics[0].id;
  setRule(store, 'resource:atp', { mode: 'formula', formula: `${referenceFor(`characteristic:${id}`)} + 5` });
  const before = store.getDocument(); assert.throws(() => store.dispatch('removeCharacteristic', { id }), /removida/); assert.deepEqual(store.getDocument(), before);
  store.dispatch('addResource'); const rid = store.getState().resources.at(-1).id;
  effect(store, 'referenced', { target: `resource:${rid}` }); assert.throws(() => store.dispatch('removeResource', { id: rid }), /inválid/);
});

test('migração mantém semântica legada CON modificador e ganho multiplicado pelo nível final', () => {
  const raw = createDefault(); raw.schemaVersion = 2; raw.info.level = 4; raw.attributes.con = 16;
  raw.dnd.vitality.firstLevelFormula = '10 + CON'; raw.dnd.vitality.laterLevelFormula = 'NIVEL + CON';
  delete raw.calculations; delete raw.temporal;
  const store = createStore(migrateDocument(raw)); assert.equal(resource(store, 'hp').max, 34); assert.deepEqual(store.getState().calculations.rules, {});
  setRule(store, 'resource:hp', progression({ initial: '10 + MOD_CON', gain: 'NIVEL_AVALIADO + MOD_CON', bonuses: [] })); assert.equal(resource(store, 'hp').max, 31);
});

test('eventos são explícitos, persistentes e aplicam antes de expirar', () => {
  const store = createStore(createDefault()); store.dispatch('setResource', { id: 'atp', key: 'current', value: 1 });
  effect(store, 'regen'); event(store, 'turn'); assert.equal(resource(store).current, 1);
  event(store); assert.equal(resource(store).current, 3); assert.equal(store.getState().temporal.effects[0].remaining, 2);
  for (let i = 0; i < 3; i++) result(store); assert.equal(resource(store).current, 3);
  const reopened = createStore(migrateDocument(JSON.parse(JSON.stringify(store.getDocument())))); assert.equal(resource(reopened).current, 3);
  event(reopened); event(reopened); assert.equal(resource(reopened).current, 7); assert.equal(reopened.getState().temporal.effects[0].active, false);
  event(reopened); assert.equal(resource(reopened).current, 7);
  reopened.dispatch('activateEffect', { id: 'regen' }); assert.equal(reopened.getState().temporal.effects[0].remaining, 3);
  reopened.dispatch('activateEffect', { id: 'regen' }); assert.equal(resource(reopened).current, 7);
});

test('bônus efetivos não sobrescrevem atributos nem máximos base', () => {
  const store = createStore(createDefault()); effect(store, 'strength', { kind: 'bonus', target: 'attribute:for', durationUnit: 'turn' });
  assert.equal(result(store).values['attribute:for'], 12); assert.equal(store.getState().attributes.for, 10);
  effect(store, 'maximum', { kind: 'bonus', target: 'resource:atp', amount: 5, duration: 1, remaining: 1 });
  assert.equal(resource(store).max, 15); store.dispatch('setAttribute', { key: 'int', value: 12 }); assert.equal(resource(store).max, 15);
  event(store); assert.equal(resource(store).max, 10); assert.equal(result(store).values['attribute:for'], 12);
  event(store, 'turn'); event(store, 'turn'); event(store, 'turn'); assert.equal(result(store).values['attribute:for'], 10);
});

test('descanso, consumo e remoção não reaplicam eventos', () => {
  const store = createStore(createDefault()); effect(store, 'drain', { amount: -4, event: 'turn', durationUnit: 'unlimited' }); event(store, 'turn'); assert.equal(resource(store).current, 6);
  effect(store, 'rest', { amount: 10, event: 'rest', durationUnit: 'unlimited' }); event(store, 'rest'); assert.equal(resource(store).current, 10);
  assert.equal(store.getState().temporal.turn, 1); assert.equal(store.getState().temporal.rest, 1);
  store.dispatch('removeEffect', { id: 'drain' }); event(store, 'turn'); assert.equal(resource(store).current, 10);
});

test('migração move rótulo de recurso personalizado para cadastro e preserva aparência e IDs', () => {
  const c = createDefault(); c.schemaVersion = 2; c.resources.push({ id: 'mana', name: 'Mana', type: 'custom', max: 22, current: 7, removable: true });
  const d = { formatVersion: 1, character: c, sheetAppearance: { version: 1, components: { 'resource:mana': { label: 'Éter', hidden: true, colors: { dark: { accent: '#123456' } } } }, layouts: { desktop: {}, mobile: {} } } };
  const before = structuredClone(d), migrated = migrateDocument(d);
  assert.deepEqual(d, before); assert.equal(migrated.character.resources.at(-1).name, 'Éter');
  assert.equal(migrated.character.resources.at(-1).id, 'mana'); assert.equal(migrated.sheetAppearance.components['resource:mana'].label, undefined);
  assert.equal(migrated.sheetAppearance.components['resource:mana'].hidden, true);
  assert.deepEqual(migrateDocument(JSON.parse(JSON.stringify(migrated))), migrated);
});

test('DT global aceita manual e progressão, com ciclos entre DT e atributos detectados', () => {
  const store = createStore(createDefault()); spell(store, 'inherited', { mode: 'global' });
  store.dispatch('setCalculationRule', { target: 'spellcasting', rule: { mode: 'manual' }, value: 17 });
  assert.equal(result(store).spells.inherited.value, 17);
  setRule(store, 'spellcasting', progression({ initial: '8 + MOD_CONJURACAO', gain: '1', bonuses: [] })); level(store, 5);
  assert.equal(result(store).spells.inherited.value, 12);
  assert.throws(() => setRule(store, 'attribute:int', { mode: 'formula', formula: referenceFor('spellcasting') }), /circular/);
});

test('salvar regra idêntica preserva histórico e importação rejeita novos dados inválidos', () => {
  const store = createStore(createDefault()), rule = progression({ policy: 'recorded' });
  setRule(store, 'resource:atp', rule); level(store, 3); const history = store.getState().calculations.rules['resource:atp'].history;
  setRule(store, 'resource:atp', rule); assert.deepEqual(store.getState().calculations.rules['resource:atp'].history, history);
  for (const modify of [
    c => { c.calculations.rules['resource:atp'].history.gains[2] = null; },
    c => { c.calculations.spellcasting.bonus = '2'; },
    c => { c.temporal.round = -1; },
    c => { c.calculations.rules['resource:atp'].gain = 'MISSING'; },
    c => { c.calculations.rules['resource:atp'].max = -1; c.calculations.rules['resource:atp'].min = 4; }
  ]) { const document = structuredClone(store.getDocument()); modify(document.character); assert.throws(() => migrateDocument(document)); }
});

test('documento completo conserva novos cadastros, regras, nomes, DT, efeitos e histórico no JSON', () => {
  const store = createStore(createDefault()); store.dispatch('addResource'); const id = store.getState().resources.at(-1).id;
  store.customizeComponents([{ id: `resource:${id}`, label: 'Mana', hidden: true }]);
  setRule(store, `resource:${id}`, progression({ policy: 'recorded' })); level(store, 4);
  store.dispatch('addCharacteristic', { name: 'Reserva arcana' }); const stat = store.getState().calculations.characteristics[0].id;
  setRule(store, `characteristic:${stat}`, { mode: 'formula', formula: referenceFor(`resource:${id}`) });
  spell(store, 'spell', { mode: 'formula', formula: `${referenceFor(`characteristic:${stat}`)} + CIRCULO`, resistance: 'sab' }, 1);
  effect(store, 'rest', { target: `resource:${id}`, event: 'rest', durationUnit: 'unlimited' }); event(store, 'rest');
  const document = store.getDocument(); const next = createStore(migrateDocument(JSON.parse(JSON.stringify(document))));
  assert.deepEqual(next.getDocument(), document); assert.deepEqual(result(next), result(store));
  assert.equal(next.getState().equipment.weaponId, 'weapon_longsword_starter');
  assert.equal(next.getDocument().sheetAppearance.components[`resource:${id}`].label, undefined);
});

test('ganhos registrados não são reavaliados quando atributos mudam', () => {
  const store = createStore(createDefault());
  store.dispatch('setAttribute', { key: 'int', value: 14 });
  setRule(store, 'resource:atp', progression({ policy: 'recorded', gain: '10 / MOD_INT', bonuses: [] }));
  level(store, 2); assert.equal(resource(store).max, 15);
  store.dispatch('setAttribute', { key: 'int', value: 10 });
  assert.equal(result(store).values['resource:atp'], 15);
  const reopened = createStore(migrateDocument(structuredClone(store.getDocument()), { allowRuntimeErrors: true }));
  assert.equal(result(reopened).values['resource:atp'], 15);
  level(store, 3); assert.match(result(store).errors['resource:atp'], /zero/);
  assert.deepEqual(store.getState().calculations.rules['resource:atp'].history.gains, { 2: 5 });
});


test('erros de dependências são recuperáveis ao reabrir, mas regras malformadas são rejeitadas', () => {
  const store = createStore(createDefault());
  setRule(store, 'resource:atp', { mode: 'formula', formula: '10 / (INT - 12)' });
  store.dispatch('setAttribute', { key: 'int', value: 12 });
  const saved = JSON.parse(JSON.stringify(store.getDocument()));
  assert.throws(() => migrateDocument(saved), /zero/);
  const reopened = createStore(migrateDocument(saved, { allowRuntimeErrors: true }));
  assert.match(result(reopened).errors['resource:atp'], /zero/);
  reopened.dispatch('setAttribute', { key: 'int', value: 14 }); assert.equal(resource(reopened).max, 5);
  saved.character.calculations.rules['resource:atp'].formula = 'unknown + 1';
  assert.throws(() => migrateDocument(saved, { allowRuntimeErrors: true }), /desconhecida/);
});

test('nome de registro usa o campo de seu cadastro mesmo com extensões legadas', () => {
  const c = createDefault(); c.library.weapons[0].title = 'Extensão de arma'; c.powers.push({ id: 'power', title: 'Poder original', name: 'Extensão de poder' });
  const store = createStore(c);
  store.customizeComponents([{ id: 'record:weapons:weapon_longsword_starter', label: 'Espada' }, { id: 'record:powers:power', label: 'Poder' }]);
  assert.equal(store.getState().library.weapons[0].name, 'Espada'); assert.equal(store.getState().library.weapons[0].title, 'Extensão de arma');
  assert.equal(store.getState().powers[0].title, 'Poder'); assert.equal(store.getState().powers[0].name, 'Extensão de poder');
});
