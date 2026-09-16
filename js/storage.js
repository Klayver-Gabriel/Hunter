/* ============================================================
   HUNTER'S CODEX — STORAGE
   Autosave em localStorage (sem servidor, sem dependências) +
   exportação/importação em JSON para backup e compartilhamento.
   ============================================================ */

window.HC = window.HC || {};

HC.storage = (function () {

  const KEY = 'hunterscodex:character:v1';
  const BACKUP_KEY = KEY + ':backup';
  let saveTimer = null;

  function save(character) {
    try {
      localStorage.setItem(KEY, JSON.stringify(character));
      return true;
    } catch (err) {
      console.error('[HunterCodex] Falha ao salvar:', err);
      return false;
    }
  }

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
      if (raw === null) return { ok: true, empty: true, raw, value: null };
      return { ok: true, empty: false, raw, value: JSON.parse(raw) };
    } catch (error) {
      return { ok: false, raw, error };
    }
  }

  function backup(raw) {
    try { localStorage.setItem(BACKUP_KEY, raw); return true; }
    catch (error) { console.error('[HunterCodex] Falha no backup:', error); return false; }
  }

  function cancelAutosave() { clearTimeout(saveTimer); saveTimer = null; }

  function clear() {
    localStorage.removeItem(KEY);
  }

  /**
   * Autosave com debounce — evita gravar no localStorage a cada
   * tecla digitada. onSaved(status) é chamado com 'saving' antes
   * e 'saved' depois, para alimentar o indicador visual.
   */
  function autosave(character, onStatusChange, delay) {
    if (typeof onStatusChange === 'function') onStatusChange('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const ok = save(character);
      if (typeof onStatusChange === 'function') onStatusChange(ok ? 'saved' : 'error');
    }, delay || 500);
  }

  function exportJSON(character) {
    const blob = new Blob([JSON.stringify(character, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (character.info.name || 'cacador').trim().replace(/[^a-z0-9\-_]+/gi, '_').toLowerCase();
    a.href = url;
    a.download = `hunterscodex_${safeName || 'ficha'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          resolve(data);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  return { KEY, BACKUP_KEY, save, load, backup, clear, autosave, cancelAutosave, exportJSON, importJSON };
})();
