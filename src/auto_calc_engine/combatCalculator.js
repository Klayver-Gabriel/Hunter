import { signed } from './common.js';
import { componentBreakdown } from './componentResults.js';
import { defaultBreakdown } from './defaultCalculations.js';
import { calculateCharacter } from './characterCalculator.js';

export function armorClassBreakdown(character) {
  return componentBreakdown(character, 'metric:armor', { base: 0, dex: 0, armor: 0, shield: 0, buffs: 0 });
}
export function initiativeBreakdown(character) {
  return componentBreakdown(character, 'metric:initiative', { dex: 0, buffs: 0, feats: 0 });
}
function weaponResult(character, weapon, id) {
  if (weapon.id === character.equipment.weaponId) return componentBreakdown(character, id, { ability: 0, proficiency: 0, buffs: 0, mastery: 0 });
  const calculated = calculateCharacter(character);
  return defaultBreakdown(character, id, target => calculated.values[target], undefined, weapon);
}
export function attackBreakdown(character, weapon) {
  if (!weapon) return { ability: 0, proficiency: 0, buffs: 0, mastery: 0, total: 0 };
  return weaponResult(character, weapon, 'attack:bonus');
}
export function damageBreakdown(character, weapon) {
  if (!weapon) return { dice: '—', ability: 0, buffs: 0, mastery: 0, totalBonus: 0, additionalDice: [], expression: '—' };
  const { total: totalBonus, ...parts } = weaponResult(character, weapon, 'attack:damage');
  delete parts.proficiency;
  const additionalDice = character.buffs.map(b => String(b.damageDice || '').trim()).filter(Boolean);
  const baseExpression = `${weapon.damageDice || '1d6'}${totalBonus === 0 ? '' : signed(totalBonus)}`;
  return { dice: weapon.damageDice || '1d6', ...parts, totalBonus, additionalDice,
    expression: Number.isFinite(totalBonus) ? [baseExpression, ...additionalDice].join(' + ') : 'Erro de cálculo' };
}
