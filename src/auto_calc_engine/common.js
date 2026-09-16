import * as F from './formulaEvaluator.js';
import * as D from '../domain/catalog.js';

export function signed(value) {
  const n = Number(value) || 0;
  return `${n >= 0 ? '+' : ''}${n}`;
}

export function level(character) {
  return Math.max(1, Math.min(20, Number(character.info.level) || 1));
}

export function proficiency(character) {
  return F.proficiencyBonus(level(character));
}

export function abilityModifier(character, ability) {
  return F.mod(character.attributes[ability]);
}

export function buffTotals(character) {
  return (character.buffs || []).reduce((totals, buff) => {
    Object.keys(totals).forEach(key => {
      totals[key] += Number(buff[key]) || 0;
    });
    return totals;
  }, {
    attack: 0, damage: 0, armorClass: 0, initiative: 0, hp: 0
  });
}

export function equippedArmor(character) {
  const armorLibrary = character.library.armors || [];
  const equipped = character.equipment.armor || {};
  return D.ARMOR_SLOTS.map(slot => armorLibrary.find(item => item.id === equipped[slot.key])).filter(Boolean);
}

export function equippedWeapon(character) {
  return (character.library.weapons || []).find(weapon => weapon.id === character.equipment.weaponId) || null;
}

