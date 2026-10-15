import { showRecovery } from '../layout/recovery.js';
import { createSession, recoverSheet } from '../application/session.js';
import { createSheetRepository } from '../infrastructure/sheetRepository.js';
import { migrateDocument } from '../infrastructure/migrations/document.js';
import { exportJSON, importJSON } from '../infrastructure/jsonFiles.js';
import { createPreferences } from '../infrastructure/preferences.js';
import { initTheme } from '../layout/theme/theme.js';
import * as ui from '../layout/ui.js';
import * as modal from '../layout/modal.js';
import { readRemoteSession } from '../infrastructure/remoteApi.js';
import { createCloudUI } from '../layout/cloudUI.js';
import { bootRemote, loginGoogle } from './remote.js';
import { chooseLogin, showWorkspace } from '../layout/loginUI.js';
import { localModeSelected, selectLocalMode, clearEntryMode } from '../infrastructure/entryMode.js';

function setIndicator(status) {
  const el = document.getElementById('save-indicator');
  el.classList.toggle('saving', status === 'saving');
  el.classList.toggle('save-error', ['error', 'conflict', 'expired'].includes(status));
  el.setAttribute('role', 'status');
  document.getElementById('save-indicator-text').textContent = {
    empty: 'Nenhuma ficha remota aberta', pending: 'Alterações pendentes', saving: 'Salvando…', saved: 'Salvo', error: 'Erro ao salvar', conflict: 'Conflito de versão', expired: 'Entre novamente para salvar'
  }[status];
}
async function boot() {
  initTheme(createPreferences(() => localStorage));
  let account;
  try { account = await readRemoteSession(); }
  catch { account = { enabled: true, user: null, unavailable: true }; }
  const url = new URL(location.href), auth = url.searchParams.get('auth');
  if (auth) { url.searchParams.delete('auth'); history.replaceState(null, '', url.pathname + url.search + url.hash); }
  if (account.user) {
    clearEntryMode();
    document.getElementById('login-status').textContent = 'Abrindo suas fichas…';
    await bootRemote(account, setIndicator); showWorkspace('remote'); return;
  }
  if (!localModeSelected() || auth || account.unavailable) {
    const choice = await chooseLogin({ ...account, error: Boolean(auth) });
    if (choice === 'google') { clearEntryMode(); loginGoogle(); return; }
    selectLocalMode();
  }
  const cloud = createCloudUI({ ...account, unavailable: false });
  const repository = createSheetRepository(() => localStorage);
  const session = createSession({ repository, migrate: migrateDocument, onStatus: status => { setIndicator(status); cloud.status(status); } });
  cloud.on('login', async () => {
    if (session.ok && !session.flush().ok) throw Error('Exporte sua ficha antes de entrar: o salvamento local falhou.');
    clearEntryMode(); location.assign('/');
  });
  cloud.on('home', () => {
    if (session.ok && !session.flush().ok) throw Error('Exporte a ficha antes de voltar: o salvamento local falhou.');
    clearEntryMode(); location.assign('/');
  });
  if (!session.ok) {
    showWorkspace('local');
    showRecovery({ loaded: session.loaded, error: session.error, readFile: importJSON,
      recover: candidate => recoverSheet({ repository, migrate: migrateDocument, original: session.loaded.raw }, candidate), onStatus: setIndicator }); return;
  }
  const { store } = session;
  modal.init();
  ui.init(store);
  cloud.current(store.getDocument());
  store.subscribe(() => cloud.current(store.getDocument()));
  cloud.on('export', () => exportJSON(store.getDocument()));
  cloud.on('import', async file => {
    session.replace(await importJSON(file)); ui.selectPage('guild-card');
  });
  cloud.on('new', () => {
    if (!confirm('Criar uma nova ficha? A ficha atual será preservada em backup.')) return false;
    session.newSheet(); ui.selectPage('guild-card');
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') session.flush(); });
  showWorkspace('local');
}
boot().catch(() => {
  for (const element of document.querySelectorAll('#app, .guild-nav, .skip-link, #save-indicator')) element.hidden = true;
  document.getElementById('login-screen').hidden = false;
  document.documentElement.dataset.appState = 'error';
  document.getElementById('login-status').textContent = 'Não foi possível abrir o Cheets. Recarregue a página para tentar novamente.';
  document.getElementById('login-retry').hidden = false;
  document.getElementById('login-retry').onclick = () => location.reload();
  setIndicator('error');
});
