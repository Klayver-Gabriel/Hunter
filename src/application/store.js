import { createAppearance, validateAppearance, validId } from '../domain/sheetAppearance.js';
import { applyCommand } from './commands.js';
import { level } from '../auto_calc_engine/index.js';
import { calculateCharacter } from '../auto_calc_engine/characterCalculator.js';
import { createCalculations, createTemporal } from '../domain/calculations.js';
import { componentCatalog, recordFor, recordNameKey } from '../domain/componentCatalog.js';
import { initializeSkillTables } from '../domain/skillTemplates.js';
export function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function synchronize(c) {
  initializeSkillTables(c);
  c.calculations ||= createCalculations(); c.temporal ||= createTemporal();
  for (const resource of c.resources) resource.baseMax ??= resource.max;
  const result = calculateCharacter(c);
  for (const resource of c.resources) {
    const value = result.values[`resource:${resource.id}`];
    if (value != null) { resource.max = value; resource.current = Math.max(0, Math.min(resource.current, value)); }
  }
  for (const [id, history] of Object.entries(result.histories)) c.calculations.rules[id].history = history;
  c.dnd.vitality.hitDiceRemaining = Math.min(level(c), Math.max(0, Number(c.dnd.vitality.hitDiceRemaining) || 0));
  return c;
}
export function createStore(initial) {
  let state = freeze(synchronize(structuredClone(initial.character || initial)));
  let appearance = freeze(validateAppearance(initial.sheetAppearance || createAppearance()));
  const listeners = new Set();
  function publish(next, scope, nextAppearance = appearance) {
    state = freeze(synchronize(next));
    appearance = freeze(nextAppearance);
    for (const listener of listeners) listener(state, scope);
  }
  function updateComponent(id, key, value, scope) {
    if (!validId(id)) throw Error('Componente inválido.');
    const next = structuredClone(appearance);
    const component = next.components[id] || {};
    if (value === null) delete component[key];
    else component[key] = value;
    if (Object.keys(component).length) next.components[id] = component;
    else delete next.components[id];
    const validated = validateAppearance(next);
    if (JSON.stringify(validated) === JSON.stringify(appearance)) return false;
    appearance = freeze(validated);
    for (const listener of listeners) listener(state, scope);
    return true;
  }
  return {
    getState: () => state,
    getDocument: () => ({ formatVersion: 1, character: state, sheetAppearance: appearance }),
    replaceDocument(next) {
      const nextAppearance = freeze(validateAppearance(next.sheetAppearance));
      const nextState = freeze(synchronize(structuredClone(next.character)));
      appearance = nextAppearance; state = nextState;
      for (const listener of listeners) listener(state, 'replace');
      return true;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    customizeComponents(changes) {
      const next = structuredClone(appearance), draft = structuredClone(state);
      const catalog = componentCatalog(state, appearance);
      for (const change of changes) {
        const entry = catalog.find(e => e.id === change.id);
        if (!entry) throw Error('Componente inexistente.');
        const component = next.components[change.id] ||= {};
        if (Object.hasOwn(change, 'label')) {
          if (change.label !== null && (typeof change.label !== 'string' || !change.label.trim() || change.label.length > 120)) throw Error('Nome deve conter de 1 a 120 caracteres.');
          const record = recordFor(draft, change.id);
          if (record) {
            const key = recordNameKey(record, change.id);
            record.originalName ||= record[key];
            record[key] = change.label === null ? record.originalName : change.label.trim();
            delete component.label;
          } else if (change.label === null) delete component.label;
          else component.label = change.label.trim();
        }
        if (Object.hasOwn(change, 'hidden')) {
          if (typeof change.hidden !== 'boolean') throw Error('Visibilidade inválida.');
          if (change.hidden) component.hidden = true; else delete component.hidden;
        }
        if (!Object.keys(component).length) delete next.components[change.id];
      }
      const validated = freeze(validateAppearance(next));
      const nextState = freeze(synchronize(draft));
      appearance = validated; state = nextState;
      for (const listener of listeners) listener(state, 'customizeComponents');
      return true;
    },
    renameComponent(id, label) {
      if (recordFor(state, id)) return this.customizeComponents([{ id, label }]);
      if (!validId(id)) throw Error('Componente inválido.');
      if (label !== null && (typeof label !== 'string' || !label.trim() || label.length > 120)) {
        throw Error('Nome deve conter de 1 a 120 caracteres.');
      }
      return updateComponent(id, 'label', label, 'renameComponent');
    },
    setComponentHidden(id, hidden) {
      if (typeof hidden !== 'boolean') throw Error('Visibilidade inválida.');
      return updateComponent(id, 'hidden', hidden ? true : null, 'setComponentHidden');
    },
    dispatch(type, payload) {
      const draft = structuredClone(state);
      applyCommand(draft, type, payload);
      let nextAppearance = appearance;
      if (type === 'saveSkillTemplate') {
        // The template editor starts with displayed names; commit them as table data.
        nextAppearance = structuredClone(appearance);
        for (const skill of state.skillTables.templates[payload.id]) {
          if (!payload.skills.some(row => row.key === skill.key)) delete nextAppearance.components[`skill:${skill.key}`];
        }
        for (const skill of payload.skills) {
          const id = `skill:${skill.key}`, component = nextAppearance.components[id];
          if (!component) continue;
          delete component.label;
          if (!Object.keys(component).length) delete nextAppearance.components[id];
        }
      }
      draft.meta.updatedAt = new Date().toISOString();
      publish(draft, type, nextAppearance); return true;
    },
  };
}
