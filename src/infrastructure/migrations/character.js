import { createDefault, createSkillState, createSaveState, ATTRS, uid } from '../../domain/character.js';
import * as D from '../../domain/catalog.js';

export function migrateCharacter(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Formato de ficha inválido.');
  }

  if (raw.schemaVersion != null && (![1, 2].includes(raw.schemaVersion))) {
    throw new Error('Versão de ficha incompatível.');
  }
  for (const key of ['info', 'attributes', 'equipment', 'dnd', 'library', 'meta', 'masteries']) {
    if (raw[key] != null && (typeof raw[key] !== 'object' || Array.isArray(raw[key]))) throw new Error(`Campo inválido: ${key}`);
  }
  if (!['info', 'attributes', 'equipment', 'resources'].some(key => Object.hasOwn(raw, key))) throw new Error('O arquivo não contém uma ficha.');
  raw = structuredClone(raw);
  const defaults = createDefault();
  const sourceLibrary = raw.library && typeof raw.library === 'object' ? raw.library : {};
  const weapons = Array.isArray(sourceLibrary.weapons) ? [...sourceLibrary.weapons] : [];
  const armors = Array.isArray(sourceLibrary.armors) ? [...sourceLibrary.armors] : [];
  const sourceEquipment = raw.equipment && typeof raw.equipment === 'object' ? raw.equipment : {};

  // Compatibilidade com a reserva `equipment.weapon` do schema v1.
  if (sourceEquipment.weapon && typeof sourceEquipment.weapon === 'object') {
    const legacyWeapon = { ...sourceEquipment.weapon, id: sourceEquipment.weapon.id || uid('weapon') };
    if (!weapons.some(weapon => weapon.id === legacyWeapon.id)) weapons.push(legacyWeapon);
    sourceEquipment.weaponId = legacyWeapon.id;
  }

  const sourceDnd = raw.dnd && typeof raw.dnd === 'object' ? raw.dnd : {};
  const sourceSkills = sourceDnd.skills && typeof sourceDnd.skills === 'object' ? sourceDnd.skills : {};
  const skills = { ...sourceSkills, ...createSkillState() };
  D.SKILLS.forEach(skill => {
    const state = sourceSkills[skill.key] || {};
    skills[skill.key] = {
      ...state,
      proficient: Boolean(state.proficient || state.expertise),
      expertise: Boolean(state.expertise)
    };
  });

  const saves = createSaveState();
  const sourceSaves = sourceDnd.saves && typeof sourceDnd.saves === 'object' ? sourceDnd.saves : {};
  ATTRS.forEach(ability => { saves[ability] = Boolean(sourceSaves[ability]); });
  const sourceVitality = sourceDnd.vitality && typeof sourceDnd.vitality === 'object' ? sourceDnd.vitality : {};
  const legacyHitDie = Number(String(sourceVitality.hitDie || defaults.dnd.vitality.hitDie).replace(/\D/g, '')) || 10;
  const vitality = {
    ...defaults.dnd.vitality,
    ...sourceVitality,
    firstLevelFormula: sourceVitality.firstLevelFormula || `${legacyHitDie} + CON`,
    laterLevelFormula: sourceVitality.laterLevelFormula || `${Math.floor(legacyHitDie / 2) + 1} + CON`
  };

  const migrated = {
    ...defaults,
    ...raw,
    schemaVersion: 2,
    info: { ...defaults.info, ...(raw.info || {}) },
    attributes: { ...defaults.attributes, ...(raw.attributes || {}) },
    resources: Array.isArray(raw.resources) ? raw.resources : defaults.resources,
    powers: Array.isArray(raw.powers) ? raw.powers : [],
    spells: Array.isArray(raw.spells) ? raw.spells : [],
    journal: Array.isArray(raw.journal) ? raw.journal : [],
    dnd: {
      ...sourceDnd,
      skills,
      saves,
      armor: { ...defaults.dnd.armor, ...(sourceDnd.armor || {}) },
      initiative: { ...defaults.dnd.initiative, ...(sourceDnd.initiative || {}) },
      vitality
    },
    equipment: {
      ...defaults.equipment,
      ...sourceEquipment,
      weaponId: sourceEquipment.weaponId || null,
      armor: { ...defaults.equipment.armor, ...(sourceEquipment.armor || {}) },
      jewels: Array.isArray(sourceEquipment.jewels) ? sourceEquipment.jewels : [],
      talisman: sourceEquipment.talisman || null
    },
    buffs: Array.isArray(raw.buffs) ? raw.buffs : [],
    masteries: raw.masteries && typeof raw.masteries === 'object' ? raw.masteries : {},
    library: { ...sourceLibrary, weapons, armors },
    meta: { ...defaults.meta, ...(raw.meta || {}) }
  };

  const collections = [migrated.resources, migrated.powers, migrated.spells, migrated.journal,
    migrated.library.weapons, migrated.library.armors, migrated.buffs];
  for (const list of collections) {
    const seen = new Set();
    for (const item of list) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Item inválido na ficha.');
      item.id ||= uid('item');
      if (typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) || ['__proto__', 'constructor', 'prototype'].includes(item.id) || seen.has(item.id)) throw new Error('Identificador inválido ou duplicado.');
      seen.add(item.id);
    }
  }
  for (const key of ATTRS) {
    const value = Number(migrated.attributes[key]);
    if (!Number.isFinite(value)) throw new Error('Atributo inválido.');
    migrated.attributes[key] = value;
  }
  for (const resource of migrated.resources) {
    for (const key of ['current', 'max']) {
      const value = Number(resource[key] ?? 0);
      if (!Number.isFinite(value)) throw new Error('Valor de recurso inválido.');
      resource[key] = value;
    }
    resource.name = String(resource.name || 'Recurso');
    resource.removable = resource.type === 'custom' && resource.removable !== false;
  }
  for (const [id, state] of Object.entries(migrated.masteries)) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || !state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Maestria inválida.');
  }
  return migrated;
}

