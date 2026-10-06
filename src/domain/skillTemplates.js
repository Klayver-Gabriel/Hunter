import { ABILITIES, SKILLS } from './catalog.js';

export const SKILL_TEMPLATES = Object.freeze([
  { id: 'dnd5e', name: 'Tabela 1' },
  { id: 'tormenta20', name: 'Tabela 2' }
]);

const tormentaGroups = [
  ['for', [['atletismo', 'Atletismo'], ['luta', 'Luta']]],
  ['des', [['acrobacia', 'Acrobacia'], ['cavalgar', 'Cavalgar'], ['furtividade', 'Furtividade'], ['iniciativa', 'Iniciativa'], ['ladinagem', 'Ladinagem'], ['pilotagem', 'Pilotagem'], ['pontaria', 'Pontaria'], ['reflexos', 'Reflexos']]],
  ['con', [['fortitude', 'Fortitude']]],
  ['int', [['conhecimento', 'Conhecimento'], ['guerra', 'Guerra'], ['investigacao', 'Investigação'], ['misticismo', 'Misticismo'], ['nobreza', 'Nobreza'], ['oficio', 'Ofício']]],
  ['sab', [['cura', 'Cura'], ['intuicao', 'Intuição'], ['percepcao', 'Percepção'], ['religiao', 'Religião'], ['sobrevivencia', 'Sobrevivência'], ['vontade', 'Vontade']]],
  ['car', [['adestramento', 'Adestramento'], ['atuacao', 'Atuação'], ['diplomacia', 'Diplomacia'], ['enganacao', 'Enganação'], ['intimidacao', 'Intimidação'], ['jogatina', 'Jogatina']]]
];

/** Editable catalogs only: templates never select a calculation engine. Keys stay stable on rename. */
export function createSkillTables() {
  return { activeId: 'dnd5e', templates: {
    dnd5e: SKILLS.map(skill => ({ ...skill, bonus: 0 })),
    tormenta20: tormentaGroups.flatMap(([ability, skills]) => skills.map(([key, name]) => ({ key: `t20_${key}`, name, ability, bonus: 0 })))
  } };
}

export function assertSkillTemplate(id) {
  if (!SKILL_TEMPLATES.some(template => template.id === id)) throw Error('Tabela de perícias inválida.');
}

/** Validates both saved tables, including the inactive one, without mutating the input. */
export function validateSkillTables(tables) {
  if (!tables || typeof tables !== 'object' || Array.isArray(tables)) throw Error('Tabelas de perícias inválidas.');
  assertSkillTemplate(tables.activeId);
  if (!tables.templates || Object.keys(tables.templates).length !== SKILL_TEMPLATES.length) throw Error('Templates de perícias inválidos.');
  const keys = new Set();
  for (const { id } of SKILL_TEMPLATES) {
    const rows = tables.templates[id];
    if (!Array.isArray(rows) || rows.length > 100) throw Error('Cada tabela aceita até 100 perícias.');
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)
        || typeof row.key !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.key)
        || ['__proto__', 'constructor', 'prototype'].includes(row.key) || keys.has(row.key)) throw Error('Identificador de perícia inválido ou duplicado.');
      // Preserve D&D identities and keep Tormenta/custom rows in separate namespaces.
      if (!(id === 'dnd5e' && SKILLS.some(skill => skill.key === row.key))
        && !row.key.startsWith(id === 'dnd5e' ? 'custom_dnd5e_' : 't20_')) throw Error('Identificador não pertence à tabela.');
      if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 120) throw Error('Nome da perícia deve conter de 1 a 120 caracteres.');
      if (!ABILITIES.some(ability => ability.key === row.ability)) throw Error('Atributo de perícia inválido.');
      if (typeof row.bonus !== 'number' || !Number.isFinite(row.bonus)) throw Error('Bônus de perícia inválido.');
      keys.add(row.key);
    }
  }
  return tables;
}

export function activeSkills(character) {
  const tables = character.skillTables || createSkillTables();
  return tables.templates[tables.activeId];
}

export function allSkills(character) {
  return Object.values(character.skillTables?.templates || createSkillTables().templates).flat();
}

/** Adds optional table data to legacy sheets while preserving their existing proficiency flags. */
export function initializeSkillTables(character) {
  character.skillTables ??= createSkillTables();
  validateSkillTables(character.skillTables);
  for (const skill of allSkills(character)) {
    const state = character.dnd.skills[skill.key] ||= { proficient: false, expertise: false };
    if (typeof state !== 'object' || Array.isArray(state)) throw Error('Estado de perícia inválido.');
    state.expertise = Boolean(state.expertise);
    state.proficient = Boolean(state.proficient || state.expertise);
  }
}

export function saveSkillTemplate(character, id, skills) {
  assertSkillTemplate(id);
  const tables = structuredClone(character.skillTables);
  tables.templates[id] = structuredClone(skills);
  validateSkillTables(tables);
  for (const skill of tables.templates[id]) skill.name = skill.name.trim();
  const removed = character.skillTables.templates[id].filter(old => !skills.some(skill => skill.key === old.key));
  for (const { key } of removed) {
    // D&D flags also feed passive perception, independently of the displayed table.
    if (!SKILLS.some(skill => skill.key === key)) delete character.dnd.skills[key];
    delete character.calculations?.rules[`skill:${key}`];
  }
  character.skillTables = tables;
  initializeSkillTables(character);
}
