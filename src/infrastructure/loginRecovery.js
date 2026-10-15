export const LOGIN_RECOVERY_KEY = 'cheets:login-recovery:v1';
export function createLoginRecovery(getStorage = () => sessionStorage, now = () => Date.now()) {
  function read() {
    const storage = getStorage(), raw = storage.getItem(LOGIN_RECOVERY_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (value.version !== 1 || typeof value.owner !== 'string' || !Number.isFinite(value.expiresAt) || value.expiresAt <= now()) {
      storage.removeItem(LOGIN_RECOVERY_KEY); return null;
    }
    return value;
  }
  return {
    save(owner, checkpoint) {
      getStorage().setItem(LOGIN_RECOVERY_KEY, JSON.stringify({ version: 1, owner, expiresAt: now() + 15 * 60 * 1000, checkpoint }));
    },
    load(owner) {
      try { const value = read(); return value?.owner === owner ? value.checkpoint : null; }
      catch { return null; }
    },
    clear(owner) {
      try { if (read()?.owner === owner) getStorage().removeItem(LOGIN_RECOVERY_KEY); }
      catch { /* Recovery storage can be unavailable in restricted browser contexts. */ }
    }
  };
}
