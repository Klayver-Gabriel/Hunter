import { createStore } from './store.js';
import { createDefault } from '../domain/character.js';
import { createAppearance } from '../domain/sheetAppearance.js';

export const emptyDocument = () => ({ formatVersion: 1, character: createDefault(), sheetAppearance: createAppearance() });
export function documentSignature(document) {
  const value = structuredClone(document);
  // Modification timestamps are excluded from document change detection.
  if (value.character?.meta) delete value.character.meta.updatedAt;
  return JSON.stringify(value);
}
/** Serialized remote writes; an uncertain request keeps its key and captured payload for retry. */
export function createRemoteSession({ api, migrate, onStatus = () => {}, delay = 700, newKey = () => crypto.randomUUID() }) {
  const store = createStore(emptyDocument());
  let entry = null, saved = documentSignature(store.getDocument()), status = 'empty';
  let timer, running, pending, copyRequest, creationContext, deletionRequest, changing = false, disposed = false, paused = false;
  const dirty = () => Boolean(pending) || documentSignature(store.getDocument()) !== saved;
  function report(value, error) { if (!disposed) { status = value; onStatus(value, error); } }
  function errorStatus(error) {
    if (paused) return 'expired';
    if (error.status === 401 || error.code === 'account_changed' || error.code === 'csrf') { paused = true; return 'expired'; }
    return error.code === 'conflict' || error.status === 404 ? 'conflict' : 'error';
  }
  const unsubscribe = store.subscribe((_, scope) => {
    if (scope === 'replace' || disposed) return;
    if (!dirty()) return;
    clearTimeout(timer);
    if (paused || ['conflict', 'expired'].includes(status)) return;
    report('pending');
    if (changing) return;
    timer = setTimeout(() => flush().catch(() => {}), delay);
  });
  async function flush() {
    clearTimeout(timer);
    if (disposed) throw Error('Sessão encerrada.');
    if (paused || status === 'conflict') throw Error('Entre novamente ou salve uma cópia para preservar sua edição.');
    if (running) return running;
    if (changing) throw Error('Aguarde a operação atual. Sua edição foi preservada.');
    if (deletionRequest) throw Error('Use Salvar ficha → Salvar na conta para confirmar a exclusão pendente.');
    running = (async () => {
      while (!disposed && dirty()) {
        if (!pending) {
          const document = structuredClone(store.getDocument());
          pending = entry ? { id: entry.id, input: { document, revision: entry.revision, mutation: newKey() } }
            : { input: { document, key: newKey() } };
        }
        report('saving');
        try {
          const result = pending.id ? await api.update(pending.id, pending.input) : await api.create(pending.input);
          if (disposed || paused) return;
          saved = documentSignature(pending.input.document); entry = result; pending = null;
          report(dirty() ? 'pending' : 'saved');
        } catch (error) { report(errorStatus(error), error); throw error; }
      }
    })();
    try { return await running; } finally { running = null; }
  }
  function activate(result, snapshot = result.document) {
    if (disposed || paused) throw Error('Sessão encerrada.');
    clearTimeout(timer); pending = null; entry = result; saved = documentSignature(snapshot);
    store.replaceDocument(migrate(snapshot, { allowRuntimeErrors: true })); report(dirty() ? 'pending' : 'saved');
  }
  async function open(id) {
    await flush(); const before = documentSignature(store.getDocument());
    changing = true;
    try {
      const result = await api.get(id);
      if (dirty() || documentSignature(store.getDocument()) !== before) throw Error('A ficha foi editada durante a abertura. Salve e tente novamente.');
      activate(result);
    } finally { changing = false; schedulePending(); }
  }
  function schedulePending() {
    clearTimeout(timer);
    if (!disposed && !paused && status === 'pending' && !copyRequest) timer = setTimeout(() => flush().catch(() => {}), delay);
  }
  async function create(raw, key = newKey(), { copy = false } = {}) {
    if (paused) throw Error('Entre novamente na mesma conta antes de salvar.');
    if (!copy && !copyRequest) await flush();
    else if (running) await running.catch(() => {});
    const document = createStore(migrate(raw, { allowRuntimeErrors: true })).getDocument();
    // Copy and import retries reuse the captured payload and idempotency key.
    copyRequest ||= { document, key };
    creationContext ||= { before: documentSignature(store.getDocument()), copy };
    if (!copy && documentSignature(copyRequest.document) !== documentSignature(document)) throw Error('Use Salvar ficha → Salvar na conta para concluir a operação anterior antes de importar outra ficha.');
    const snapshot = copyRequest.document, context = creationContext;
    changing = true; clearTimeout(timer); report('saving');
    try {
      const result = await api.create(copyRequest);
      if (disposed || paused) throw Error('Sessão encerrada. Entre novamente na mesma conta para recuperar a operação.');
      copyRequest = null; creationContext = null;
      if (documentSignature(store.getDocument()) !== context.before) {
        if (context.copy) { entry = result; pending = null; saved = documentSignature(snapshot); report('pending'); }
        else { report('pending'); throw Error('A nova ficha foi criada. A edição atual foi preservada; abra a nova ficha pela lista.'); }
      } else activate(result);
      return result;
    } catch (error) { report(errorStatus(error), error); throw error; }
    finally { changing = false; schedulePending(); }
  }
  async function remove() {
    if (paused) throw Error('Entre novamente na mesma conta.');
    if (!deletionRequest) await flush();
    if (!entry) return;
    deletionRequest ||= { id: entry.id, input: { revision: entry.revision, mutation: newKey() }, before: documentSignature(store.getDocument()) };
    changing = true; clearTimeout(timer); report('saving');
    try {
      await api.remove(deletionRequest.id, deletionRequest.input);
      if (disposed || paused) throw Error('Sessão encerrada.');
      const before = deletionRequest.before; deletionRequest = null;
      // Edits made during deletion stay as a new, unsaved document.
      entry = null; pending = null;
      if (documentSignature(store.getDocument()) === before) { const blank = emptyDocument(); store.replaceDocument(blank); saved = documentSignature(store.getDocument()); report('empty'); }
      else { saved = ''; report('pending'); }
    } catch (error) { report(errorStatus(error), error); throw error; }
    finally { changing = false; schedulePending(); }
  }
  return {
    store, flush, open, create, remove, hasPending: () => !disposed && (dirty() || Boolean(copyRequest) || Boolean(deletionRequest)), getEntry: () => entry, getStatus: () => status,
    saveCopy: async () => { const result = await create(store.getDocument(), newKey(), { copy: true }); deletionRequest = null; return result; },
    retry: () => deletionRequest ? remove() : copyRequest ? create(copyRequest.document, copyRequest.key, { copy: creationContext.copy }) : flush(),
    async checkpoint() {
      clearTimeout(timer);
      if (running) await running.catch(() => {});
      if (changing) throw Error('Aguarde a operação atual antes de entrar novamente.');
      return structuredClone({ version: 1, document: store.getDocument(), entry, saved, pending, copyRequest, creationContext, deletionRequest, status });
    },
    restore(value) {
      if (value?.version !== 1 || typeof value.saved !== 'string' || (value.entry && (typeof value.entry.id !== 'string' || !Number.isSafeInteger(value.entry.revision) || value.entry.revision < 1))) throw Error('Rascunho de recuperação inválido.');
      const document = migrate(value.document, { allowRuntimeErrors: true });
      clearTimeout(timer); store.replaceDocument(document);
      ({ entry, saved, pending, copyRequest, creationContext, deletionRequest } = structuredClone(value));
      paused = false; report(value.status === 'conflict' ? 'conflict' : dirty() || copyRequest || deletionRequest ? 'pending' : entry ? 'saved' : 'empty');
    },
    pause() { paused = true; clearTimeout(timer); report('expired'); },
    resume() { paused = false; if (status === 'expired') report(dirty() ? 'pending' : entry ? 'saved' : 'empty'); },
    dispose() { disposed = true; paused = true; clearTimeout(timer); unsubscribe(); api.dispose(); }
  };
}
