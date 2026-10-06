import { calculateCharacter } from '../auto_calc_engine/characterCalculator.js';
import { limitResourceCurrent } from '../domain/calculationTargets.js';

// Events are commands. Rendering and synchronization never call this function.
export function advanceEvent(c, event) {
  if (!['turn', 'round', 'rest'].includes(event)) throw Error('Evento temporal inválido.');
  const calculated = calculateCharacter(c);
  const changes = new Map();
  for (const effect of c.temporal.effects) {
    if (!effect.active || effect.kind !== 'resource' || effect.event !== event) continue;
    if (calculated.errors[effect.target]) throw Error(`Recurso com erro: ${calculated.errors[effect.target]}`);
    changes.set(effect.target, (changes.get(effect.target) || 0) + effect.amount);
  }
  // Simultaneous resource changes use the maximum at the start of the event.
  for (const [target, amount] of changes) {
    const resource = c.resources.find(r => `resource:${r.id}` === target);
    resource.current = limitResourceCurrent(c, target, resource.current + amount, calculated.values[target]);
  }
  c.temporal[event] += 1;
  for (const effect of c.temporal.effects) {
    if (!effect.active || effect.durationUnit !== event) continue;
    effect.remaining -= 1;
    if (effect.remaining === 0) effect.active = false;
  }
}
