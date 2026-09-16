import { applyCommand } from './commands.js';
import { maxHpBreakdown, level } from '../auto_calc_engine/index.js';
export function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function synchronize(c) {
  const hp = c.resources.find(r => r.id === 'hp' || r.type === 'hp');
  if (hp) { hp.max = maxHpBreakdown(c).total; hp.current = Math.min(Number(hp.current) || 0, hp.max); }
  c.dnd.vitality.hitDiceRemaining = Math.min(level(c), Math.max(0, Number(c.dnd.vitality.hitDiceRemaining) || 0));
  return c;
}
export function createStore(initial) {
  let state = freeze(synchronize(structuredClone(initial))), locked = false;
  const listeners = new Set();
  function publish(next, scope) {
    state = freeze(synchronize(next));
    for (const listener of listeners) listener(state, scope);
  }
  return {
    getState: () => state,
    setLocked: value => { locked = value; },
    isLocked: () => locked,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispatch(type, payload) {
      if (locked) return false;
      const draft = structuredClone(state);
      applyCommand(draft, type, payload);
      draft.meta.updatedAt = new Date().toISOString();
      publish(draft, type); return true;
    },
    replace(next) { if (locked) return false; publish(structuredClone(next), 'replace'); return true; }
  };
}
