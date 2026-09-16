import { level, abilityModifier, buffTotals } from './common.js';
import * as F from './formulaEvaluator.js';

export function hitDieSides(character) {
  return Number(String(character.dnd.vitality.hitDie || 'd8').replace(/\D/g, '')) || 8;
}

export function maxHpBreakdown(character) {
  const lvl = level(character);
  const die = hitDieSides(character);
  const vitality = character.dnd.vitality;
  const con = abilityModifier(character, 'con');
  const firstFormula = vitality.firstLevelFormula || `${die} + CON`;
  const laterFormula = vitality.laterLevelFormula || `${Math.floor(die / 2) + 1} + CON`;
  const variables = { CON: con, CON_MOD: con, LEVEL: lvl, NIVEL: lvl };
  const errors = [];
  let firstLevel;
  let laterPerLevel;

  try { firstLevel = Math.floor(F.evaluate(firstFormula, variables)); }
  catch (err) { firstLevel = die + con; errors.push(`1º nível: ${err.message}`); }
  try { laterPerLevel = Math.floor(F.evaluate(laterFormula, variables)); }
  catch (err) { laterPerLevel = Math.floor(die / 2) + 1 + con; errors.push(`níveis seguintes: ${err.message}`); }

  const laterLevels = Math.max(0, lvl - 1) * laterPerLevel;
  const feats = Number(character.dnd.vitality.featBonus) || 0;
  const buffs = (Number(character.dnd.vitality.buffs) || 0) + buffTotals(character).hp;
  return {
    firstFormula, laterFormula, firstLevel, laterPerLevel, laterLevels,
    feats, buffs, errors,
    total: Math.max(1, firstLevel + laterLevels + feats + buffs)
  };
}

