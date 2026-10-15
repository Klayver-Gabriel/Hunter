export const ENTRY_MODE_KEY = 'cheets:entry-mode';
export function localModeSelected() {
  try { return sessionStorage.getItem(ENTRY_MODE_KEY) === 'local'; } catch { return false; }
}
export function selectLocalMode() {
  try { sessionStorage.setItem(ENTRY_MODE_KEY, 'local'); } catch { /* Selection remains active for this page. */ }
}
export function clearEntryMode() {
  try { sessionStorage.removeItem(ENTRY_MODE_KEY); } catch { /* Navigation proceeds with the current choice. */ }
}
