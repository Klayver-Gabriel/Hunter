import { calculateCharacter } from './characterCalculator.js';

export function componentBreakdown(character, id, empty = {}) {
  const result = calculateCharacter(character), total = result.values[id] ?? NaN;
  const rule = character.calculations?.rules[id];
  return { ...(result.breakdowns[id] || empty), total,
    ...(rule && rule.mode !== 'default' ? { configured: true } : {}),
    ...(result.errors[id] ? { error: result.errors[id] } : {}) };
}
