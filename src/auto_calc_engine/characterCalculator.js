import { ATTRS } from '../domain/character.js';
import { createCalculations, referenceFor, targetIds } from '../domain/calculations.js';
import { evaluate, formulaReferences, mod } from './formulaEvaluator.js';
import { defaultBreakdown } from './defaultCalculations.js';
import { currentResourceId, limitResourceCurrent } from '../domain/calculationTargets.js';

const cache = new WeakMap();
export function characterLevel(c) { return Math.max(1, Math.min(20, Number(c.info.level) || 1)); }
export function baseValue(c, id) {
  if (id === 'spellcasting') return c.calculations?.spellcasting.base ?? 10;
  const [kind, key] = id.split(':');
  if (kind === 'attribute') return c.attributes[key];
  if (kind === 'resource') { const r = c.resources.find(r => r.id === key); return r?.baseMax ?? r?.max; }
  if (kind === 'characteristic') return c.calculations?.characteristics.find(r => r.id === key)?.base;
  return c.calculations?.rules[id]?.value;
}
export function calculateCharacter(c, { validateRules = false } = {}) {
  if (!validateRules && Object.isFrozen(c) && cache.has(c)) return cache.get(c);
  const config = c.calculations || createCalculations();
  const configuredCharacter = c.calculations ? c : { ...c, calculations: config };
  const lvl = characterLevel(c), targets = targetIds(c);
  const currentResources = new Map(c.resources.map(r => [currentResourceId(`resource:${r.id}`), { resource: r, target: `resource:${r.id}` }]));
  const referenceIds = [...targets, ...currentResources.keys()];
  const refs = new Map(referenceIds.map(id => [referenceFor(id), id]));
  ATTRS.forEach(key => refs.set(key.toUpperCase(), `attribute:${key}`));
  const values = {}, baseValues = {}, errors = {}, details = {}, histories = {}, breakdowns = {}, visiting = new Set();
  const temporary = id => (c.temporal?.effects || []).filter(e => e.active && e.kind === 'bonus' && e.target === id).reduce((sum, e) => sum + e.amount, 0);
  function formula(expression, atLevel = lvl, extra = {}, target) {
    const spell = target?.startsWith('spell:') ? c.spells.find(s => `spell:${s.id}` === target) : null;
    const variables = { NIVEL: lvl, NIVEL_FINAL: lvl, NIVEL_AVALIADO: atLevel, BONUS_DT: config.spellcasting.bonus, ...(spell ? { CIRCULO: spell.circle ?? NaN, BONUS_MAGIA: spell.dt?.bonus ?? 0 } : {}), ...extra };
    for (const name of formulaReferences(expression)) {
      if (Object.hasOwn(variables, name)) continue;
      if (name === 'PROFICIENCIA') variables[name] = resolve('indicator:proficiency');
      else if (name === 'VALOR_PADRAO') variables[name] = standard(target).total;
      else if (name === 'MOD_CONJURACAO') variables[name] = mod(resolve(`attribute:${config.spellcasting.ability}`));
      else if (name.startsWith('MOD_') && ATTRS.includes(name.slice(4).toLowerCase())) variables[name] = mod(resolve(`attribute:${name.slice(4).toLowerCase()}`));
      else if (refs.has(name)) variables[name] = resolve(refs.get(name));
      else throw Error(`Variável desconhecida ou referência removida: ${name}.`);
      if (typeof variables[name] !== 'number' || !Number.isFinite(variables[name])) throw Error(`Variável sem valor numérico válido: ${name}.`);
    }
    return { value: evaluate(expression, variables), variables: Object.fromEntries(formulaReferences(expression).map(key => [key, variables[key]])) };
  }
  const defaultVisiting = new Set();
  function standard(id) {
    if (defaultVisiting.has(id)) throw Error(`Dependência circular no cálculo padrão: ${id}.`);
    defaultVisiting.add(id);
    try { return defaultBreakdown(configuredCharacter, id, resolve, (expr, at, extra) => formula(expr, at, extra, id)); }
    finally { defaultVisiting.delete(id); }
  }
  function resolve(id) {
    if (Object.hasOwn(values, id)) return values[id];
    if (errors[id]) throw Error(errors[id]);
    if (visiting.has(id)) throw Error(`Dependência circular: ${[...visiting, id].join(' → ')}.`);
    visiting.add(id);
    try {
      if (currentResources.has(id)) {
        const { target, resource } = currentResources.get(id);
        const value = limitResourceCurrent(c, target, resource.current, resolve(target));
        if (!Number.isFinite(value)) throw Error('Resultado não finito.');
        values[id] = value; baseValues[id] = value; return value;
      }
      const rule = config.rules[id];
      let value = Number(baseValue(c, id));
      const parts = [];
      if (!rule || rule.mode === 'default') {
        const result = standard(id); value = result.total; breakdowns[id] = result;
        parts.push({ label: 'Padrão', value, variables: result.variables || {} });
      } else if (rule.mode === 'manual') {
        if (!Number.isFinite(value)) value = standard(id).total;
      } else if (rule?.mode === 'formula') {
        const part = formula(rule.formula, lvl, {}, id); value = part.value; parts.push({ label: 'Fórmula', ...part });
      } else if (rule?.mode === 'progression') {
        const gain = at => {
          const main = formula(at === 1 ? rule.initial : rule.gain, at, {}, id);
          const bonuses = rule.bonuses.filter(b => b.level === at).map(b => formula(b.formula, at, {}, id));
          const total = main.value + bonuses.reduce((sum, b) => sum + b.value, 0);
          parts.push({ label: `Nível ${at}`, value: total, variables: main.variables, bonuses });
          return total;
        };
        // Saving/import validates future expressions. Recalculation never reevaluates recorded gains.
        if (validateRules) {
          formula(rule.initial, 1, {}, id);
          for (let at = 2; at <= 20; at++) formula(rule.gain, at, {}, id);
          rule.bonuses.forEach(b => formula(b.formula, b.level, {}, id));
        }
        if (rule.policy === 'recorded') {
          const history = structuredClone(rule.history || { anchorLevel: lvl, anchorValue: Number.isFinite(value) ? value : standard(id).total, gains: {} });
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
      if (value === null && id.startsWith('spell:')) { values[id] = null; baseValues[id] = null; details[id] = parts; return null; }
      if (rule?.min != null) value = Math.max(rule.min, value);
      if (rule?.max != null) value = Math.min(rule.max, value);
      if (!Number.isFinite(value)) throw Error('Resultado não finito.');
      baseValues[id] = value;
      value += temporary(id);
      if (id.startsWith('resource:') || rule?.nonNegative) value = Math.max(0, value);
      if (!Number.isFinite(value)) throw Error('Resultado não finito.');
      values[id] = value; details[id] = parts;
      return value;
    } catch (error) { errors[id] = error.message; throw error; }
    finally { visiting.delete(id); }
  }
  for (const id of referenceIds) { try { resolve(id); } catch { /* Each affected target has its own error. */ } }
  let casting;
  try { casting = { value: resolve('spellcasting'), variables: details.spellcasting?.[0]?.variables || {} }; }
  catch (error) { casting = { error: error.message }; errors.spellcasting = error.message; }
  const spells = {};
  for (const spell of c.spells) {
    const dt = spell.dt || { mode: 'none', bonus: 0, resistance: '' };
    try {
      const target = `spell:${spell.id}`;
      const result = { value: resolve(target), variables: details[target]?.[0]?.variables || {} };
      if (dt.mode === 'global' && (!config.rules[target] || config.rules[target].mode === 'default')) {
        result.variables = { ...casting.variables };
        details[target][0].variables = result.variables;
      }
      if (result.value !== null && !Number.isFinite(result.value)) throw Error('DT não finita.');
      spells[spell.id] = { ...result, mode: dt.mode, bonus: dt.bonus, resistance: dt.resistance || '' };
    } catch (error) { spells[spell.id] = { error: error.message }; errors[`spell:${spell.id}`] = error.message; }
  }
  const result = { values, baseValues, errors, details, histories, breakdowns, casting, spells };
  if (!validateRules && Object.isFrozen(c)) cache.set(c, result);
  return result;
}
export function assertCalculations(c, { allowRuntimeErrors = false } = {}) {
  const result = calculateCharacter(c, { validateRules: true });
  const errors = Object.entries(result.errors).filter(([, error]) => !allowRuntimeErrors || !error.split(' · ').every(part => /(?:Divisão por zero|A fórmula não produziu um número válido|Resultado não finito|DT não finita)\.$/.test(part)));
  if (errors.length) throw Error(errors.map(([id, error]) => `${id}: ${error}`).join('\n'));
  return result;
}
