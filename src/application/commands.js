import { ENTITY_FIELDS, entityList } from '../domain/entityFields.js';
import * as C from '../domain/character.js';
import * as D from '../domain/catalog.js';
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const fields = new Set([
  ...Object.keys(C.createDefault().info).map(key => `info.${key}`),
  ...['armor', 'initiative', 'vitality'].flatMap(group => Object.keys(C.createDefault().dnd[group]).map(key => `dnd.${group}.${key}`))
]);
const lookup = (list, id) => list.find(item => item.id === id);
function upsert(list, value) {
  const index = list.findIndex(item => item.id === value.id);
  if (index < 0) list.push(value); else list[index] = value;
}

/** Commands mutate only the store's private draft, never a renderer snapshot. */
export function applyCommand(c, type, p = {}) {
  switch (type) {
    case 'setEntityField': {
      const field = ENTITY_FIELDS[p.kind]?.find(f => f.key === p.key);
      const entity = lookup(entityList(c, p.kind), p.id);
      if (!field || !entity) throw Error('Campo de entidade inválido.');
      if (field.options && !field.options.some(option => String(option.value) === String(p.value))) throw Error('Opção inválida.');
      const value = field.type === 'number' ? numeric(p.value) : p.key === 'proficient' ? p.value === 'true' : String(p.value);
      if (p.kind === 'armor' && p.key === 'slot' && c.equipment.armor[entity.slot] === entity.id && entity.slot !== value) c.equipment.armor[entity.slot] = null;
      entity[p.key] = value; break;
    }
    case 'setField':
      if (!fields.has(p.path)) throw Error('Campo inválido.');
      C.set(c, p.path, p.value); break;
    case 'setAttribute':
      if (!C.ATTRS.includes(p.key)) throw Error('Atributo inválido.');
      c.attributes[p.key] = Math.max(1, Math.min(30, numeric(p.value) || 10)); break;
    case 'addResource': C.addResource(c, { name: 'Novo Recurso', current: 10, max: 10 }); break;
    case 'removeResource':
      if (lookup(c.resources, p.id)?.removable) C.removeResource(c, p.id); break;
    case 'setResource': {
      const r = lookup(c.resources, p.id);
      if (!r || !['name', 'current', 'max'].includes(p.key)) throw Error('Recurso inválido.');
      if (p.key === 'name') { if (r.removable) r.name = String(p.value).trim() || r.name; }
      else if (!(p.key === 'max' && r.type === 'hp')) {
        r[p.key] = Math.max(0, numeric(p.value));
        if (p.key === 'max') r.current = Math.min(r.current, r.max);
      }
      break;
    }
    case 'setSave':
      if (!C.ATTRS.includes(p.key)) throw Error('Resistência inválida.');
      c.dnd.saves[p.key] = Boolean(p.value); break;
    case 'setSkill': {
      const state = c.dnd.skills[p.key];
      if (!state || !['proficient', 'expertise'].includes(p.field)) throw Error('Perícia inválida.');
      state[p.field] = Boolean(p.value);
      if (p.field === 'proficient' && !p.value) state.expertise = false;
      if (p.field === 'expertise' && p.value) state.proficient = true;
      break;
    }
    case 'equipWeapon':
      if (p.id && !lookup(c.library.weapons, p.id)) throw Error('Arma inválida.');
      c.equipment.weaponId = p.toggle && c.equipment.weaponId === p.id ? null : p.id || null; break;
    case 'equipArmor': {
      const item = lookup(c.library.armors, p.id);
      const slot = p.slot || item?.slot;
      if (!D.ARMOR_SLOTS.some(s => s.key === slot) || (p.id && (!item || item.slot !== slot))) throw Error('Armadura inválida.');
      c.equipment.armor[slot] = p.toggle && c.equipment.armor[slot] === p.id ? null : p.id || null; break;
    }
    case 'setMastery': {
      if (!lookup(c.library.weapons, p.id) || !['level', 'xp', 'xpToNext'].includes(p.key)) throw Error('Maestria inválida.');
      const state = c.masteries[p.id] ||= { level: 1, xp: 0, xpToNext: 100 };
      state[p.key] = Math.max(p.key === 'xp' ? 0 : 1, numeric(p.value));
      if (p.key === 'level') state.level = Math.min(20, state.level);
      break;
    }
    case 'saveWeapon': {
      const d = p.data, id = p.id || C.uid('weapon');
      upsert(c.library.weapons, { ...lookup(c.library.weapons, id), id, name: d.title,
        icon: d.icon || '⚔', damageDice: d.damageDice || '1d6', ability: d.ability || 'for',
        proficient: d.proficient !== 'false' && d.proficient !== false, critMin: numeric(d.critMin) || 20,
        dndElement: d.dndElement || '', masteryUnlocks: d.masteryUnlocks || '' });
      c.masteries[id] ||= { level: 1, xp: 0, xpToNext: 100 }; break;
    }
    case 'deleteWeapon':
      c.library.weapons = c.library.weapons.filter(w => w.id !== p.id);
      if (c.equipment.weaponId === p.id) c.equipment.weaponId = null;
      delete c.masteries[p.id]; break;
    case 'saveArmor': {
      const d = p.data, id = p.id || C.uid('armor'), old = lookup(c.library.armors, id);
      const slot = d.slot || 'helm';
      if (!D.ARMOR_SLOTS.some(s => s.key === slot)) throw Error('Peça inválida.');
      if (old && old.slot !== slot && c.equipment.armor[old.slot] === id) c.equipment.armor[old.slot] = null;
      upsert(c.library.armors, { ...old, id, name: d.title, slot, acBonus: numeric(d.acBonus),
        resistances: d.resistances || '', skills: d.skills || '', slots: d.slots || '' }); break;
    }
    case 'deleteArmor':
      c.library.armors = c.library.armors.filter(a => a.id !== p.id);
      D.ARMOR_SLOTS.forEach(s => { if (c.equipment.armor[s.key] === p.id) c.equipment.armor[s.key] = null; }); break;
    case 'saveBuff': {
      const d = p.data, id = p.id || C.uid('buff');
      const value = { ...lookup(c.buffs, id), id, name: d.title, source: d.source || '', skill: d.skill || '',
        skillBonus: numeric(d.skillBonus), damageDice: String(d.damageDice || '').trim() };
      for (const key of ['attack', 'damage', 'armorClass', 'initiative', 'hp']) value[key] = numeric(d[key]);
      upsert(c.buffs, value); break;
    }
    case 'deleteBuff': c.buffs = c.buffs.filter(b => b.id !== p.id); break;
    case 'saveEntry':
    case 'deleteEntry':
      if (!['powers', 'spells', 'journal'].includes(p.list)) throw Error('Lista inválida.');
      if (type === 'deleteEntry') C.removeEntry(c, p.list, p.id);
      else if (p.id) C.updateEntry(c, p.list, p.id, p.data);
      else C.addEntry(c, p.list, p.data);
      break;
    default: throw Error(`Comando desconhecido: ${type}`);
  }
}
