export const PREFERENCES_KEY = 'hunterscodex:preferences:v1';
export function createPreferences(getBackend) {
  return {
    load() {
      try {
        const value = JSON.parse(getBackend().getItem(PREFERENCES_KEY) || '{}');
        return { ok: true, value: { theme: ['light', 'dark'].includes(value?.theme) ? value.theme : null } };
      } catch (error) { return { ok: false, error, value: { theme: null } }; }
    },
    save(theme) {
      if (!['light', 'dark'].includes(theme)) return { ok: false, error: Error('Tema inválido.') };
      try { getBackend().setItem(PREFERENCES_KEY, JSON.stringify({ theme })); return { ok: true }; }
      catch (error) { return { ok: false, error }; }
    }
  };
}
