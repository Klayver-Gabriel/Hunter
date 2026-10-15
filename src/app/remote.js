import { createRemoteApi, readRemoteSession } from '../infrastructure/remoteApi.js';
import { createRemoteSession, emptyDocument } from '../application/remoteSession.js';
import { migrateDocument } from '../infrastructure/migrations/document.js';
import { exportJSON, importJSON } from '../infrastructure/jsonFiles.js';
import { localCandidates, importKey } from '../infrastructure/localImport.js';
import { createCloudUI, previewLocalImport } from '../layout/cloudUI.js';
import * as ui from '../layout/ui.js';
import * as modal from '../layout/modal.js';
import { clearEntryMode } from '../infrastructure/entryMode.js';
import { createLoginRecovery } from '../infrastructure/loginRecovery.js';

export function loginGoogle() {
  clearEntryMode(); location.assign('/auth/google');
}

export async function bootRemote(account, setIndicator) {
  const cloud = createCloudUI(account), api = createRemoteApi(account);
  const lockPrivate = () => {
    api.cancelPending(); modal.close();
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    cloud.lock(); ui.selectPage('sheets');
    document.documentElement.classList.add('remote-locked');
  };
  let session;
  session = createRemoteSession({ api, migrate: migrateDocument, onStatus: (status, error) => {
    setIndicator(status); cloud.status(status);
    if (session) cloud.current(session.store.getDocument(), session.getEntry());
    if (error?.code === 'account_changed') lockPrivate();
  } });
  const { store } = session;
  const recovery = createLoginRecovery();
  let locked = false;
  const refresh = async () => cloud.list(await api.list(), session.getEntry()?.id);
  const action = callback => async (...args) => {
    if (locked) return;
    locked = true;
    try { return await callback(...args); }
    catch (error) {
      if (error.status === 401 || error.code === 'account_changed' || error.code === 'csrf') session.pause();
      if (error.code === 'account_changed') lockPrivate();
      cloud.feedback(error.message); throw error;
    } finally { locked = false; }
  };
  modal.init();
  ui.init(store);
  cloud.current(store.getDocument(), session.getEntry());
  store.subscribe(() => cloud.current(store.getDocument(), session.getEntry()));
  cloud.on('export', () => exportJSON(store.getDocument()));
  cloud.on('import', action(async file => {
    if (file.size > 1000000) throw Error('Arquivo excede 1 MB.');
    const raw = await importJSON(file);
    const document = migrateDocument(raw, { allowRuntimeErrors: true });
    if (!confirm(`Abrir “${document.character.info.name || 'Sem título'}” como nova ficha na conta de ${account.user.name}?`)) return false;
    await session.create(document, await importKey(JSON.stringify(raw))); await refresh(); ui.selectPage('guild-card');
  }));
  cloud.on('new', action(async () => {
    await session.create(emptyDocument()); await refresh(); ui.selectPage('guild-card');
  }));
  cloud.on('save', action(async () => {
    const previousEntry = session.getEntry();
    await session.retry();
    if (!session.getEntry() && !previousEntry) await session.create(store.getDocument());
    cloud.feedback(session.getEntry() ? 'Ficha salva na sua conta.' : 'Exclusão da ficha confirmada na sua conta.'); await refresh();
  }));
  cloud.on('open', action(async () => {
    if (!cloud.selected()) return false;
    await session.open(cloud.selected()); ui.selectPage('guild-card');
  }));
  cloud.on('refresh', action(refresh));
  cloud.on('copy', action(async () => { await session.saveCopy(); cloud.feedback('Cópia confirmada no armazenamento remoto.'); await refresh(); }));
  cloud.on('delete', action(async () => {
    if (!session.getEntry()) return;
    if (!confirm(`Excluir a ficha “${session.getEntry().title}” da sua conta? Ela sairá da lista; a recuperação exige o administrador do banco.`)) return;
    await session.remove(); await refresh();
  }));
  cloud.on('migrate', action(async () => {
    const candidates = await localCandidates(localStorage, migrateDocument);
    if (!candidates.length) { cloud.feedback('Nenhuma ficha local válida encontrada. Os dados locais foram preservados.'); return; }
    previewLocalImport(candidates, action(async selected => {
      for (const item of selected) await session.create(item.document, item.key);
      await refresh(); cloud.feedback('Importação remota confirmada. Os originais continuam neste navegador.');
    }));
  }));
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('hunter-account') : null;
  const hidePrivate = () => {
    modal.close(); document.getElementById('app').inert = true; document.getElementById('app').hidden = true;
  };
  cloud.on('logout', action(async () => {
    if (session.hasPending() && !confirm('Há alterações sem confirmação remota. Exporte o JSON antes de sair. Confirmar saída e descartar essas alterações?')) return;
    session.pause(); api.cancelPending();
    try { await api.logout(); } catch (error) { if (error.status !== 401) throw error; }
    recovery.clear(account.user.id); clearEntryMode();
    session.dispose(); channel?.postMessage({ type: 'logout', owner: account.user.id }); channel?.close(); hidePrivate(); location.assign('/');
  }));
  cloud.on('login', action(async () => {
    session.pause(); api.cancelPending();
    try { recovery.save(account.user.id, await session.checkpoint()); }
    catch { throw Error('Não foi possível guardar a recuperação desta edição. Exporte o JSON antes de entrar novamente.'); }
    session.dispose(); loginGoogle();
  }));
  if (channel) channel.onmessage = event => {
    if (event.data?.type !== 'logout' || event.data.owner !== account.user.id) return;
    session.pause(); lockPrivate();
    // The in-memory snapshot is available for recovery by the same account.
    cloud.feedback('A conta saiu em outra aba. A ficha está oculta. Entre na mesma conta para recuperar ou exportar a edição.');
  };
  // Revalidate the session and account when the page receives focus.
  window.addEventListener('focus', async () => {
    try {
      const next = await readRemoteSession();
      if (next.user?.id !== account.user.id) {
        session.pause(); modal.close();
        if (next.user) lockPrivate();
      } else api.renew(next);
    }
    catch { /* Session validation is retried on the next authenticated request. */ }
  });
  window.addEventListener('beforeunload', event => { if (session.hasPending()) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') session.flush().catch(() => {}); });
  setIndicator('empty'); cloud.status('empty');
  try {
    const checkpoint = recovery.load(account.user.id);
    if (checkpoint) {
      session.restore(checkpoint); recovery.clear(account.user.id);
      if (session.getStatus() !== 'conflict') await session.retry();
      cloud.feedback('Sua edição foi recuperada na mesma conta.');
    }
  } catch (error) { cloud.feedback(error.message); }
  try { await refresh(); } catch (error) { cloud.feedback(error.message); }
}
