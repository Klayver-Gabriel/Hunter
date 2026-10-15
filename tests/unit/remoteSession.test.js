import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteSession, emptyDocument } from '../../src/application/remoteSession.js';
import { migrateDocument } from '../../src/infrastructure/migrations/document.js';
import { createRemoteApi } from '../../src/infrastructure/remoteApi.js';
import { localCandidates } from '../../src/infrastructure/localImport.js';
import { createMemoryBackend, SHEET_KEY, LEGACY_KEY } from '../../src/infrastructure/sheetRepository.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture(overrides = {}) {
  const writes = [], statuses = [];
  const api = {
    async create(input) { writes.push(structuredClone(input)); return { id: 'one', revision: 1, document: input.document }; },
    async update(id, input) { writes.push(structuredClone(input)); return { id, revision: input.revision + 1, document: input.document }; },
    dispose() {}, ...overrides
  };
  const session = createRemoteSession({ api, migrate: migrateDocument, delay: 100000, onStatus: status => statuses.push(status) });
  return { session, writes, statuses };
}
test('remote writes serialize snapshots and only acknowledge persisted content', async () => {
  const first = deferred(), writes = [];
  const { session, statuses } = fixture({ async create(input) {
    writes.push(structuredClone(input)); await first.promise; return { id: 'one', revision: 1, document: input.document };
  }, async update(id, input) { writes.push(structuredClone(input)); return { id, revision: 2, document: input.document }; } });
  try {
    session.store.dispatch('setField', { path: 'info.name', value: 'A' });
    assert.equal(statuses.at(-1), 'pending');
    const saving = session.flush(); assert.equal(statuses.at(-1), 'saving');
    session.store.dispatch('setField', { path: 'info.name', value: 'B' });
    assert.equal(writes.length, 1); first.resolve(); await saving;
    assert.equal(writes.length, 2); assert.equal(writes[0].document.character.info.name, 'A');
    assert.equal(writes[1].document.character.info.name, 'B'); assert.equal(statuses.at(-1), 'saved');
    assert.equal(session.hasPending(), false);
    session.store.dispatch('setField', { path: 'info.name', value: 'B' }); await session.flush(); assert.equal(writes.length, 2);
  } finally { session.dispose(); }
});
test('failed and uncertain writes retain their payload/key and local edits for retry', async () => {
  let fail = true; const writes = [];
  const { session } = fixture({ async create(input) {
    writes.push(structuredClone(input)); if (fail) throw Error('offline'); return { id: 'one', revision: 1, document: input.document };
  } });
  try {
    session.store.dispatch('setField', { path: 'info.name', value: 'Não perder' });
    await assert.rejects(session.flush(), /offline/); assert.equal(session.getStatus(), 'error'); assert.equal(session.hasPending(), true);
    fail = false; await session.flush(); assert.deepEqual(writes[0], writes[1]); assert.equal(session.getStatus(), 'saved');
  } finally { session.dispose(); }
});
test('version conflict preserves local document and saving a copy does not overwrite the original', async () => {
  const { session, writes } = fixture({ async update() { throw Object.assign(Error('conflict'), { code: 'conflict', status: 409 }); } });
  try {
    await session.create(emptyDocument()); session.store.dispatch('setField', { path: 'info.name', value: 'Conflitante' });
    await assert.rejects(session.flush()); assert.equal(session.getStatus(), 'conflict');
    assert.equal(session.store.getState().info.name, 'Conflitante');
    await session.saveCopy(); assert.equal(writes.at(-1).document.character.info.name, 'Conflitante');
    assert.equal(session.getStatus(), 'saved');
  } finally { session.dispose(); }
});
test('expiry stops saving and disposed responses cannot reactivate another session', async () => {
  const wait = deferred(); let disposals = 0;
  const { session } = fixture({ dispose() { disposals++; }, async create(input) { await wait.promise; return { id: 'old', revision: 1, document: input.document }; } });
  session.store.dispatch('setField', { path: 'info.name', value: 'Privada' });
  const saving = session.flush(); session.dispose(); wait.resolve(); await saving;
  assert.equal(session.getEntry(), null); assert.equal(disposals, 1); assert.equal(session.hasPending(), false);
  const expired = fixture({ async create() { throw Object.assign(Error('expired'), { status: 401 }); } });
  try {
    expired.session.store.dispatch('setField', { path: 'info.name', value: 'Recuperável' });
    await assert.rejects(expired.session.flush()); assert.equal(expired.session.getStatus(), 'expired');
    await assert.rejects(expired.session.flush()); assert.equal(expired.session.store.getState().info.name, 'Recuperável');
  } finally { expired.session.dispose(); }
});
test('a failed copy retries the same payload/key and retains edits made while offline', async () => {
  let fail = false; const inputs = [];
  const { session } = fixture({ async create(input) {
    inputs.push(structuredClone(input)); if (fail) throw Error('offline');
    return { id: `copy-${inputs.length}`, revision: 1, document: input.document };
  } });
  try {
    await session.create(emptyDocument());
    session.store.dispatch('setField', { path: 'info.name', value: 'Primeira edição' });
    fail = true; await assert.rejects(session.saveCopy(), /offline/);
    const before = inputs.at(-1);
    session.store.dispatch('setField', { path: 'info.name', value: 'Continuou editando' });
    fail = false; await session.retry(); assert.deepEqual(inputs.at(-1), before);
    assert.equal(session.store.getState().info.name, 'Continuou editando');
    await session.flush(); assert.equal(session.hasPending(), false);
  } finally { session.dispose(); }
});
test('an uncertain deletion retries the same mutation and preserves edits made during deletion', async () => {
  let fail = true; const deletions = [];
  const { session } = fixture({ async remove(id, input) {
    deletions.push({ id, ...input }); if (fail) throw Error('offline');
  } });
  try {
    await session.create(emptyDocument()); await assert.rejects(session.remove(), /offline/);
    assert.equal(session.hasPending(), true); assert.equal(session.getStatus(), 'error');
    session.store.dispatch('setField', { path: 'info.name', value: 'Durante exclusão' });
    fail = false; await session.retry(); assert.deepEqual(deletions[0], deletions[1]);
    assert.equal(session.getEntry(), null); assert.equal(session.store.getState().info.name, 'Durante exclusão');
    await session.flush(); assert.equal(session.getStatus(), 'saved');
  } finally { session.dispose(); }
});
test('edits during opening a remote sheet are never discarded', async () => {
  const wait = deferred();
  const { session } = fixture({ async get() { await wait.promise; return { id: 'two', revision: 1, document: emptyDocument() }; } });
  try {
    const opening = session.open('two'); await new Promise(resolve => setTimeout(resolve, 0));
    session.store.dispatch('setField', { path: 'info.name', value: 'Durante abertura' });
    wait.resolve(); await assert.rejects(opening, /editada/);
    assert.equal(session.store.getState().info.name, 'Durante abertura');
  } finally { session.dispose(); }
});
test('API pins account identity, aborts pending requests, and never stores tokens in browser storage', async () => {
  const requests = [];
  const api = createRemoteApi({ user: { id: 'A' }, csrf: 'csrf', fetcher: async (_url, options) => {
    requests.push(options); return new Response(JSON.stringify({ sheets: [] }));
  } });
  await api.list(); assert.equal(requests[0].headers['X-Account-ID'], 'A');
  assert.throws(() => api.renew({ user: { id: 'B' }, csrf: 'other' }), /conta/);
  api.dispose(); await assert.rejects(api.list(), /encerrada/);
});
test('local migration previews without writing and uses stable keys for duplicate imports', async () => {
  const backend = createMemoryBackend(), document = emptyDocument(), raw = JSON.stringify(document);
  backend.setItem(SHEET_KEY, raw); backend.setItem(LEGACY_KEY, raw);
  const first = await localCandidates(backend, migrateDocument), second = await localCandidates(backend, migrateDocument);
  assert.equal(first.length, 1); assert.equal(first[0].key, second[0].key); assert.equal(backend.getItem(SHEET_KEY), raw);
  assert.deepEqual(first[0].document, migrateDocument(document));
});
test('redirect recovery retains the uncertain write key and latest local changes', async () => {
  const before = fixture({ async create() { throw Object.assign(Error('expired'), { status: 401 }); } });
  let checkpoint;
  try {
    before.session.store.dispatch('setField', { path: 'info.name', value: 'Antes do login' });
    await assert.rejects(before.session.flush());
    before.session.store.dispatch('setField', { path: 'info.name', value: 'Edição mais recente' });
    checkpoint = await before.session.checkpoint();
  } finally { before.session.dispose(); }
  const after = fixture();
  try {
    after.session.restore(JSON.parse(JSON.stringify(checkpoint)));
    assert.equal(after.session.store.getState().info.name, 'Edição mais recente');
    await after.session.retry();
    assert.deepEqual(after.writes[0], checkpoint.pending.input);
    assert.equal(after.writes.at(-1).document.character.info.name, 'Edição mais recente');
    assert.equal(after.session.hasPending(), false);
  } finally { after.session.dispose(); }
});
