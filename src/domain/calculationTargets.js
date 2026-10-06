import { ABILITIES } from './catalog.js';
import { allSkills } from './skillTemplates.js';

export const METRIC_TARGETS = ['indicator:proficiency', 'metric:armor', 'metric:initiative', 'metric:passive', 'armor:total', 'attack:bonus', 'attack:damage'];
export const calculationTargets = c => [
  'spellcasting', ...ABILITIES.map(a => `attribute:${a.key}`),
  ...c.resources.map(r => `resource:${r.id}`),
  ...(c.calculations?.characteristics || []).map(r => `characteristic:${r.id}`),
  ...METRIC_TARGETS, ...ABILITIES.map(a => `save:${a.key}`),
  ...allSkills(c).map(s => `skill:${s.key}`), ...c.spells.map(s => `spell:${s.id}`)
];
export const currentResourceId = id => `${id}:current`;
export const resourceNonNegative = (c, id) => c.calculations?.rules[id]?.nonNegative ?? true;
export function limitResourceCurrent(c, id, current, maximum) {
  return Math.min(maximum, resourceNonNegative(c, id) ? Math.max(0, current) : current);
}
