import { createAppearance, validateAppearance } from '../domain/sheetAppearance.js';
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
  let state = freeze(synchronize(structuredClone(initial.character || initial)));
  let appearance = freeze(validateAppearance(initial.sheetAppearance || createAppearance()));
  const listeners = new Set();
  function publish(next, scope) {
    state = freeze(synchronize(next));
    for (const listener of listeners) listener(state, scope);
  }
  return {
    getState: () => state,
    getDocument: () => ({ formatVersion: 1, character: state, sheetAppearance: appearance }),
    replaceDocument(next) {
      appearance = freeze(validateAppearance(next.sheetAppearance));
      publish(structuredClone(next.character), 'replace'); return true;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispatch(type, payload) {
      const draft = structuredClone(state);
      applyCommand(draft, type, payload);
      draft.meta.updatedAt = new Date().toISOString();
      publish(draft, type); return true;
    },
  };
}
