import { migrate } from '../../domain/character.js';
import { validateAppearance } from '../../customization/appearance.js';
export function migrateDocument(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Documento de ficha inválido.');
  if ('formatVersion' in raw && raw.formatVersion !== 1) throw Error('Versão de documento incompatível.');
  const enveloped = raw.formatVersion === 1;
  return { formatVersion: 1, character: migrate(enveloped ? raw.character : raw),
    sheetAppearance: validateAppearance(enveloped ? raw.sheetAppearance : null) };
}
