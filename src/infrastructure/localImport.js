import { SHEET_KEY, LEGACY_KEY, BACKUP_KEY } from './sheetRepository.js';
export async function importKey(raw) {
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `browser:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
export async function localCandidates(storage, migrate) {
  const result = [], seen = new Set();
  for (const [source, key] of [['Ficha atual', SHEET_KEY], ['Ficha legada', LEGACY_KEY], ['Backup local', BACKUP_KEY]]) {
    const raw = storage.getItem(key); if (!raw) continue;
    try {
      const document = migrate(JSON.parse(raw), { allowRuntimeErrors: true }), id = await importKey(raw);
      if (seen.has(id)) continue; seen.add(id);
      result.push({ key: id, document, title: document.character.info.name || 'Sem título', source, bytes: new TextEncoder().encode(raw).length });
    } catch { /* An invalid original is retained for the existing recovery flow. */ }
  }
  return result;
}
