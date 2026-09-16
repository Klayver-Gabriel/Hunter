import { abilityModifier, proficiency, equippedWeapon } from './common.js';
import * as M from './masteryCalculator.js';

export function skillBreakdown(character, skill) {
  const state = character.dnd.skills[skill.key] || {};
  const ability = abilityModifier(character, skill.ability);
  const profMultiplier = state.expertise ? 2 : state.proficient ? 1 : 0;
  const proficiencyPart = proficiency(character) * profMultiplier;
  const external = (character.buffs || [])
    .filter(buff => buff.skill === skill.key)
    .reduce((total, buff) => total + (Number(buff.skillBonus) || 0), 0);
  const weapon = equippedWeapon(character);
  const mastery = weapon
    ? (M.masteryEffects(character, weapon).skills[skill.key] || 0)
    : 0;
  return {
    ability,
    proficiency: proficiencyPart,
    external,
    mastery,
    total: ability + proficiencyPart + external + mastery,
    profMultiplier
  };
}

export function saveBreakdown(character, ability) {
  const abilityPart = abilityModifier(character, ability);
  const proficiencyPart = character.dnd.saves[ability] ? proficiency(character) : 0;
  return { ability: abilityPart, proficiency: proficiencyPart, total: abilityPart + proficiencyPart };
}
