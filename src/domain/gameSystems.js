import { ABILITIES, SKILLS } from './catalog.js';
import { ATTRS, createDefault, DEFAULT_RESOURCES } from './character.js';
import { createCalculations, validateCalculations } from './calculations.js';
import { createAppearance, validateAppearance } from './sheetAppearance.js';

const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function assertSafeTree(value) {
  let count = 0;
  function visit(node, depth = 0) {
    if (depth > 25 || ++count > 50000) throw Error('Configuração de sistema complexa demais.');
    if (node && typeof node === 'object') for (const [key, child] of Object.entries(node)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('Configuração de sistema inválida.');
      visit(child, depth + 1);
    }
  }
  visit(value);
}

const tormenta = [
  ['for', [['atletismo', 'Atletismo'], ['luta', 'Luta']]],
  ['des', [['acrobacia', 'Acrobacia'], ['cavalgar', 'Cavalgar'], ['furtividade', 'Furtividade'], ['iniciativa', 'Iniciativa'], ['ladinagem', 'Ladinagem'], ['pilotagem', 'Pilotagem'], ['pontaria', 'Pontaria'], ['reflexos', 'Reflexos']]],
  ['con', [['fortitude', 'Fortitude']]],
  ['int', [['conhecimento', 'Conhecimento'], ['guerra', 'Guerra'], ['investigacao', 'Investigação'], ['misticismo', 'Misticismo'], ['nobreza', 'Nobreza'], ['oficio', 'Ofício']]],
  ['sab', [['cura', 'Cura'], ['intuicao', 'Intuição'], ['percepcao', 'Percepção'], ['religiao', 'Religião'], ['sobrevivencia', 'Sobrevivência'], ['vontade', 'Vontade']]],
  ['car', [['adestramento', 'Adestramento'], ['atuacao', 'Atuação'], ['diplomacia', 'Diplomacia'], ['enganacao', 'Enganação'], ['intimidacao', 'Intimidação'], ['jogatina', 'Jogatina']]]
];

function defaultSkills(id) {
  if (id === 'dnd5e') return SKILLS.map(skill => ({ ...skill, bonus: 0 }));
  return tormenta.flatMap(([ability, skills]) => skills.map(([key, name]) => ({ key: `t20_${key}`, name, ability, bonus: 0 })));
}

export function createDefaultSystem(id) {
  if (!['dnd5e', 'tormenta20'].includes(id)) throw Error('Sistema padrão desconhecido.');
  return {
    id,
    title: id === 'dnd5e' ? 'D&D 5e' : 'Tormenta20',
    revision: 1,
    config: {
      skills: defaultSkills(id),
      calculations: createCalculations(),
      appearance: createAppearance(),
      attributes: { values: Object.fromEntries(ATTRS.map(key => [key, 10])), labels: {} },
      resources: DEFAULT_RESOURCES.map(resource => ({ ...resource }))
    }
  };
}

export const createDefaultSystems = () => [createDefaultSystem('dnd5e'), createDefaultSystem('tormenta20')];

export function validateSystemProfile(value) {
  assertSafeTree(value);
  if (!object(value) || !idPattern.test(value.id) || typeof value.title !== 'string'
    || !value.title.trim() || value.title.trim().length > 120 || !object(value.config)) throw Error('Sistema inválido.');
  const config = value.config;
  if (!Array.isArray(config.skills) || config.skills.length > 100) throw Error('Tabela de perícias inválida.');
  const seen = new Set();
  for (const row of config.skills) {
    if (!object(row) || !idPattern.test(row.key) || seen.has(row.key) || typeof row.name !== 'string'
      || !row.name.trim() || row.name.length > 120 || !ABILITIES.some(item => item.key === row.ability)
      || typeof row.bonus !== 'number' || !Number.isFinite(row.bonus)) throw Error('Perícia inválida.');
    seen.add(row.key);
  }
  if (!object(config.calculations) || !object(config.calculations.rules) || !Array.isArray(config.calculations.characteristics)) throw Error('Cálculos do sistema inválidos.');
  const validationCharacter = createDefault();
  validationCharacter.calculations = structuredClone(config.calculations);
  validationCharacter.resources = structuredClone(config.resources || []);
  validationCharacter.skillTables = { activeId: value.id, templates: { [value.id]: structuredClone(config.skills) } };
  validateCalculations(validationCharacter);
  validateAppearance(config.appearance);
  if (!object(config.attributes) || !object(config.attributes.values) || !object(config.attributes.labels)) throw Error('Atributos do sistema inválidos.');
  for (const key of ATTRS) {
    const amount = config.attributes.values[key];
    if (typeof amount !== 'number' || !Number.isFinite(amount)) throw Error('Valor padrão de atributo inválido.');
    const label = config.attributes.labels[key];
    if (label != null && (typeof label !== 'string' || !label.trim() || label.length > 120)) throw Error('Nome de atributo inválido.');
  }
  if (!Array.isArray(config.resources) || config.resources.length > 100) throw Error('Recursos do sistema inválidos.');
  const resourceIds = new Set();
  for (const resource of config.resources) {
    if (!object(resource) || !idPattern.test(resource.id) || resourceIds.has(resource.id)
      || typeof resource.name !== 'string' || !resource.name.trim() || resource.name.length > 120
      || typeof resource.type !== 'string' || !Number.isFinite(resource.max)) throw Error('Recurso do sistema inválido.');
    resourceIds.add(resource.id);
  }
  return { id: value.id, title: value.title.trim(), revision: Number.isSafeInteger(value.revision) ? value.revision : 1,
    config: structuredClone(config) };
}

const objectMerge = (base, override) => {
  if (Array.isArray(base) && Array.isArray(override)
    && [...base, ...override].every(item => object(item) && typeof (item.id || item.key) === 'string')) {
    const identity = item => item.id || item.key;
    const changes = new Map(override.map(item => [identity(item), item]));
    const removed = new Set(override.filter(item => item.removed).map(identity));
    const result = base.filter(item => !removed.has(identity(item))).map(item => {
      const change = changes.get(identity(item));
      return change ? objectMerge(item, change) : structuredClone(item);
    });
    const known = new Set(base.map(identity));
    return result.concat(override.filter(item => !item.removed && !known.has(identity(item))).map(item => structuredClone(item)));
  }
  if (!object(base) || !object(override)) return structuredClone(override ?? base);
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    if (value === null) delete result[key];
    else result[key] = (object(value) || Array.isArray(value)) && (object(base[key]) || Array.isArray(base[key]))
      ? objectMerge(base[key], value) : structuredClone(value);
  }
  return result;
};

function difference(base, current) {
  if (JSON.stringify(base) === JSON.stringify(current)) return undefined;
  if (Array.isArray(base) && Array.isArray(current)
    && [...base, ...current].every(item => object(item) && typeof (item.id || item.key) === 'string')) {
    const identity = item => item.id || item.key;
    const baseById = new Map(base.map(item => [identity(item), item]));
    const currentById = new Map(current.map(item => [identity(item), item]));
    const result = [];
    for (const item of current) {
      const id = identity(item), original = baseById.get(id);
      if (!original) result.push(structuredClone(item));
      else {
        const changed = difference(original, item);
        if (changed !== undefined) result.push({ [Object.hasOwn(item, 'id') ? 'id' : 'key']: id, ...changed });
      }
    }
    for (const item of base) if (!currentById.has(identity(item))) result.push({ [Object.hasOwn(item, 'id') ? 'id' : 'key']: identity(item), removed: true });
    return result.length ? result : undefined;
  }
  if (!object(base) || !object(current)) return structuredClone(current);
  const result = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(current)])) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    if (!Object.hasOwn(current, key)) result[key] = null;
    else {
      const changed = difference(base[key], current[key]);
      if (changed !== undefined) result[key] = changed;
    }
  }
  return result;
}

function appearanceForSystem(profile) {
  const appearance = validateAppearance(profile.config.appearance);
  for (const [key, label] of Object.entries(profile.config.attributes.labels || {})) {
    if (!label) continue;
    appearance.components[`attribute:${key}`] ||= {};
    appearance.components[`attribute:${key}`].label = label;
    appearance.components[`save:${key}`] ||= {};
    appearance.components[`save:${key}`].label = label;
  }
  return appearance;
}

function skillDifference(base, current) {
  const baseById = new Map(base.map(row => [row.key, row]));
  const currentById = new Map(current.map(row => [row.key, row]));
  const result = [];
  for (const row of current) {
    const original = baseById.get(row.key);
    if (!original) { result.push({ ...row }); continue; }
    const changed = {};
    for (const [key, value] of Object.entries(row)) {
      if (JSON.stringify(value) !== JSON.stringify(original[key])) changed[key] = structuredClone(value);
    }
    if (Object.keys(changed).length) result.push({ key: row.key, ...changed });
  }
  for (const row of base) if (!currentById.has(row.key)) result.push({ key: row.key, removed: true });
  return result;
}

function mergeRows(base, overrideRows) {
  if (!Array.isArray(overrideRows)) return structuredClone(base);
  const removed = new Set(overrideRows.filter(row => row.removed).map(row => row.key));
  const rows = overrideRows.filter(row => !row.removed);
  const overrides = new Map(rows.map(row => [row.key, row]));
  const result = base.filter(row => !removed.has(row.key)).map(row => overrides.has(row.key) ? { ...row, ...overrides.get(row.key) } : { ...row });
  const known = new Set(base.map(row => row.key));
  return result.concat(rows.filter(row => !known.has(row.key)).map(row => ({ ...row })));
}

function normalizedResources(resources = []) {
  return resources.map(({ baseMax, max, ...resource }) => ({ ...resource, max: baseMax ?? max }));
}

export function resolveSystemDocument(raw, system, { allowLegacy = true } = {}) {
  if (!system) return raw;
  const profile = validateSystemProfile(system), result = structuredClone(raw);
  const character = result.character;
  const overrides = character.systemOverrides || {};
  assertSafeTree(overrides);
  const profileOverrides = overrides.profiles?.[profile.id];
  const legacy = allowLegacy && character.systemId === profile.id && !profileOverrides;
  let skillOverrides = profileOverrides?.skills;
  let calculationOverrides = profileOverrides?.calculations;
  let attributeOverrides = profileOverrides?.attributes;
  let resourceOverrides = profileOverrides?.resources;
  let appearanceOverrides = profileOverrides?.appearance;
  if (legacy) {
    skillOverrides ??= overrides.skillsBySystem?.[profile.id] ?? overrides.skills;
    if (skillOverrides == null && character.skillTables?.templates?.[profile.id]) {
      skillOverrides = skillDifference(profile.config.skills, character.skillTables.templates[profile.id]);
    }
    calculationOverrides ??= overrides.calculations ?? difference(profile.config.calculations, character.calculations) ?? {};
    attributeOverrides ??= overrides.attributes ?? difference(profile.config.attributes.values, character.attributes) ?? {};
    resourceOverrides ??= overrides.resources ?? difference(profile.config.resources, normalizedResources(character.resources)) ?? [];
    appearanceOverrides ??= result.sheetAppearance;
  }

  character.attributes = objectMerge(profile.config.attributes.values, attributeOverrides || {});
  character.resources = objectMerge(profile.config.resources, resourceOverrides || []);
  character.calculations = objectMerge(profile.config.calculations, calculationOverrides || {});
  character.skillTables = {
    activeId: profile.id,
    templates: { [profile.id]: mergeRows(profile.config.skills, skillOverrides) }
  };
  const systemAppearance = appearanceForSystem(profile);
  const personalAppearance = validateAppearance(appearanceOverrides || createAppearance());
  result.sheetAppearance = {
    version: 1,
    components: objectMerge(systemAppearance.components, personalAppearance.components),
    layouts: objectMerge(systemAppearance.layouts, personalAppearance.layouts)
  };
  character.systemId = profile.id;
  character.systemTitle = profile.title;
  return result;
}

export function captureSystemOverrides(raw, system) {
  if (!system) return raw;
  const profile = validateSystemProfile(system), result = structuredClone(raw), character = result.character;
  const overrides = structuredClone(character.systemOverrides || {});
  assertSafeTree(overrides);

  const profiles = { ...(overrides.profiles || {}) };
  for (const [id, skills] of Object.entries(overrides.skillsBySystem || {})) {
    profiles[id] ||= {};
    profiles[id].skills ??= structuredClone(skills);
  }
  const rows = character.skillTables?.templates?.[profile.id] || [];
  const skillChanges = skillDifference(profile.config.skills, rows);
  const profileOverrides = { ...(profiles[profile.id] || {}) };
  profileOverrides.skills = skillChanges;
  const calculationChanges = difference(profile.config.calculations, character.calculations);
  profileOverrides.calculations = calculationChanges || {};
  profileOverrides.attributes = difference(profile.config.attributes.values, character.attributes) || {};
  profileOverrides.resources = difference(profile.config.resources, normalizedResources(character.resources)) || [];
  const appearanceDiff = difference(appearanceForSystem(profile), result.sheetAppearance) || {};
  profileOverrides.appearance = { version: 1, components: appearanceDiff.components || {},
    layouts: { desktop: appearanceDiff.layouts?.desktop || {}, mobile: appearanceDiff.layouts?.mobile || {} } };
  profiles[profile.id] = profileOverrides;

  // Promote older account-wide overrides to the active profile before dropping the legacy fields.
  delete overrides.skills;
  delete overrides.skillsBySystem;
  delete overrides.calculations;
  delete overrides.attributes;
  delete overrides.resources;
  overrides.profiles = profiles;
  character.systemOverrides = overrides;
  result.sheetAppearance = structuredClone(profileOverrides.appearance);
  return result;
}

export function systemDefaultsFromCharacter(character, appearance = createAppearance()) {
  return validateSystemProfile({
    id: character.systemId || character.skillTables?.activeId || 'dnd5e',
    title: character.systemTitle || 'Novo sistema',
    revision: 1,
    config: {
      skills: character.skillTables?.templates?.[character.skillTables?.activeId] || defaultSkills('dnd5e'),
      calculations: character.calculations || createCalculations(),
      appearance,
      attributes: { values: { ...character.attributes }, labels: {} },
      resources: character.resources || DEFAULT_RESOURCES
    }
  });
}

export function legacySystemOverrides(character) {
  const tables = character.skillTables?.templates || {};
  const skillsBySystem = {};
  for (const id of ['dnd5e', 'tormenta20']) {
    const rows = tables[id];
    if (!Array.isArray(rows)) continue;
    const base = createDefaultSystem(id).config.skills;
    const current = new Map(rows.map(row => [row.key, row]));
    const defaults = new Map(base.map(row => [row.key, row]));
    const changes = rows.filter(row => !defaults.has(row.key)
      || JSON.stringify(row) !== JSON.stringify(defaults.get(row.key)));
    for (const row of base) if (!current.has(row.key)) changes.push({ key: row.key, removed: true });
    if (changes.length) skillsBySystem[id] = changes;
  }
  const standard = createCalculations(), original = character.calculations || standard;
  const calculations = {};
  if (Object.keys(original.rules || {}).length) calculations.rules = structuredClone(original.rules);
  if ((original.characteristics || []).length) calculations.characteristics = structuredClone(original.characteristics);
  if (JSON.stringify(original.spellcasting) !== JSON.stringify(standard.spellcasting)) calculations.spellcasting = structuredClone(original.spellcasting);
  return { skillsBySystem, calculations };
}
