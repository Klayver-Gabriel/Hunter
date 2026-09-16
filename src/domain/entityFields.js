import { ABILITIES, ARMOR_SLOTS, WEAPON_ICONS, SKILLS } from './catalog.js';
const text = (key, label) => ({ key, label, type: 'text' });
const number = (key, label) => ({ key, label, type: 'number' });
const area = (key, label) => ({ key, label, type: 'textarea' });
const select = (key, label, options) => ({ key, label, type: 'select', options });
export const ENTITY_FIELDS = {
  weapon: [text('name', 'Nome'), select('icon', 'Ícone', WEAPON_ICONS.map(value => ({ value, label: value }))),
    text('damageDice', 'Dados de dano'), select('ability', 'Atributo', ABILITIES.map(a => ({ value: a.key, label: a.label }))),
    select('proficient', 'Proficiência', [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]),
    number('critMin', 'Crítico mínimo'), text('dndElement', 'Elemento'), area('masteryUnlocks', 'Técnicas de maestria')],
  armor: [text('name', 'Nome'), select('slot', 'Peça', ARMOR_SLOTS.map(s => ({ value: s.key, label: s.label }))),
    number('acBonus', 'Bônus de CA'), text('resistances', 'Resistências'), area('skills', 'Skills'), text('slots', 'Slots')],
  buff: [text('name', 'Nome'), text('source', 'Origem'), select('skill', 'Perícia', [{ value: '', label: 'Nenhuma' }, ...SKILLS.map(s => ({ value: s.key, label: s.name }))]),
    number('skillBonus', 'Bônus na perícia'), number('attack', 'Ataque'), number('damage', 'Dano'), text('damageDice', 'Dados adicionais'),
    number('armorClass', 'Classe de Armadura'), number('initiative', 'Iniciativa'), number('hp', 'Vida Máxima')],
  powers: [text('title', 'Título'), text('source', 'Origem'), area('description', 'Descrição')],
  spells: [text('title', 'Título'), text('level', 'Círculo'), text('school', 'Escola'), area('description', 'Descrição')],
  journal: [text('title', 'Título'), text('date', 'Data / Sessão'), area('description', 'Anotação')]
};
export function entityList(character, kind) {
  if (kind === 'weapon') return character.library.weapons;
  if (kind === 'armor') return character.library.armors;
  if (kind === 'buff') return character.buffs;
  return ['powers', 'spells', 'journal'].includes(kind) ? character[kind] : [];
}
