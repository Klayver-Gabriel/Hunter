import { showRecovery } from '../layout/recovery.js';
import { createEditor } from '../layout/customization/editor.js';
import { createSurface } from '../layout/customization/surface.js';
import { createSession, recoverSheet } from '../application/session.js';
import { createSheetRepository } from '../infrastructure/sheetRepository.js';
import { migrateDocument } from '../infrastructure/migrations/document.js';
import { exportJSON, importJSON } from '../infrastructure/jsonFiles.js';
import { createPreferences } from '../infrastructure/preferences.js';
import { initTheme } from '../layout/theme/theme.js';
import * as ui from '../layout/ui.js';
import * as modal from '../layout/modal.js';
import { createRegistry } from '../layout/customization/registry.js';

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
  const registry = createRegistry(document.getElementById('app'));
  const surface = createSurface(document.getElementById('app'), registry);
  const editor = createEditor({ root: document.getElementById('app'), registry, surface, session, refresh: () => ui.renderAll() });
  ui.init(store, {
    beforeRender: () => editor.beforeRender(),
    afterRender: () => editor.afterRender(),
    exportSheet: () => exportJSON(store.getDocument()),
    importSheet: async file => {
      try { session.replace(await importJSON(file)); } catch (error) { alert(`Não foi possível importar: ${error.message}`); }
    },
    newSheet: () => {
      if (!confirm('Criar um novo Caçador? A ficha atual será preservada em backup.')) return;
      try { session.newSheet(); } catch (error) { alert(`Não foi possível criar a ficha: ${error.message}`); }
    }
  });
  let lastWidth = document.getElementById('app').clientWidth;
  new ResizeObserver(() => {
    const width = document.getElementById('app').clientWidth;
    if (Math.abs(width - lastWidth) > 1) { lastWidth = width; if (!editor.editing) ui.renderAll(); }
  }).observe(document.getElementById('app'));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') session.flush(); });
}
boot();
