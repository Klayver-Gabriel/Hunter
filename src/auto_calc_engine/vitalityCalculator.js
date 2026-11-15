import { calculateCharacter } from './characterCalculator.js';
import { legacyHpBreakdown } from './legacyHpCalculator.js';
export { hitDieSides } from './legacyHpCalculator.js';

export function maxHpBreakdown(character) {
  const calculation = calculateCharacter(character);
  const breakdown = legacyHpBreakdown(character, calculation.values['attribute:con']);
  const hitPointResource = character.resources.find(resource => resource.type === 'hp' || resource.id === 'hp');
  if (!hitPointResource) return breakdown;

  const resourceId = `resource:${hitPointResource.id}`;
  const rule = character.calculations?.rules?.[resourceId];
  const error = calculation.errors[resourceId];

  return {
    ...breakdown,
    total: calculation.values[resourceId] ?? null,
    errors: error ? [error] : [],
    configured: Boolean(rule && rule.mode !== 'default')
  };
}
