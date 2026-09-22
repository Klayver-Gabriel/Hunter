import * as C from '../domain/character.js';
import { validateCalculations, targetIds } from '../domain/calculations.js';
import { calculateCharacter, baseValue, characterLevel, assertCalculations } from '../auto_calc_engine/characterCalculator.js';
import { advanceEvent } from './temporal.js';
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
    case 'setField':
      if (!fields.has(p.path)) throw Error('Campo inválido.');
      C.set(c, p.path, p.value); break;
    case 'setAttribute':
      if (!C.ATTRS.includes(p.key)) throw Error('Atributo inválido.');
      if (c.calculations.rules[`attribute:${p.key}`] && c.calculations.rules[`attribute:${p.key}`].mode !== 'manual') throw Error('Altere a regra deste atributo no calculador.');
      c.attributes[p.key] = Math.max(1, Math.min(30, numeric(p.value) || 10)); break;
    case 'addResource': C.addResource(c, { name: 'Novo Recurso', current: 10, max: 10 }); break;
    case 'removeResource':
      if (lookup(c.resources, p.id)?.removable) { C.removeResource(c, p.id); delete c.calculations.rules[`resource:${p.id}`]; } break;
    case 'setResource': {
      const r = lookup(c.resources, p.id);
      if (!r || !['name', 'current', 'max'].includes(p.key)) throw Error('Recurso inválido.');
      if (p.key === 'max' && c.calculations.rules[`resource:${r.id}`] && c.calculations.rules[`resource:${r.id}`].mode !== 'manual') throw Error('Altere a regra deste recurso no calculador.');
      if (p.key === 'name') { if (r.removable) r.name = String(p.value).trim() || r.name; }
      else if (!(p.key === 'max' && r.type === 'hp' && !c.calculations.rules[`resource:${r.id}`])) {
        r[p.key] = Math.max(0, numeric(p.value));
        if (p.key === 'max') { r.baseMax = r.max; r.current = Math.min(r.current, r.max); }
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
    case 'setCalculationRule': {
      if (!targetIds(c).includes(p.target)) throw Error('Característica inexistente.');
      const previous = calculateCharacter(c);
      const rule = structuredClone(p.rule);
      if (p.target === 'spellcasting' && p.spellcasting) c.calculations.spellcasting = { ...c.calculations.spellcasting, ...p.spellcasting };
      if (rule.mode === 'manual') {
        const value = p.value ?? previous.baseValues[p.target] ?? baseValue(c, p.target);
        const [kind, key] = p.target.split(':');
        if (p.target === 'spellcasting') c.calculations.spellcasting.base = value;
        else if (kind === 'attribute') c.attributes[key] = value;
        else if (kind === 'resource') lookup(c.resources, key).baseMax = value;
        else lookup(c.calculations.characteristics, key).base = value;
      }
      if (rule.mode === 'progression' && rule.policy === 'recorded') {
        const old = c.calculations.rules[p.target];
        const comparable = r => JSON.stringify({ mode: r?.mode, initial: r?.initial, gain: r?.gain, bonuses: r?.bonuses, policy: r?.policy, min: r?.min, max: r?.max });
        rule.history = old?.history && comparable(old) === comparable(rule) ? structuredClone(old.history) : { anchorLevel: characterLevel(c), anchorValue: previous.baseValues[p.target] ?? baseValue(c, p.target), gains: {} };
      } else delete rule.history;
      c.calculations.rules[p.target] = rule;
      validateCalculations(c); assertCalculations(c); break;
    }
    case 'useLegacyHp':
      if (!c.resources.some(r => `resource:${r.id}` === p.target && (r.type === 'hp' || r.id === 'hp'))) throw Error('Recurso de vida inexistente.');
      delete c.calculations.rules[p.target]; assertCalculations(c); break;
    case 'setSpellcasting': delete c.calculations.rules.spellcasting; c.calculations.spellcasting = structuredClone(p.data); validateCalculations(c); assertCalculations(c); break;
    case 'addCharacteristic':
      c.calculations.characteristics.push({ id: C.uid('stat'), name: p.name || 'Nova característica', base: 0 }); break;
    case 'removeCharacteristic':
      c.calculations.characteristics = c.calculations.characteristics.filter(r => r.id !== p.id);
      delete c.calculations.rules[`characteristic:${p.id}`]; break;
    case 'saveEffect': {
      const id = p.id || C.uid('effect');
      upsert(c.temporal.effects, { ...p.data, id }); break;
    }
    case 'activateEffect': {
      const effect = lookup(c.temporal.effects, p.id);
      if (!effect) throw Error('Efeito inexistente.');
      if (!effect.active) { effect.active = true; effect.remaining = effect.duration; }
      break;
    }
    case 'deactivateEffect': {
      const effect = lookup(c.temporal.effects, p.id);
      if (!effect) throw Error('Efeito inexistente.');
      effect.active = false; break;
    }
    case 'removeEffect': c.temporal.effects = c.temporal.effects.filter(e => e.id !== p.id); break;
    case 'advanceEvent': advanceEvent(c, p.event); break;
    default: throw Error(`Comando desconhecido: ${type}`);
  }
  validateCalculations(c);
  if (['removeResource', 'removeCharacteristic', 'saveEntry', 'saveEffect', 'activateEffect'].includes(type)) assertCalculations(c);
  if (type === 'setField' && p.path.includes('Formula')) assertCalculations(c);
}
