import { ABILITIES, ARMOR_TYPES } from './catalog.js';
import { allSkills } from './skillTemplates.js';
import { calculationTargets } from './calculationTargets.js';
import { displayName } from './componentCatalog.js';

const field = (key, label, type = 'number', extra = {}) => ({ key, label, type, ...extra });
const abilities = ABILITIES.map(a => ({ value: a.key, label: a.label }));
const armorFields = [field('dnd.armor.type', 'Tipo de armadura', 'select', { options: ARMOR_TYPES }),
  ...Object.entries({ base: 'Base da CA', armorBonus: 'Bônus de armadura', shield: 'Escudo', buffs: 'Buff manual de CA' }).map(([key, label]) => field(`dnd.armor.${key}`, label))];
const vitalityFields = [field('dnd.vitality.hitDie', 'Dado de Vida', 'select', { options: [6, 8, 10, 12].map(n => ({ value: `d${n}`, label: `d${n}` })) }),
  field('dnd.vitality.hitDiceRemaining', 'Dados restantes', 'number', { min: 0, step: 1 }),
  field('dnd.vitality.firstLevelFormula', 'Fórmula legada do 1º nível', 'text'), field('dnd.vitality.laterLevelFormula', 'Fórmula legada por nível seguinte', 'text'),
  field('dnd.vitality.featBonus', 'PV por talentos'), field('dnd.vitality.buffs', 'PV por buffs')];
const readPath = (c, path) => path.split('.').reduce((o, k) => o?.[k], c);

/** Each type owns its editing capabilities; the popup only understands field metadata. */
export const COMPONENT_TYPES = {
  attribute: () => ({ fields: [] }),
  resource: (c, key) => ({ fields: c.resources.find(r => r.id === key)?.type === 'hp' || key === 'hp' ? vitalityFields : [] }),
  characteristic: () => ({ fields: [] }),
  save: (c, key) => ({ fields: [field(`dnd.saves.${key}`, 'Proficiência', 'checkbox')] }),
  skill: (c, key) => ({ fields: [field('ability', 'Atributo associado', 'select', { options: abilities }), field('proficient', 'Proficiência', 'checkbox'), field('expertise', 'Expertise', 'checkbox'), field('bonus', 'Bônus manual')],
    values: { ...allSkills(c).find(s => s.key === key), ...c.dnd.skills[key] } }),
  indicator: () => ({ fields: [] }),
  metric: (c, key) => ({ fields: key === 'armor' ? armorFields : key === 'initiative' ? [field('dnd.initiative.buffs', 'Buff de iniciativa'), field('dnd.initiative.feats', 'Talentos de iniciativa')] : [] }),
  armor: () => ({ fields: [] }),
  attack: () => ({ fields: [] }),
  spellcasting: () => ({ fields: [field('casting.ability', 'Atributo de conjuração', 'select', { options: abilities }), field('casting.bonus', 'Bônus global da DT'), field('casting.formula', 'Fórmula padrão da DT', 'text', { formula: true })] }),
  spell: (c, key) => {
    const s = c.spells.find(s => s.id === key), dt = s.dt || { mode: 'none', bonus: 0, resistance: '' };
    return { fields: [field('dt.mode', 'DT padrão desta magia', 'select', { options: [{ value: 'global', label: 'Herdar DT global' }, { value: 'formula', label: 'Fórmula própria' }, { value: 'fixed', label: 'DT fixa' }, { value: 'none', label: 'Sem DT' }] }),
      field('dt.formula', 'Fórmula própria padrão', 'text', { formula: true, when: ['dt.mode', 'formula'] }), field('dt.fixed', 'DT fixa padrão', 'number', { when: ['dt.mode', 'fixed'] }),
      field('dt.bonus', 'Bônus da magia'), field('dt.resistance', 'Resistência', 'select', { options: [{ value: '', label: 'Nenhuma' }, ...abilities] }), field('circle', 'Círculo numérico', 'number', { optional: true, min: 0, step: 1 })],
    values: { 'dt.mode': dt.mode, 'dt.formula': dt.formula || '8 + PROFICIENCIA + MOD_CONJURACAO + BONUS_MAGIA', 'dt.fixed': dt.fixed ?? 10, 'dt.bonus': dt.bonus, 'dt.resistance': dt.resistance || '', circle: s.circle ?? '' } };
  }
};

export function getCalculableComponents(document) {
  const c = document.character, appearance = document.sheetAppearance;
  return calculationTargets(c).map(id => {
    const [kind, key] = id.split(':'), type = COMPONENT_TYPES[kind](c, key);
    const labelId = kind === 'characteristic' ? `record:characteristics:${key}` : id === 'spellcasting' ? 'metric:dt' : id;
    const aliases = kind === 'resource' && c.resources.find(r => r.id === key) === c.resources.find(r => r.type === 'hp' || r.id === 'hp') ? ['metric:hp'] : [];
    const calculation = c.calculations.rules[id] || { mode: 'default' };
    const parameters = type.values || Object.fromEntries(type.fields.map(f => [f.key, f.key.startsWith('casting.') ? c.calculations.spellcasting[f.key.slice(8)] : readPath(c, f.key)]));
    const fields = type.fields.map(f => ({ ...f, label: f.key.startsWith('dnd.') ? displayName(c, appearance, `config:${f.key}`, f.label) : f.label,
      ...(f.options ? { options: f.options.map(o => ({ ...o, label: abilities.some(a => a.value === o.value) ? displayName(c, appearance, `${f.key === 'dt.resistance' ? 'save' : 'attribute'}:${o.value}`, o.label) : o.label })) } : {}) }));
    return { id, kind, name: displayName(c, appearance, labelId, kind === 'spell' ? `DT de ${c.spells.find(s => s.id === key).title}` : undefined), labelId, aliases,
      calculation, nonNegative: calculation.nonNegative ?? kind === 'resource', parameters, fields,
      inlineManual: ['attribute', 'resource'].includes(kind) && (calculation.mode === 'manual' || (calculation.mode === 'default' && !(kind === 'resource' && (key === 'hp' || c.resources.find(r => r.id === key)?.type === 'hp')))) };
  });
}
export function findCalculableComponent(document, componentId) {
  const component = getCalculableComponents(document).find(c => c.id === componentId || c.labelId === componentId || c.aliases.includes(componentId));
  if (!component) throw Error('Componente calculável inexistente.');
  return component;
}
