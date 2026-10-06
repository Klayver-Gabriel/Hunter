import { findCalculableComponent } from '../domain/calculableComponents.js';
import { allSkills, validateSkillTables } from '../domain/skillTemplates.js';
import { recordFor, recordNameKey, displayName } from '../domain/componentCatalog.js';
import { validateAppearance } from '../domain/sheetAppearance.js';
import { applyCommand } from './commands.js';
import { calculateCharacter } from '../auto_calc_engine/characterCalculator.js';

/** Shared by preview and commit; changes only the caller's private document draft. */
export function applyComponentConfiguration(document, patch) {
  if (patch.createCharacteristic) {
    const { id } = patch.createCharacteristic;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) || document.character.calculations.characteristics.some(c => c.id === id)
      || patch.componentId !== `characteristic:${id}`) throw Error('Identificador de nova característica inválido.');
    document.character.calculations.characteristics.push({ id, name: 'Nova característica', base: 0 });
  }
  const component = findCalculableComponent(document, patch.componentId), c = document.character;
  const labelId = component.aliases.includes(patch.componentId) ? patch.componentId : component.labelId;
  if (patch.name != null) {
    if (typeof patch.name !== 'string' || !patch.name.trim() || patch.name.length > 120) throw Error('Nome deve conter de 1 a 120 caracteres.');
    if (patch.name.trim() !== displayName(c, document.sheetAppearance, labelId, component.name)) {
      const record = recordFor(c, labelId);
      if (record) { const key = recordNameKey(record, labelId); record.originalName ||= record[key]; record[key] = patch.name.trim(); }
      else (document.sheetAppearance.components[labelId] ||= {}).label = patch.name.trim();
    }
  }
  const params = patch.parameters || {}, normalized = {};
  for (const [key, raw] of Object.entries(params)) {
    const field = component.fields.find(f => f.key === key);
    if (!field) throw Error(`Parâmetro inválido: ${key}.`);
    let value = raw;
    if (field.type === 'number') {
      value = field.optional && raw === '' ? null : Number(raw);
      if (value !== null && (raw === '' || !Number.isFinite(value) || (field.min != null && value < field.min) || (field.step === 1 && !Number.isInteger(value)))) throw Error(`${field.label}: informe um número válido.`);
    } else if (field.type === 'checkbox') {
      if (typeof value !== 'boolean') throw Error(`${field.label}: valor inválido.`);
    } else if (typeof value !== 'string' || (field.type === 'select' && !field.options.some(o => String(o.value) === value))) throw Error(`${field.label}: valor inválido.`);
    normalized[key] = value;
  }
  if (component.kind === 'skill') {
    const key = component.id.slice(6), skill = allSkills(c).find(s => s.key === key);
    for (const field of ['ability', 'bonus']) if (Object.hasOwn(normalized, field)) skill[field] = normalized[field];
    // Validation is shared with the table editor, but this transaction edits one row.
    validateSkillTables(c.skillTables);
    const state = c.dnd.skills[key];
    if (Object.hasOwn(normalized, 'proficient')) state.proficient = normalized.proficient;
    if (Object.hasOwn(normalized, 'expertise')) state.expertise = normalized.expertise;
    if (normalized.proficient === false && component.parameters.proficient) state.expertise = false;
    else if (state.expertise) state.proficient = true;
  } else {
    for (const [key, value] of Object.entries(normalized)) {
      if (key.startsWith('casting.')) c.calculations.spellcasting[key.slice(8)] = value;
      else if (component.kind === 'spell') {
        const spell = c.spells.find(s => `spell:${s.id}` === component.id);
        spell.dt ||= { mode: 'none', bonus: 0, resistance: '' };
        if (key.startsWith('dt.')) spell.dt[key.slice(3)] = value;
        else spell[key] = value;
      } else {
        const parts = key.split('.'), leaf = parts.pop();
        parts.reduce((o, k) => o[k], c)[leaf] = value;
      }
    }
  }
  const rule = structuredClone(patch.rule || component.calculation);
  if (patch.nonNegative != null) rule.nonNegative = patch.nonNegative;
  applyCommand(c, 'setCalculationRule', { target: component.id, rule, value: patch.value });
  document.sheetAppearance = validateAppearance(document.sheetAppearance);
  return component;
}
export function previewComponentConfiguration(document, patch) {
  const draft = structuredClone(document);
  const component = applyComponentConfiguration(draft, patch);
  return { document: draft, component, result: calculateCharacter(draft.character) };
}
