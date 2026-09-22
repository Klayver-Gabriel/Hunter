import { calculateCharacter } from './characterCalculator.js';
import { legacyHpBreakdown } from './legacyHpCalculator.js';
export { hitDieSides } from './legacyHpCalculator.js';

export function maxHpBreakdown(character) {
  const calculated = calculateCharacter(character);
  const result = legacyHpBreakdown(character, calculated.values['attribute:con']);
  const hp = character.resources.find(r => r.type === 'hp' || r.id === 'hp');
  if (hp) {
    const id = `resource:${hp.id}`;
    result.total = calculated.values[id] ?? null;
    result.errors = calculated.errors[id] ? [calculated.errors[id]] : [];
    result.configured = Boolean(character.calculations?.rules[id]);
  }
  return result;
}
