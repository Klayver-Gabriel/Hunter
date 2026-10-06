import { ATTRS } from './character.js';
import { calculationTargets } from './calculationTargets.js';

export const DEFAULT_DT = '8 + PROFICIENCIA + MOD_CONJURACAO + BONUS_DT';
export const createCalculations = () => ({ rules: {}, characteristics: [], spellcasting: { ability: 'int', formula: DEFAULT_DT, bonus: 0 } });
export const createTemporal = () => ({ turn: 0, round: 0, rest: 0, effects: [] });
export const targetIds = calculationTargets;
// Encode the complete ID (including case) so imported IDs cannot collide.
export const referenceFor = id => `REF_${Array.from(id).map(char => char.codePointAt(0).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const expression = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 2000;
export function validateCalculations(c) {
  const config = c.calculations;
  if (!object(config) || !object(config.rules) || !Array.isArray(config.characteristics)) throw Error('Configuração de cálculos inválida.');
  const ids = new Set();
  for (const item of config.characteristics) {
    if (!object(item) || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) || ids.has(item.id) || !finite(item.base) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120) throw Error('Característica personalizada inválida.');
    ids.add(item.id);
  }
  const targets = new Set(targetIds(c));
  for (const [id, rule] of Object.entries(config.rules)) {
    if (!targets.has(id)) throw Error(`Característica removida ou desconhecida: ${id}.`);
    if (!object(rule) || !['default', 'manual', 'formula', 'progression'].includes(rule.mode)) throw Error(`Modo inválido: ${id}.`);
    if (Object.hasOwn(rule, 'nonNegative') && typeof rule.nonNegative !== 'boolean') throw Error(`Não negativo inválido: ${id}.`);
    if (rule.value != null && !finite(rule.value)) throw Error(`Valor manual inválido: ${id}.`);
    if (rule.mode === 'manual' && id !== 'spellcasting' && !/^(attribute|resource|characteristic):/.test(id) && !finite(rule.value)) throw Error(`Valor manual ausente: ${id}.`);
    if (rule.mode === 'formula' && !expression(rule.formula)) throw Error(`Fórmula vazia ou muito longa: ${id}.`);
    if (rule.mode === 'progression') {
      if (!expression(rule.initial) || !expression(rule.gain) || !['current', 'recorded'].includes(rule.policy) || !Array.isArray(rule.bonuses)) throw Error(`Progressão inválida: ${id}.`);
      const levels = new Set();
      for (const bonus of rule.bonuses) {
        if (!object(bonus) || !Number.isInteger(bonus.level) || bonus.level < 1 || bonus.level > 20 || levels.has(bonus.level) || !expression(bonus.formula)) throw Error(`Bônus de nível inválido: ${id}.`);
        levels.add(bonus.level);
      }
      if (rule.history != null) {
        const h = rule.history;
        if (!object(h) || !Number.isInteger(h.anchorLevel) || h.anchorLevel < 1 || h.anchorLevel > 20 || !finite(h.anchorValue) || !object(h.gains)) throw Error(`Histórico inválido: ${id}.`);
        for (const [lvl, value] of Object.entries(h.gains)) if (!/^\d+$/.test(lvl) || Number(lvl) <= h.anchorLevel || Number(lvl) > 20 || !finite(value)) throw Error(`Ganho histórico inválido: ${id}.`);
        for (let at = h.anchorLevel + 1; at <= Math.max(h.anchorLevel, ...Object.keys(h.gains).map(Number)); at++) if (!Object.hasOwn(h.gains, at)) throw Error(`Histórico incompleto: ${id}.`);
      }
    }
    for (const key of ['min', 'max']) if (rule[key] != null && !finite(rule[key])) throw Error(`Limite inválido: ${id}.`);
    if (rule.min != null && rule.max != null && rule.min > rule.max) throw Error(`Mínimo maior que máximo: ${id}.`);
  }
  const casting = config.spellcasting;
  if (!object(casting) || !ATTRS.includes(casting.ability) || !expression(casting.formula) || !finite(casting.bonus) || (casting.base != null && !finite(casting.base))) throw Error('Configuração de conjuração inválida.');
  for (const spell of c.spells) {
    const dt = spell.dt;
    if (dt == null) continue;
    if (!object(dt) || !['global', 'formula', 'fixed', 'none'].includes(dt.mode) || !finite(dt.bonus) || (dt.resistance && !ATTRS.includes(dt.resistance))) throw Error(`DT inválida: ${spell.title}.`);
    if (dt.mode === 'formula' && !expression(dt.formula)) throw Error(`Fórmula de DT inválida: ${spell.title}.`);
    if (dt.mode === 'fixed' && !finite(dt.fixed)) throw Error(`DT fixa inválida: ${spell.title}.`);
    if (spell.circle != null && (!Number.isInteger(spell.circle) || spell.circle < 0)) throw Error(`Círculo numérico inválido: ${spell.title}.`);
  }
  const temporal = c.temporal;
  if (!object(temporal) || !Array.isArray(temporal.effects)) throw Error('Efeitos temporais inválidos.');
  for (const event of ['turn', 'round', 'rest']) if (!Number.isSafeInteger(temporal[event]) || temporal[event] < 0) throw Error('Contador temporal inválido.');
  const effectIds = new Set();
  for (const e of temporal.effects) {
    if (!object(e) || typeof e.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(e.id) || effectIds.has(e.id) || typeof e.name !== 'string' || !e.name.trim() || !['resource', 'bonus'].includes(e.kind) || !targets.has(e.target) || !finite(e.amount) || typeof e.active !== 'boolean') throw Error('Efeito ou característica afetada inválida.');
    effectIds.add(e.id);
    if (e.kind === 'resource' && (!e.target.startsWith('resource:') || !['turn', 'round', 'rest'].includes(e.event))) throw Error('Evento de recurso inválido.');
    if (!['turn', 'round', 'unlimited'].includes(e.durationUnit) || (e.durationUnit !== 'unlimited' && (!Number.isInteger(e.duration) || e.duration < 1 || !Number.isInteger(e.remaining) || e.remaining < 0 || e.remaining > e.duration))) throw Error('Duração inválida.');
    if (e.durationUnit !== 'unlimited' && e.remaining === 0 && e.active) throw Error('Efeito expirado não pode estar ativo.');
  }
  return c;
}
