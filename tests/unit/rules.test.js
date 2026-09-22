import { migrateCharacter } from '../../src/infrastructure/migrations/character.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/domain/character.js';
import * as R from '../../src/auto_calc_engine/index.js';
import * as F from '../../src/auto_calc_engine/formulaEvaluator.js';
import * as M from '../../src/auto_calc_engine/masteryCalculator.js';
import * as D from '../../src/domain/catalog.js';
test('ficha padrão mantém os resultados conhecidos', () => {
  const c = C.createDefault(), w = R.equippedWeapon(c);
  assert.equal(R.maxHpBreakdown(c).total, 10);
  assert.equal(R.armorClassBreakdown(c).total, 10);
  assert.equal(R.initiativeBreakdown(c).total, 0);
  assert.equal(R.attackBreakdown(c, w).total, 2);
  assert.equal(R.damageBreakdown(c, w).expression, '2d6');
});
test('proficiência, expertise, buffs e maestria são cumulativos', () => {
  const c = C.createDefault(), w = R.equippedWeapon(c);
  c.info.level = 5; c.attributes.des = 16;
  c.dnd.skills.acrobatics = { proficient: true, expertise: true };
  c.masteries[w.id].level = 8;
  c.buffs = [{ skill: 'acrobatics', skillBonus: 1, attack: 2, damage: 3, hp: 4 }];
  assert.equal(R.skillBreakdown(c, D.SKILLS.find(s => s.key === 'acrobatics')).total, 12);
  assert.equal(R.attackBreakdown(c, w).total, 7);
  assert.equal(R.damageBreakdown(c, w).totalBonus, 8);
  assert.equal(R.maxHpBreakdown(c).total, 38);
  assert.equal(M.masteryEffects(c, w).skills.acrobatics, 2);
});
test('fórmulas têm precedência, funções e falhas explícitas', () => {
  assert.equal(F.evaluate('max(1, 10 + CON * 2)', { CON: 3 }), 16);
  assert.equal(F.evaluate('-(2 + 3) / 2', {}), -2.5);
  for (const expression of ['1/0', 'window.alert(1)', 'UNKNOWN', '1 +']) assert.throws(() => F.evaluate(expression, {}));
  const c = C.createDefault(); c.dnd.vitality.firstLevelFormula = '1/0';
  assert.equal(R.maxHpBreakdown(c).total, null);
  assert.equal(R.maxHpBreakdown(c).errors.length, 1);
});
test('migração é pura e rejeita versões futuras', () => {
  const raw = { schemaVersion: 1, equipment: { weapon: { id: 'old', name: 'Legada' } }, extra: 'preservado' };
  const before = structuredClone(raw), migrated = migrateCharacter(raw);
  assert.deepEqual(raw, before);
  assert.equal(migrated.equipment.weaponId, 'old');
  assert.equal(migrated.extra, 'preservado');
  assert.throws(() => migrateCharacter({ schemaVersion: 999 }));
});
test('armadura média limita DES, pesada ignora DES; peças e buffs somam CA', () => {
  const c = C.createDefault(); c.attributes.des = 18;
  c.dnd.armor = { type: 'medium', base: 14, armorBonus: 1, shield: 2, buffs: 1 };
  c.library.armors = [{ id: 'helm', slot: 'helm', acBonus: 2 }]; c.equipment.armor.helm = 'helm';
  c.buffs = [{ armorClass: 3 }];
  assert.equal(R.armorClassBreakdown(c).total, 25);
  c.dnd.armor.type = 'heavy'; assert.equal(R.armorClassBreakdown(c).total, 23);
  c.dnd.armor.type = 'light'; assert.equal(R.armorClassBreakdown(c).total, 27);
});
test('resistências, iniciativa e dano adicional mantêm os detalhamentos', () => {
  const c = C.createDefault(); c.info.level = 9; c.attributes.des = 16; c.dnd.saves.des = true;
  assert.equal(R.saveBreakdown(c, 'des').total, 7);
  c.dnd.initiative = { buffs: 2, feats: 1 }; c.buffs = [{ initiative: 3, damageDice: '1d6 Fogo' }];
  assert.equal(R.initiativeBreakdown(c).total, 9);
  assert.equal(R.damageBreakdown(c, R.equippedWeapon(c)).expression, '2d6 + 1d6 Fogo');
  assert.equal(R.attackBreakdown(c, null).total, 0);
  assert.equal(R.damageBreakdown(c, null).expression, '—');
});
test('migração preserva extensões e referência da arma legada sem identificador', () => {
  const raw = { schemaVersion: 1, equipment: { weapon: { id: null, name: 'Legada' } }, dnd: { extension: { custom: true } } };
  const migrated = migrateCharacter(raw);
  assert.equal(migrated.equipment.weaponId, migrated.library.weapons[0].id);
  assert.deepEqual(migrated.dnd.extension, { custom: true });
});
