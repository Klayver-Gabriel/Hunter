import { createAutosave } from './autosave.js';
import { createDefault } from '../domain/character.js';
import { createAppearance, validateAppearance } from '../customization/appearance.js';
import { createStore } from './store.js';

/** Dependencies are injected so recovery can be tested without DOM or localStorage. */
export function createSession({ repository, migrate, onStatus = () => {} }) {
  const loaded = repository.load();
  if (!loaded.ok) return { ok: false, loaded, error: loaded.error };
  let initial;
  try {
    const requiresMigration = !loaded.empty && (loaded.value?.formatVersion !== 1
      || loaded.value?.character?.schemaVersion !== 2 || loaded.value?.sheetAppearance?.version !== 1);
    if (requiresMigration) {
      const backup = repository.backup(loaded.raw); if (!backup.ok) throw backup.error;
    }
    initial = loaded.empty ? { formatVersion: 1, character: createDefault(), sheetAppearance: createAppearance() } : migrate(loaded.value);
  } catch (error) { return { ok: false, loaded, error }; }
  const store = createStore(initial);
  let dirty = false;
  const report = status => { if (status === 'saved') dirty = false; onStatus(status); };
  const autosave = createAutosave(value => repository.save(value).ok);
  store.subscribe((_, scope) => {
    if (scope !== 'appearance' && scope !== 'replace') {
      dirty = true; autosave.schedule(store.getDocument(), report);
    }
  });
  const initialSave = JSON.stringify(store.getDocument()) === loaded.raw ? { ok: true } : repository.save(store.getDocument());
  dirty = !initialSave.ok; report(initialSave.ok ? 'saved' : 'error');
  function replace(raw) {
    if (store.isLocked()) throw Error('Conclua a personalização antes de trocar de ficha.');
    const document = migrate(raw);
    // Normalize derived values before committing the replacement to storage.
    const next = createStore(document).getDocument();
    const backup = repository.backup(JSON.stringify(store.getDocument()));
    if (!backup.ok) throw backup.error;
    const saved = repository.save(next);
    if (!saved.ok) { onStatus('error'); throw saved.error; }
    autosave.cancel(); store.replaceDocument(next); report('saved');
  }
  return { ok: true, store, replace,
    newSheet: () => replace({ formatVersion: 1, character: createDefault(), sheetAppearance: createAppearance() }),
    saveAppearance(appearance) {
      const next = { ...store.getDocument(), sheetAppearance: validateAppearance(appearance) };
      const saved = repository.save(next);
      if (!saved.ok) { onStatus('error'); return saved; }
      autosave.cancel(); store.setAppearance(next.sheetAppearance); report('saved'); return saved;
    },
    flush() {
      if (!dirty) return { ok: true };
      autosave.cancel(); const saved = repository.save(store.getDocument());
      report(saved.ok ? 'saved' : 'error'); return saved;
    }
  };
}

export function recoverSheet({ repository, migrate, original }, candidate) {
  const document = migrate(candidate);
  if (original !== null) {
    const backup = repository.backup(original); if (!backup.ok) throw backup.error;
  }
  const result = repository.save(document); if (!result.ok) throw result.error;
}
