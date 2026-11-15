import { createRemoteApi, readRemoteSession } from '../infrastructure/remoteApi.js';
import { createRemoteSession, emptyDocument } from '../application/remoteSession.js';
import { createStore } from '../application/store.js';
import { migrateDocument } from '../infrastructure/migrations/document.js';
import { exportJSON, importJSON } from '../infrastructure/jsonFiles.js';
import { localCandidates, importKey } from '../infrastructure/localImport.js';
import { createCloudUI, previewLocalImport } from '../layout/cloudUI.js';
import { createSheetPickerUI } from '../layout/sheetPickerUI.js';
import * as ui from '../layout/ui.js';
import * as modal from '../layout/modal.js';
import { clearEntryMode } from '../infrastructure/entryMode.js';
import { createLoginRecovery } from '../infrastructure/loginRecovery.js';
import { legacySystemOverrides, systemDefaultsFromCharacter, validateSystemProfile } from '../domain/gameSystems.js';
import { showSheetPicker, showWorkspace } from '../layout/loginUI.js';

export function loginGoogle() {
  clearEntryMode(); location.assign('/auth/google');
}

export async function bootRemote(account, setIndicator) {
  const cloud = createCloudUI(account), api = createRemoteApi(account), picker = createSheetPickerUI(account.user);
  const lockPrivate = () => {
    api.cancelPending(); modal.close();
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    picker.clear(); picker.hide();
    cloud.lock(); ui.selectPage('sheets');
    document.documentElement.classList.add('remote-locked');
    showWorkspace('remote'); ui.selectPage('sheets');
  };
  let systemProfiles = [];
  const pendingSystemAssociations = new Map();
  try { systemProfiles = await api.listSystems(); }
  catch (error) { picker.feedback(error.message); }
  let session;
  session = createRemoteSession({ api, migrate: migrateDocument, systems: systemProfiles, onStatus: (status, error) => {
    setIndicator(status); cloud.status(status);
    if (session) cloud.current(session.store.getDocument(), session.getEntry());
    if (error?.code === 'account_changed') lockPrivate();
  } });
  const { store } = session;
  const recovery = createLoginRecovery();
  let locked = false;
  const refresh = async () => {
    const [nextSystems, entries] = await Promise.all([api.listSystems(), api.list()]);
    systemProfiles = nextSystems; session.setSystems(nextSystems);
    picker.setData(entries, nextSystems); cloud.list(entries, session.getEntry()?.id);
    return entries;
  };
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
  ui.init(store, { systems: systemProfiles, remote: true });
  cloud.current(store.getDocument(), session.getEntry());
  store.subscribe(() => cloud.current(store.getDocument(), session.getEntry()));
  document.getElementById('btn-my-sheets').addEventListener('click', action(async () => {
    await session.flush(); await refresh(); picker.show();
  }));
  const exportCurrent = () => exportJSON(store.getPersistentDocument(), systemProfiles.find(item => item.id === store.getState().systemId));
  cloud.on('export', exportCurrent);
  async function importFile(file) {
    if (file.size > 1000000) throw Error('Arquivo excede 1 MB.');
    const raw = await importJSON(file);
    const document = migrateDocument(raw, { allowRuntimeErrors: true });
    const bundle = raw.systemBundle ? validateSystemProfile(raw.systemBundle) : null;
    if (!confirm(`Importar “${document.character.info.name || 'Sem título'}” para a conta de ${account.user.name}?`)) return false;
    const activeTable = document.character.skillTables.activeId;
    const currentOverrides = document.character.systemOverrides || {};
    const hasPersonalOverrides = Boolean(currentOverrides.skills
      || Object.values(currentOverrides.skillsBySystem || {}).some(rows => rows.length)
      || Object.keys(currentOverrides.calculations || {}).length
      || Object.values(currentOverrides.profiles || {}).some(profile => profile.skills?.length
        || Object.keys(profile.calculations || {}).length || Object.keys(profile.attributes || {}).length
        || profile.resources?.length || Object.keys(profile.appearance?.components || {}).length
        || Object.keys(profile.appearance?.layouts?.desktop || {}).length || Object.keys(profile.appearance?.layouts?.mobile || {}).length));
    if (!bundle && ['dnd5e', 'tormenta20'].includes(activeTable)) {
      document.character.systemId = activeTable;
      if (!hasPersonalOverrides) document.character.systemOverrides = legacySystemOverrides(document.character);
    }
    const previousSystemId = document.character.systemId;
    let profile = systemProfiles.find(item => item.id === previousSystemId);
    if (bundle) {
      const matching = systemProfiles.find(item => item.id === bundle.id && JSON.stringify(item.config) === JSON.stringify(bundle.config));
      if (matching) profile = matching;
      else {
        const title = systemProfiles.some(item => item.title === bundle.title) ? `${bundle.title} (importado)` : bundle.title;
        profile = await api.createSystem({ title, config: bundle.config });
      }
    }
    if (!profile) {
      const legacy = systemDefaultsFromCharacter(document.character, document.sheetAppearance);
      const title = legacy.title === 'Novo sistema' ? 'Sistema importado' : `${legacy.title} (importado)`;
      profile = await api.createSystem({ title, config: legacy.config });
    }
    if (!profile) throw Error('Não há sistemas disponíveis para importar esta ficha.');
    if (previousSystemId !== profile.id) {
      const overrides = document.character.systemOverrides || {};
      overrides.profiles ||= {};
      if (overrides.profiles[previousSystemId] && !overrides.profiles[profile.id]) {
        overrides.profiles[profile.id] = structuredClone(overrides.profiles[previousSystemId]);
      }
      const bySystem = overrides.skillsBySystem;
      if (bySystem?.[previousSystemId] && !bySystem[profile.id]) bySystem[profile.id] = structuredClone(bySystem[previousSystemId]);
      document.character.systemOverrides = overrides;
      document.character.systemId = profile.id;
    }
    await session.create(document, await importKey(JSON.stringify(raw)));
    await refresh(); ui.selectPage('guild-card'); picker.hide(); showWorkspace('remote');
    return true;
  }
  cloud.on('import', action(importFile));
  picker.on('import', action(importFile));
  cloud.on('new', action(async () => {
    const profile = systemProfiles.find(item => item.id === store.getState().systemId) || systemProfiles[0];
    await session.create(emptyDocument(profile.id, profile)); await refresh(); ui.selectPage('guild-card');
  }));
  cloud.on('save', action(async () => {
    const previousEntry = session.getEntry();
    await session.retry();
    if (!session.getEntry() && !previousEntry) await session.create(store.getPersistentDocument());
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
  picker.on('refresh', action(refresh));
  picker.on('open', action(async id => {
    await session.open(id); await refresh(); ui.selectPage('guild-card'); picker.hide(); showWorkspace('remote');
  }));
  picker.on('new', action(async systemId => {
    const profile = systemProfiles.find(item => item.id === systemId) || systemProfiles[0];
    await session.create(emptyDocument(profile.id, profile)); await refresh(); ui.selectPage('guild-card'); picker.hide(); showWorkspace('remote');
  }));
  picker.on('change-system', action(async ({ sheetId, systemId }) => {
    const profile = systemProfiles.find(item => item.id === systemId);
    if (!profile) throw Error('O sistema selecionado não está disponível na sua conta. Atualize a lista e tente novamente.');
    let pending = pendingSystemAssociations.get(sheetId);
    if (pending && pending.systemId !== systemId) throw Error('Há uma troca de sistema sem confirmação. Repita a última escolha antes de iniciar outra.');
    if (!pending) {
      const current = await api.get(sheetId);
      if (current.document.character.systemId === systemId) return { message: 'Esta ficha já usa esse sistema.' };
      const workingStore = createStore(migrateDocument(current.document, { allowRuntimeErrors: true }));
      workingStore.setSystemProfiles(systemProfiles);
      workingStore.selectSystem(systemId);
      pending = { systemId, input: { document: workingStore.getPersistentDocument(), revision: current.revision, mutation: crypto.randomUUID() } };
      pendingSystemAssociations.set(sheetId, pending);
    }
    try {
      await api.update(sheetId, pending.input);
      pendingSystemAssociations.delete(sheetId);
    } catch (error) {
      if (error.status === 400 || error.status === 404 || error.status === 409) pendingSystemAssociations.delete(sheetId);
      throw error;
    }
    await refresh();
    return { message: `Sistema da ficha atualizado para ${profile.title}.` };
  }));
  picker.on('create-system', action(async profile => {
    await api.createSystem(profile); await refresh();
  }));
  picker.on('save-system', action(async profile => {
    await api.updateSystem(profile.id, { title: profile.title, revision: profile.revision, config: profile.config }); await refresh();
  }));
  picker.on('duplicate-system', action(async profile => {
    await api.createSystem({ title: `${profile.title} (cópia)`, config: profile.config }); await refresh();
  }));
  picker.on('delete-system', action(async profile => {
    await api.deleteSystem(profile.id, { revision: profile.revision }); await refresh();
  }));
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('hunter-account') : null;
  const hidePrivate = () => {
    modal.close(); picker.hide(); document.getElementById('app').inert = true; document.getElementById('app').hidden = true;
  };
  const logout = action(async () => {
    if (session.hasPending() && !confirm('Há alterações sem confirmação remota. Exporte o JSON antes de sair. Confirmar saída e descartar essas alterações?')) return;
    session.pause(); api.cancelPending();
    try { await api.logout(); } catch (error) { if (error.status !== 401) throw error; }
    recovery.clear(account.user.id); clearEntryMode();
    session.dispose(); channel?.postMessage({ type: 'logout', owner: account.user.id }); channel?.close(); hidePrivate(); location.assign('/');
  });
  cloud.on('logout', logout); picker.on('logout', logout);
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
      } else {
        api.renew(next);
        if (!document.getElementById('sheet-picker').hidden) await refresh();
      }
    }
    catch { /* Session validation is retried on the next authenticated request. */ }
  });
  window.addEventListener('beforeunload', event => { if (session.hasPending()) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') session.flush().catch(() => {}); });
  setIndicator('empty'); cloud.status('empty');
  let recovered = false;
  try {
    const checkpoint = recovery.load(account.user.id);
    if (checkpoint) {
      session.restore(checkpoint); recovery.clear(account.user.id);
      if (session.getStatus() !== 'conflict') await session.retry();
      cloud.feedback('Sua edição foi recuperada na mesma conta.'); recovered = true;
    }
  } catch (error) { cloud.feedback(error.message); }
  try { await refresh(); } catch (error) { cloud.feedback(error.message); picker.feedback(error.message); }
  if (recovered) { showWorkspace('remote'); ui.selectPage('guild-card'); }
  else { showSheetPicker(); }
}
