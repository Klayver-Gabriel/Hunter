import { ARMOR_TYPES, ARMOR_SLOTS, SKILLS } from '../domain/catalog.js';
import { allSkills } from '../domain/skillTemplates.js';
import { mod, proficiencyBonus } from './formulaEvaluator.js';
import { legacyHpBreakdown } from './legacyHpCalculator.js';
import { masteryEffects } from './masteryCalculator.js';

export const equippedWeaponData = c => c.library.weapons.find(w => w.id === c.equipment.weaponId) || null;
export const equippedArmorData = c => ARMOR_SLOTS.map(s => c.library.armors.find(a => a.id === c.equipment.armor[s.key])).filter(Boolean);
export const buffTotal = (c, key) => c.buffs.reduce((n, b) => n + (Number(b[key]) || 0), 0);
export function defaultBreakdown(c, id, resolve, formula, weapon = equippedWeaponData(c)) {
  const ability = key => mod(resolve(`attribute:${key}`));
  const proficiency = () => resolve('indicator:proficiency');
  const [kind, key] = id.split(':');
  if (kind === 'attribute') return { total: c.attributes[key] };
  if (kind === 'characteristic') return { total: c.calculations.characteristics.find(s => s.id === key)?.base };
  if (kind === 'resource') {
    const r = c.resources.find(r => r.id === key);
    if (r.type === 'hp' || r.id === 'hp') {
      const result = legacyHpBreakdown(c, resolve('attribute:con'));
      if (result.errors.length) throw Error(result.errors.join(' · '));
      return result;
    }
    return { total: r.baseMax ?? r.max };
  }
  if (id === 'indicator:proficiency') return { total: proficiencyBonus(c.info.level) };
  if (id === 'armor:total') return { total: equippedArmorData(c).reduce((n, a) => n + (Number(a.acBonus) || 0), 0) };
  if (id === 'metric:armor') {
    const a = c.dnd.armor, type = ARMOR_TYPES.find(t => t.value === a.type) || ARMOR_TYPES[0];
    const rawDex = ability('des'), dex = type.value === 'heavy' ? 0 : type.dexCap == null ? rawDex : Math.min(rawDex, type.dexCap);
    const base = Number(a.base) || 10, armor = (Number(a.armorBonus) || 0) + resolve('armor:total');
    const shield = Number(a.shield) || 0, buffs = buffTotal(c, 'armorClass') + (Number(a.buffs) || 0);
    return { base, dex, armor, shield, buffs, total: base + dex + armor + shield + buffs };
  }
  if (id === 'metric:initiative') {
    const dex = ability('des'), feats = Number(c.dnd.initiative.feats) || 0;
    const buffs = buffTotal(c, 'initiative') + (Number(c.dnd.initiative.buffs) || 0) + (weapon ? masteryEffects(c, weapon).initiative : 0);
    return { dex, buffs, feats, total: dex + buffs + feats };
  }
  if (kind === 'save') {
    const abilityPart = ability(key), proficiencyPart = c.dnd.saves[key] ? proficiency() : 0;
    return { ability: abilityPart, proficiency: proficiencyPart, total: abilityPart + proficiencyPart };
  }
  if (kind === 'skill') {
    const skill = allSkills(c).find(s => s.key === key) || SKILLS.find(s => s.key === key);
    const state = c.dnd.skills[key] || {}, abilityPart = ability(skill.ability);
    const profMultiplier = state.expertise ? 2 : state.proficient ? 1 : 0, proficiencyPart = proficiency() * profMultiplier;
    const manual = Number(skill.bonus) || 0;
    const external = c.buffs.filter(b => b.skill === key).reduce((n, b) => n + (Number(b.skillBonus) || 0), 0);
    const mastery = weapon ? masteryEffects(c, weapon).skills[key] || 0 : 0;
    return { ability: abilityPart, proficiency: proficiencyPart, external, mastery, manual, total: abilityPart + proficiencyPart + external + mastery + manual, profMultiplier };
  }
  if (id === 'metric:passive') {
    // Passive perception keeps the original D&D calculation when its row is absent.
    const perception = allSkills(c).some(s => s.key === 'perception') ? resolve('skill:perception') : defaultBreakdown(c, 'skill:perception', resolve, formula).total;
    return { perception, total: 10 + perception };
  }
  if (kind === 'attack') {
    if (!weapon) return { ability: 0, proficiency: 0, buffs: 0, mastery: 0, total: 0 };
    const abilityPart = ability(weapon.ability || 'for'), effects = masteryEffects(c, weapon);
    const proficiencyPart = key === 'bonus' && weapon.proficient !== false ? proficiency() : 0;
    const buffs = buffTotal(c, key === 'bonus' ? 'attack' : 'damage'), mastery = effects[key === 'bonus' ? 'attack' : 'damage'];
    return { ability: abilityPart, ...(key === 'bonus' ? { proficiency: proficiencyPart } : {}), buffs, mastery, total: abilityPart + proficiencyPart + buffs + mastery };
  }
  if (id === 'spellcasting') {
    const result = formula(c.calculations.spellcasting.formula);
    return { ...result, total: result.value };
  }
  if (kind === 'spell') {
    const s = c.spells.find(s => s.id === key), dt = s.dt || { mode: 'none', bonus: 0 };
    if (dt.mode === 'none') return { total: null };
    if (dt.mode === 'fixed') return { total: dt.fixed + dt.bonus };
    if (dt.mode === 'global') return { total: resolve('spellcasting') + dt.bonus };
    const result = formula(dt.formula, undefined, { CIRCULO: s.circle ?? NaN, BONUS_MAGIA: dt.bonus });
    return { ...result, total: result.value };
  }
  throw Error(`Componente desconhecido: ${id}.`);
}
