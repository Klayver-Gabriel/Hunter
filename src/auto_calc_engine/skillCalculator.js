import { componentBreakdown } from './componentResults.js';

export function skillBreakdown(character, skill) {
  return componentBreakdown(character, `skill:${skill.key}`, { ability: 0, proficiency: 0, external: 0, mastery: 0, manual: 0, profMultiplier: 0 });
}
export function saveBreakdown(character, ability) {
  return componentBreakdown(character, `save:${ability}`, { ability: 0, proficiency: 0 });
}
