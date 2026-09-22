import { ATTRS } from '../domain/character.js';
import { createCalculations, referenceFor, targetIds } from '../domain/calculations.js';
import { evaluate, formulaReferences, mod, proficiencyBonus } from './formulaEvaluator.js';
import { legacyHpBreakdown } from './legacyHpCalculator.js';

const cache = new WeakMap();
export function characterLevel(c) { return Math.max(1, Math.min(20, Number(c.info.level) || 1)); }
export function baseValue(c, id) {
  if (id === 'spellcasting') return c.calculations?.spellcasting.base ?? 10;
  const [kind, key] = id.split(':');
  if (kind === 'attribute') return c.attributes[key];
  if (kind === 'resource') { const r = c.resources.find(r => r.id === key); return r?.baseMax ?? r?.max; }
  return c.calculations?.characteristics.find(r => r.id === key)?.base;
}
export function calculateCharacter(c, { validateRules = false } = {}) {
  if (!validateRules && Object.isFrozen(c) && cache.has(c)) return cache.get(c);
  const config = c.calculations || createCalculations();
  const lvl = characterLevel(c), targets = targetIds(c), refs = new Map(targets.map(id => [referenceFor(id), id]));
  ATTRS.forEach(key => refs.set(key.toUpperCase(), `attribute:${key}`));
  const values = {}, baseValues = {}, errors = {}, details = {}, histories = {}, visiting = new Set();
  const temporary = id => (c.temporal?.effects || []).filter(e => e.active && e.kind === 'bonus' && e.target === id).reduce((sum, e) => sum + e.amount, 0);
  function formula(expression, atLevel = lvl, extra = {}) {
    const variables = { NIVEL: lvl, NIVEL_FINAL: lvl, NIVEL_AVALIADO: atLevel, PROFICIENCIA: proficiencyBonus(lvl), BONUS_DT: config.spellcasting.bonus, ...extra };
    for (const name of formulaReferences(expression)) {
      if (Object.hasOwn(variables, name)) continue;
      if (name === 'MOD_CONJURACAO') variables[name] = mod(resolve(`attribute:${config.spellcasting.ability}`));
      else if (name.startsWith('MOD_') && ATTRS.includes(name.slice(4).toLowerCase())) variables[name] = mod(resolve(`attribute:${name.slice(4).toLowerCase()}`));
      else if (refs.has(name)) variables[name] = resolve(refs.get(name));
      else throw Error(`Variável desconhecida ou referência removida: ${name}.`);
    }
    return { value: evaluate(expression, variables), variables: Object.fromEntries(formulaReferences(expression).map(key => [key, variables[key]])) };
  }
  function resolve(id) {
    if (Object.hasOwn(values, id)) return values[id];
    if (errors[id]) throw Error(errors[id]);
    if (visiting.has(id)) throw Error(`Dependência circular: ${[...visiting, id].join(' → ')}.`);
    visiting.add(id);
    try {
      const rule = config.rules[id];
      let value = Number(baseValue(c, id));
      const parts = [];
      if (!rule && id === 'spellcasting') {
        const part = formula(config.spellcasting.formula); value = part.value; parts.push({ label: 'DT global', ...part });
      } else if (!rule && id.startsWith('resource:') && c.resources.some(r => `resource:${r.id}` === id && (r.type === 'hp' || r.id === 'hp'))) {
        const legacy = legacyHpBreakdown(c, resolve('attribute:con'));
        if (legacy.errors.length) throw Error(legacy.errors.join(' · '));
        value = legacy.total;
      } else if (rule?.mode === 'formula') {
        const part = formula(rule.formula); value = part.value; parts.push({ label: 'Fórmula', ...part });
      } else if (rule?.mode === 'progression') {
        const gain = at => {
          const main = formula(at === 1 ? rule.initial : rule.gain, at);
          const bonuses = rule.bonuses.filter(b => b.level === at).map(b => formula(b.formula, at));
          const total = main.value + bonuses.reduce((sum, b) => sum + b.value, 0);
          parts.push({ label: `Nível ${at}`, value: total, variables: main.variables, bonuses });
          return total;
        };
        // Saving/import validates future expressions. Recalculation never reevaluates recorded gains.
        if (validateRules) {
          formula(rule.initial, 1);
          for (let at = 2; at <= 20; at++) formula(rule.gain, at);
          rule.bonuses.forEach(b => formula(b.formula, b.level));
        }
        if (rule.policy === 'recorded') {
          const history = structuredClone(rule.history || { anchorLevel: lvl, anchorValue: value, gains: {} });
          value = history.anchorValue;
          parts.push({ label: `Ponto inicial no nível ${history.anchorLevel} (sem histórico anterior)`, value });
          for (let at = history.anchorLevel + 1; at <= lvl; at++) {
            if (!Object.hasOwn(history.gains, at)) history.gains[at] = gain(at);
            else parts.push({ label: `Nível ${at} registrado`, value: history.gains[at] });
            value += history.gains[at];
          }
          histories[id] = history;
        } else {
          value = gain(1);
          for (let at = 2; at <= lvl; at++) value += gain(at);
        }
      }
      if (rule?.min != null) value = Math.max(rule.min, value);
      if (rule?.max != null) value = Math.min(rule.max, value);
      if (!Number.isFinite(value)) throw Error('Resultado não finito.');
      baseValues[id] = value;
      value += temporary(id);
      if (id.startsWith('resource:')) value = Math.max(0, value);
      if (!Number.isFinite(value)) throw Error('Resultado não finito.');
      values[id] = value; details[id] = parts;
      return value;
    } catch (error) { errors[id] = error.message; throw error; }
    finally { visiting.delete(id); }
  }
  for (const id of targets) { try { resolve(id); } catch { /* Each affected target has its own error. */ } }
  let casting;
  try { casting = { value: resolve('spellcasting'), variables: details.spellcasting?.[0]?.variables || {} }; }
  catch (error) { casting = { error: error.message }; errors.spellcasting = error.message; }
  const spells = {};
  for (const spell of c.spells) {
    const dt = spell.dt || { mode: 'none', bonus: 0, resistance: '' };
    try {
      let result = { value: null, variables: {} };
      if (dt.mode === 'global') {
        if (casting.error) throw Error(casting.error);
        result = { ...casting, value: casting.value + dt.bonus };
      } else if (dt.mode === 'fixed') result.value = dt.fixed + dt.bonus;
      else if (dt.mode === 'formula') {
        result = formula(dt.formula, lvl, { CIRCULO: spell.circle ?? NaN, BONUS_MAGIA: dt.bonus });
        // BONUS_MAGIA is explicit in custom formulas; inherited/fixed modes add it automatically.
      }
      if (result.value !== null && !Number.isFinite(result.value)) throw Error('DT não finita.');
      spells[spell.id] = { ...result, mode: dt.mode, bonus: dt.bonus, resistance: dt.resistance || '' };
    } catch (error) { spells[spell.id] = { error: error.message }; errors[`spell:${spell.id}`] = error.message; }
  }
  const result = { values, baseValues, errors, details, histories, casting, spells };
  if (!validateRules && Object.isFrozen(c)) cache.set(c, result);
  return result;
}
export function assertCalculations(c, { allowRuntimeErrors = false } = {}) {
  const result = calculateCharacter(c, { validateRules: true });
  const errors = Object.entries(result.errors).filter(([, error]) => !allowRuntimeErrors || !error.split(' · ').every(part => /(?:Divisão por zero|A fórmula não produziu um número válido|Resultado não finito|DT não finita)\.$/.test(part)));
  if (errors.length) throw Error(errors.map(([id, error]) => `${id}: ${error}`).join('\n'));
  return result;
}
