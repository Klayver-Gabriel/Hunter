import { createSkillTables } from '../../domain/skillTemplates.js';

/** Compatibility with documents saved before the full system selector was removed. */
export function restoreDndProfile(raw) {
  if (raw.schemaVersion !== 4) return raw;
  const profile = raw.systemProfiles?.dnd5e || (raw.systemId === 'dnd5e' && raw.dnd ? raw : null);
  if (!profile?.dnd || !profile.attributes || !Array.isArray(profile.resources)) {
    throw Error('Esta ficha não contém o perfil anterior. Importe uma cópia da ficha anterior à troca de sistema.');
  }
  const result = structuredClone({ ...raw, ...profile, schemaVersion: 3, info: { ...raw.info, ...profile.info } });
  delete result.systemId; delete result.systemProfiles; delete result.recordRules;
  for (const kind of ['weapons', 'armors', 'spells']) {
    const records = kind === 'spells' ? result.spells : result.library?.[kind];
    if (!Array.isArray(records)) continue;
    const restored = records.map(record => ({ ...record, ...profile.recordRules?.[kind]?.[record.id] }));
    if (kind === 'spells') result.spells = restored; else result.library[kind] = restored;
  }
  const tormenta = raw.systemProfiles?.tormenta20?.tormenta;
  result.skillTables = createSkillTables();
  if (raw.systemId === 'tormenta20') result.skillTables.activeId = 'tormenta20';
  for (const craft of tormenta?.crafts || []) result.skillTables.templates.tormenta20.push({ key: `t20_${craft.id}`, name: `Ofício (${craft.name})`, ability: 'int', bonus: 0 });
  for (const skill of result.skillTables.templates.tormenta20) {
    const state = tormenta?.skills?.[skill.key.slice(4)];
    skill.bonus = state?.bonus ?? 0;
    result.dnd.skills[skill.key] = { proficient: Boolean(state?.trained), expertise: false };
  }
  return result;
}
