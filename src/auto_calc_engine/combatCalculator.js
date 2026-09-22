import { signed, abilityModifier, proficiency, buffTotals, equippedArmor, equippedWeapon } from './common.js';
import * as M from './masteryCalculator.js';
import * as D from '../domain/catalog.js';

export function armorClassBreakdown(character) {
  const armor = character.dnd.armor;
  const type = D.ARMOR_TYPES.find(item => item.value === armor.type) || D.ARMOR_TYPES[0];
  const rawDex = abilityModifier(character, 'des');
  const dex = type.value === 'heavy' ? 0 : type.dexCap == null ? rawDex : Math.min(rawDex, type.dexCap);
  const equipment = equippedArmor(character).reduce((sum, item) => sum + (Number(item.acBonus) || 0), 0);
  const buffs = buffTotals(character).armorClass + (Number(armor.buffs) || 0);
  const base = Number(armor.base) || 10;
  const armorBonus = Number(armor.armorBonus) || 0;
  const shield = Number(armor.shield) || 0;
  return { base, dex, armor: armorBonus + equipment, shield, buffs, total: base + dex + armorBonus + equipment + shield + buffs };
}

export function initiativeBreakdown(character) {
  const dex = abilityModifier(character, 'des');
  const weapon = equippedWeapon(character);
  const mastery = weapon ? M.masteryEffects(character, weapon).initiative : 0;
  const buffs = buffTotals(character).initiative + (Number(character.dnd.initiative.buffs) || 0) + mastery;
  const feats = Number(character.dnd.initiative.feats) || 0;
  return { dex, buffs, feats, total: dex + buffs + feats };
}

export function attackBreakdown(character, weapon) {
  if (!weapon) return { ability: 0, proficiency: 0, buffs: 0, mastery: 0, total: 0 };
  const ability = abilityModifier(character, weapon.ability || 'for');
  const proficiencyPart = weapon.proficient === false ? 0 : proficiency(character);
  const buffs = buffTotals(character).attack;
  const mastery = M.masteryEffects(character, weapon).attack;
  return { ability, proficiency: proficiencyPart, buffs, mastery, total: ability + proficiencyPart + buffs + mastery };
}

export function damageBreakdown(character, weapon) {
  if (!weapon) return { dice: '—', ability: 0, buffs: 0, mastery: 0, totalBonus: 0, additionalDice: [], expression: '—' };
  const ability = abilityModifier(character, weapon.ability || 'for');
  const buffs = buffTotals(character).damage;
  const mastery = M.masteryEffects(character, weapon).damage;
  const totalBonus = ability + buffs + mastery;
  const additionalDice = (character.buffs || [])
    .map(buff => String(buff.damageDice || '').trim())
    .filter(Boolean);
  const baseExpression = `${weapon.damageDice || '1d6'}${totalBonus === 0 ? '' : signed(totalBonus)}`;
  return {
    dice: weapon.damageDice || '1d6', ability, buffs, mastery, totalBonus, additionalDice,
    expression: Number.isFinite(totalBonus) ? [baseExpression, ...additionalDice].join(' + ') : 'Erro de cálculo'
  };
}
