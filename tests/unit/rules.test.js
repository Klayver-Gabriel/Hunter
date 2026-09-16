import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacy } from '../legacy.js';
const { character: C, rules: R, formula: F, mastery: M, data: D } = legacy();
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
  assert.equal(R.maxHpBreakdown(c).total, 10);
  assert.equal(R.maxHpBreakdown(c).errors.length, 1);
});
test('migração é pura e rejeita versões futuras', () => {
  const raw = { schemaVersion: 1, equipment: { weapon: { id: 'old', name: 'Legada' } }, extra: 'preservado' };
  const before = structuredClone(raw), migrated = C.migrate(raw);
  assert.deepEqual(raw, before);
  assert.equal(migrated.equipment.weaponId, 'old');
  assert.equal(migrated.extra, 'preservado');
  assert.throws(() => C.migrate({ schemaVersion: 999 }));
});
