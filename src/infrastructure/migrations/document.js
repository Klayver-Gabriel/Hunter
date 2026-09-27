import { migrateCharacter } from './character.js';
import { recordFor, recordNameKey } from '../../domain/componentCatalog.js';
import { validateAppearance } from '../../domain/sheetAppearance.js';
export function migrateDocument(raw, options = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Documento de ficha inválido.');
  if ('formatVersion' in raw && raw.formatVersion !== 1) throw Error('Versão de documento incompatível.');
  const enveloped = raw.formatVersion === 1;
  const character = migrateCharacter(enveloped ? raw.character : raw, options);
  const sheetAppearance = validateAppearance(enveloped ? raw.sheetAppearance : null);
  if (enveloped && raw.character.schemaVersion === 4) {
    for (const skill of character.skillTables.templates.tormenta20) {
      const previousId = `skill:tormenta20:${skill.key.slice(4)}`, id = `skill:${skill.key}`;
      if (!sheetAppearance.components[previousId]) continue;
      sheetAppearance.components[id] ||= sheetAppearance.components[previousId];
      delete sheetAppearance.components[previousId];
    }
  }
  // A record has a single authoritative name; migrate old visual overrides into its data.
  for (const [id, component] of Object.entries(sheetAppearance.components)) {
    const record = recordFor(character, id);
    if (record && component.label) {
      const key = recordNameKey(record, id); record.originalName ||= record[key];
      record[key] = component.label; delete component.label;
      if (!Object.keys(component).length) delete sheetAppearance.components[id];
    }
  }
  return { formatVersion: 1, character, sheetAppearance };
}
