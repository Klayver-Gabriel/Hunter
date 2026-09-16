export const SHEET_KEY = 'hunterscodex:sheet:v1';
export const LEGACY_KEY = 'hunterscodex:character:v1';
export const BACKUP_KEY = 'hunterscodex:sheet:backup';
/** @returns {import('../application/ports/repositories.js').SheetRepository} */
export function createSheetRepository(getBackend) {
  const write = (key, value) => {
    try { getBackend().setItem(key, value); return { ok: true }; }
    catch (error) { return { ok: false, error }; }
  };
  return {
    load() {
      let raw = null;
      try {
        let source = SHEET_KEY; raw = getBackend().getItem(source);
        if (raw === null) { source = LEGACY_KEY; raw = getBackend().getItem(source); }
        return { ok: true, empty: raw === null, raw, value: raw === null ? null : JSON.parse(raw), source };
      } catch (error) { return { ok: false, raw, error }; }
    },
    save(document) { return write(SHEET_KEY, JSON.stringify(document)); },
    backup(raw) { return write(BACKUP_KEY, raw); }
  };
}
export function createMemoryBackend() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}
