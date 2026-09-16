import { createAutosave } from './autosave.js';
import { exportJSON, importJSON } from './jsonFiles.js';
export const KEY = 'hunterscodex:character:v1';
export const BACKUP_KEY = KEY + ':backup';
export function createStorage(getBackend) {
  function save(character) {
    try { getBackend().setItem(KEY, JSON.stringify(character)); return true; }
    catch { return false; }
  }
  function load() {
    let raw = null;
    try {
      raw = getBackend().getItem(KEY);
      return raw === null ? { ok: true, empty: true, raw, value: null }
        : { ok: true, empty: false, raw, value: JSON.parse(raw) };
    } catch (error) { return { ok: false, raw, error }; }
  }
  function backup(raw) {
    try { getBackend().setItem(BACKUP_KEY, raw); return true; }
    catch { return false; }
  }
  const autosaver = createAutosave(save);
  return { KEY, BACKUP_KEY, save, load, backup, autosave: autosaver.schedule,
    cancelAutosave: autosaver.cancel, exportJSON, importJSON };
}
export default createStorage(() => globalThis.localStorage);
