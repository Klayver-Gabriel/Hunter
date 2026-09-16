import { showRecovery } from '../layout/recovery.js';
import { createSession, recoverSheet } from '../application/session.js';
import { createSheetRepository } from '../infrastructure/sheetRepository.js';
import { migrateDocument } from '../infrastructure/migrations/document.js';
import { exportJSON, importJSON } from '../infrastructure/jsonFiles.js';
import { createPreferences } from '../infrastructure/preferences.js';
import { initTheme } from '../layout/theme/theme.js';
import * as ui from '../layout/ui.js';
import * as modal from '../layout/modal.js';

function setIndicator(status) {
  const el = document.getElementById('save-indicator');
  el.classList.toggle('saving', status === 'saving');
  el.classList.toggle('save-error', status === 'error');
  el.setAttribute('role', 'status');
  document.getElementById('save-indicator-text').textContent = {
    saving: 'Salvando…', saved: 'Salvo', error: 'Erro ao salvar'
  }[status];
}
function boot() {
  initTheme(createPreferences(() => localStorage));
  const repository = createSheetRepository(() => localStorage);
  const session = createSession({ repository, migrate: migrateDocument, onStatus: setIndicator });
  if (!session.ok) {
    showRecovery({ loaded: session.loaded, error: session.error, readFile: importJSON,
      recover: candidate => recoverSheet({ repository, migrate: migrateDocument, original: session.loaded.raw }, candidate), onStatus: setIndicator }); return;
  }
  const { store } = session;
  modal.init();
  ui.init(store, {
    exportSheet: () => exportJSON(store.getDocument()),
    importSheet: async file => {
      try { session.replace(await importJSON(file)); } catch (error) { alert(`Não foi possível importar: ${error.message}`); }
    },
    newSheet: () => {
      if (!confirm('Criar um novo Caçador? A ficha atual será preservada em backup.')) return;
      try { session.newSheet(); } catch (error) { alert(`Não foi possível criar a ficha: ${error.message}`); }
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') session.flush(); });
}
boot();
