import { createEditor } from '../layout/customization/editor.js';
import { createSurface } from '../layout/customization/surface.js';
import { createSession } from '../application/session.js';
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
function recovery(loaded, error) {
  const panel = document.createElement('section'); panel.className = 'panel';
  const title = document.createElement('h1'); title.textContent = 'Não foi possível abrir sua ficha';
  const message = document.createElement('p'); message.textContent = `${error.message} Seus dados não foram substituídos.`;
  panel.append(title, message);
  if (loaded.raw !== null) {
    const download = document.createElement('button'); download.className = 'btn'; download.textContent = 'Baixar original';
    download.onclick = () => {
      const url = URL.createObjectURL(new Blob([loaded.raw], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'hunter-original.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }; panel.append(download);
  }
  const retry = document.createElement('button'); retry.className = 'btn'; retry.textContent = 'Tentar novamente';
  retry.onclick = () => location.reload(); panel.append(retry);
  document.getElementById('app').replaceChildren(panel);
  document.querySelector('.guild-nav').hidden = true; setIndicator('error');
}
function boot() {
  initTheme(createPreferences(() => localStorage));
  const session = createSession({ repository: createSheetRepository(() => localStorage), migrate: migrateDocument, onStatus: setIndicator });
  if (!session.ok) { recovery(session.loaded, session.error); return; }
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
