import { ABILITIES, SKILLS, ARMOR_SLOTS } from './catalog.js';

export const CATEGORIES = [
  ['identity', 'Identidade'], ['attributes', 'Atributos'], ['skills', 'Perícias'], ['resources', 'Recursos'],
  ['combat', 'Combate e defesas'], ['equipment', 'Armas e equipamentos'], ['powers', 'Poderes'],
  ['spells', 'Magias'], ['masteries', 'Maestrias'], ['other', 'Diário e outros componentes']
];
const entries = (category, labels) => Object.entries(labels).map(([id, original]) => ({ id, original, category, kind: 'structure' }));
export const STRUCTURAL_COMPONENTS = [
  ...entries('identity', Object.fromEntries(Object.entries({ class: 'Classe', subclass: 'Subclasse', race: 'Raça', background: 'Antecedente', alignment: 'Alinhamento', xp: 'XP', level: 'Nível', guildName: 'Guilda', guildRank: 'Rank' }).map(([key, value]) => [`field:info.${key}`, value]))),
  ...entries('attributes', { 'section:attributes': 'Atributos', ...Object.fromEntries(ABILITIES.map(a => [`attribute:${a.key}`, a.label])) }),
  ...entries('skills', { 'subsection:skills': 'Perícias', ...Object.fromEntries(SKILLS.map(s => [`skill:${s.key}`, s.name])) }),
  ...entries('resources', { 'section:resources': 'Recursos', 'metric:hp': 'Vida Máxima', 'metric:hitdie': 'Dados de Vida' }),
  ...entries('combat', { 'section:dnd-rules': 'D&D 2024', 'indicator:proficiency': 'Proficiência', 'subsection:saves': 'Testes de Resistência', 'metric:armor': 'Classe de Armadura', 'metric:initiative': 'Iniciativa', 'metric:passive': 'Percepção Passiva', 'section:armory': 'Ataques', 'attack:bonus': 'Ataque', 'attack:damage': 'Dano', ...Object.fromEntries(ABILITIES.map(a => [`save:${a.key}`, a.label])) }),
  ...entries('equipment', { 'weapon:equipped': 'Arma equipada', 'section:equipment': 'Equipamento & Buffs', 'section:library': 'Biblioteca da Guilda', 'subsection:equipped-armor': 'Armadura equipada', 'subsection:buffs': 'Buff Engine', 'subsection:weapons': 'Armas', 'subsection:armors': 'Armaduras', 'armor:total': 'Bônus de CA das peças', ...Object.fromEntries(ARMOR_SLOTS.map(s => [`armor:${s.key}`, s.label])) }),
  ...entries('powers', { 'tab:powers': 'Poderes' }), ...entries('spells', { 'tab:spells': 'Magias', 'metric:dt': 'DT de magias' }),
  ...entries('masteries', { 'subsection:mastery': 'Maestria da arma', 'mastery:level': 'Nível', 'mastery:xp': 'XP', 'mastery:xpToNext': 'Próximo' }),
  ...entries('other', { 'tab:journal': 'Diário', 'section:calculations': 'Características e fórmulas', 'section:temporal': 'Efeitos temporais' }),
  ...entries('combat', Object.fromEntries(Object.entries({ 'armor.type': 'Tipo de armadura', 'armor.base': 'Base da CA', 'armor.armorBonus': 'Bônus de armadura', 'armor.shield': 'Escudo', 'armor.buffs': 'Buff manual de CA', 'initiative.buffs': 'Buff de iniciativa', 'initiative.feats': 'Talentos de iniciativa', 'vitality.hitDie': 'Dado de Vida', 'vitality.hitDiceRemaining': 'Dados restantes', 'vitality.firstLevelFormula': 'Fórmula do 1º nível', 'vitality.laterLevelFormula': 'Fórmula por nível seguinte', 'vitality.featBonus': 'PV por talentos', 'vitality.buffs': 'PV por buffs' }).map(([key, value]) => [`config:dnd.${key}`, value])))
];
export function recordCollections(c) {
  return { weapons: c.library.weapons, armors: c.library.armors, powers: c.powers, spells: c.spells, journal: c.journal, buffs: c.buffs, characteristics: c.calculations?.characteristics || [] };
}
export function recordFor(c, id) {
  if (id.startsWith('resource:')) return c.resources.find(r => r.id === id.slice(9) && r.type === 'custom');
  const [, list, key] = id.split(':');
  return id.startsWith('record:') ? recordCollections(c)[list]?.find(r => r.id === key) : null;
}
export const recordNameKey = (record, id) => id?.startsWith('resource:') || /^record:(weapons|armors|buffs|characteristics):/.test(id) ? 'name' : id?.startsWith('record:') ? 'title' : Object.hasOwn(record, 'title') ? 'title' : 'name';
export function componentCatalog(c, appearance) {
  const result = [...STRUCTURAL_COMPONENTS];
  for (const r of c.resources) result.push({ id: `resource:${r.id}`, original: r.originalName || r.name, category: 'resources', kind: r.type === 'custom' ? 'record' : 'structure' });
  const groups = { weapons: 'equipment', armors: 'equipment', buffs: 'equipment', powers: 'powers', spells: 'spells', journal: 'other', characteristics: 'other' };
  for (const [list, records] of Object.entries(recordCollections(c))) for (const r of records) result.push({ id: `record:${list}:${r.id}`, original: r.originalName || r[recordNameKey(r, `record:${list}:${r.id}`)], category: groups[list], kind: 'record' });
  for (const id of Object.keys(appearance?.components || {})) if (!result.some(e => e.id === id)) result.push({ id, original: id, category: 'other', kind: 'structure' });
  return result;
}
export function displayName(c, appearance, id, fallback) {
  const record = recordFor(c, id);
  if (record) return record[recordNameKey(record, id)];
  if (appearance?.components[id]?.label) return appearance.components[id].label;
  // A resistance follows its attribute unless it has its own explicit label.
  if (id.startsWith('save:') && appearance?.components[id.replace('save:', 'attribute:')]?.label) return appearance.components[id.replace('save:', 'attribute:')].label;
  return fallback ?? STRUCTURAL_COMPONENTS.find(e => e.id === id)?.original ?? c.resources.find(r => `resource:${r.id}` === id)?.name ?? id;
}
