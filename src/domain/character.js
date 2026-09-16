import * as D from './catalog.js';

const ATTRS = ['for', 'des', 'con', 'int', 'sab', 'car'];
const ATTR_LABELS = { for: 'FOR', des: 'DES', con: 'CON', int: 'INT', sab: 'SAB', car: 'CAR' };

const DEFAULT_RESOURCES = [
  { id: 'hp',        name: 'HP',        type: 'hp',        current: 10, max: 10, removable: false },
  { id: 'atp',       name: 'ATP',       type: 'atp',       current: 10, max: 10, removable: false },
  { id: 'sanidade',  name: 'Sanidade',  type: 'sanidade',  current: 10, max: 10, removable: false },
  { id: 'evo',       name: 'EVO',       type: 'evo',       current: 0,  max: 10, removable: false }
];

function uid(prefix) {
  return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 10);
}

function createSkillState() {
  return D.SKILLS.reduce((skills, skill) => {
    skills[skill.key] = { proficient: false, expertise: false };
    return skills;
  }, {});
}

function createSaveState() {
  return ATTRS.reduce((saves, ability) => {
    saves[ability] = false;
    return saves;
  }, {});
}

function createStarterWeapon() {
  return {
    id: 'weapon_longsword_starter',
    name: 'Long Sword da Guilda',
    icon: '⚔',
    damageDice: '2d6',
    ability: 'for',
    proficient: true,
    critMin: 19,
    dndElement: 'Fogo',
    masteryUnlocks: [
      '3|Postura do Duelista|pericia.acrobacia:2',
      '5|Spirit Bonus|damage:5',
      '8|Counter Master|attack:2'
    ].join('\n')
  };
}

function createDefault() {
  const starterWeapon = createStarterWeapon();
  return {
    schemaVersion: 2,
    id: uid('char'),
    info: {
      name: '',
      class: '',
      subclass: '',
      race: '',
      background: '',
      alignment: '',
      xp: 0,
      level: 1,
      guildRank: 'Low Rank',
      guildName: ''
    },
    attributes: { for: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 },
    resources: DEFAULT_RESOURCES.map(r => ({ ...r })),
    powers: [],
    spells: [],
    journal: [],
    dnd: {
      skills: createSkillState(),
      saves: createSaveState(),
      armor: { type: 'none', base: 10, armorBonus: 0, shield: 0, buffs: 0 },
      initiative: { buffs: 0, feats: 0 },
      vitality: {
        hitDie: 'd10',
        hitDiceRemaining: 1,
        firstLevelFormula: '10 + CON',
        laterLevelFormula: '6 + CON',
        featBonus: 0,
        buffs: 0
      }
    },
    equipment: {
      weaponId: starterWeapon.id,
      armor: { helm: null, chest: null, gloves: null, waist: null, legs: null },
      jewels: [],
      talisman: null
    },
    buffs: [],
    masteries: {
      [starterWeapon.id]: { level: 1, xp: 0, xpToNext: 100 }
    },
    library: { weapons: [starterWeapon], armors: [] },
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };
}

function get(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function set(obj, path, value) {
  const keys = path.split('.');
  let target = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    target = target[keys[i]];
  }
  target[keys[keys.length - 1]] = value;
  obj.meta.updatedAt = new Date().toISOString();
  return obj;
}

function addResource(character, partial) {
  character.resources.push({
    id: uid('res'),
    name: partial.name || 'Novo Recurso',
    type: 'custom',
    current: Number(partial.current) || 0,
    max: Number(partial.max) || 10,
    removable: true
  });
  character.meta.updatedAt = new Date().toISOString();
}

function removeResource(character, resourceId) {
  character.resources = character.resources.filter(r => r.id !== resourceId);
  character.meta.updatedAt = new Date().toISOString();
}

function addEntry(character, listName, partial) {
  const entry = {
    id: uid(listName.slice(0, -1) || 'entry'),
    title: partial.title || 'Sem título',
    ...partial,
    createdAt: new Date().toISOString()
  };
  character[listName].push(entry);
  character.meta.updatedAt = new Date().toISOString();
  return entry;
}

function updateEntry(character, listName, entryId, partial) {
  const list = character[listName];
  const idx = list.findIndex(e => e.id === entryId);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...partial };
  character.meta.updatedAt = new Date().toISOString();
  return list[idx];
}

function removeEntry(character, listName, entryId) {
  character[listName] = character[listName].filter(e => e.id !== entryId);
  character.meta.updatedAt = new Date().toISOString();
}

export {
  ATTRS, ATTR_LABELS, DEFAULT_RESOURCES,
  createDefault, createSkillState, createSaveState, get, set, uid,
  addResource, removeResource,
  addEntry, updateEntry, removeEntry
};
