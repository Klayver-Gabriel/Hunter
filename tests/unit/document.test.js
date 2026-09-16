import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefault } from '../../src/domain/character.js';
import { createAppearance, validateAppearance } from '../../src/domain/sheetAppearance.js';
import { migrateDocument } from '../../src/infrastructure/migrations/document.js';
import { createSheetRepository, createMemoryBackend, SHEET_KEY, LEGACY_KEY, BACKUP_KEY } from '../../src/infrastructure/sheetRepository.js';
import { createSession } from '../../src/application/session.js';
test('ficha legada migra com aparência padrão e a chave original permanece intacta', () => {
  const backend = createMemoryBackend(), raw = JSON.stringify(createDefault()); backend.setItem(LEGACY_KEY, raw);
  const session = createSession({ repository: createSheetRepository(() => backend), migrate: migrateDocument });
  assert.equal(session.ok, true); assert.equal(backend.getItem(LEGACY_KEY), raw);
  assert.equal(backend.getItem(BACKUP_KEY), raw);
  assert.equal(JSON.parse(backend.getItem(SHEET_KEY)).formatVersion, 1);
});
test('rótulos e layouts não alteram identidade nem cálculo e sobrevivem ao JSON', () => {
  const doc = migrateDocument(createDefault());
  doc.sheetAppearance.components['resource:hp'] = { label: 'Vitalidade', colors: { dark: { accent: '#112233' } } };
  const restored = migrateDocument(JSON.parse(JSON.stringify(doc)));
  assert.equal(restored.character.resources[0].id, 'hp');
  assert.equal(restored.sheetAppearance.components['resource:hp'].label, 'Vitalidade');
  assert.equal(restored.userPreferences, undefined);
});
test('aparência rejeita CSS, ciclos e versões futuras', () => {
  const appearance = createAppearance();
  appearance.components['resource:hp'] = { colors: { dark: { text: 'url(evil)' } } };
  assert.throws(() => validateAppearance(appearance));
  appearance.components = {};
  appearance.layouts.desktop.a = { parent: 'b', x: 0, y: 0, w: 100, h: 100 };
  appearance.layouts.desktop.b = { parent: 'a', x: 0, y: 0, w: 100, h: 100 };
  assert.throws(() => validateAppearance(appearance));
  assert.throws(() => migrateDocument({ formatVersion: 99 }));
});
test('falhas de migração ou backup nunca substituem o documento', () => {
  for (const raw of ['{broken', JSON.stringify({ formatVersion: 99 }), JSON.stringify(createDefault())]) {
    const backend = createMemoryBackend(); backend.setItem(SHEET_KEY, raw);
    const realWrite = backend.setItem; backend.setItem = (key, value) => { if (key === BACKUP_KEY) throw Error('quota'); realWrite(key, value); };
    const session = createSession({ repository: createSheetRepository(() => backend), migrate: migrateDocument });
    assert.equal(session.ok, false); assert.equal(backend.getItem(SHEET_KEY), raw);
  }
});
test('importação inválida ou gravação falha preserva o documento ativo', () => {
  const backend = createMemoryBackend(), repository = createSheetRepository(() => backend);
  const session = createSession({ repository, migrate: migrateDocument }); const before = session.store.getDocument();
  assert.throws(() => session.replace({ formatVersion: 999 }));
  repository.save = () => ({ ok: false, error: Error('quota') });
  const candidate = migrateDocument(createDefault()); candidate.character.info.name = 'Outra ficha';
  assert.throws(() => session.replace(candidate), /quota/);
  assert.deepEqual(session.store.getDocument(), before);
});
test('backup ocorre antes da migração e não há migração se o backup falhar', () => {
  const backend = createMemoryBackend(); backend.setItem(SHEET_KEY, JSON.stringify(createDefault()));
  const repository = createSheetRepository(() => backend); const order = [];
  const backup = repository.backup; repository.backup = raw => { order.push('backup'); return backup(raw); };
  const migrate = raw => { order.push('migrate'); return migrateDocument(raw); };
  assert.equal(createSession({ repository, migrate }).ok, true);
  assert.deepEqual(order, ['backup', 'migrate']);
  backend.setItem(SHEET_KEY, JSON.stringify(createDefault()));
  order.length = 0; repository.backup = () => ({ ok: false, error: Error('quota') });
  assert.equal(createSession({ repository, migrate }).ok, false); assert.deepEqual(order, []);
});
test('troca bem-sucedida cancela autosave da ficha anterior', async () => {
  const backend = createMemoryBackend();
  const session = createSession({ repository: createSheetRepository(() => backend), migrate: migrateDocument });
  session.store.dispatch('setField', { path: 'info.name', value: 'antiga' });
  const next = createDefault(); next.info.name = 'nova'; session.replace(next);
  await new Promise(resolve => setTimeout(resolve, 550));
  assert.equal(JSON.parse(backend.getItem(SHEET_KEY)).character.info.name, 'nova');
});
test('reabrir documento atual não substitui o backup anterior', () => {
  const backend = createMemoryBackend(); backend.setItem(SHEET_KEY, JSON.stringify(migrateDocument(createDefault())));
  backend.setItem(BACKUP_KEY, 'original anterior');
  assert.equal(createSession({ repository: createSheetRepository(() => backend), migrate: migrateDocument }).ok, true);
  assert.equal(backend.getItem(BACKUP_KEY), 'original anterior');
});
test('aba sem alterações pendentes não grava ao perder visibilidade', () => {
  const backend = createMemoryBackend(), repository = createSheetRepository(() => backend);
  const session = createSession({ repository, migrate: migrateDocument });
  backend.setItem(SHEET_KEY, 'alteração externa'); session.flush();
  assert.equal(backend.getItem(SHEET_KEY), 'alteração externa');
  session.store.dispatch('setField', { path: 'info.name', value: 'edição local' });
  session.flush();
  assert.equal(JSON.parse(backend.getItem(SHEET_KEY)).character.info.name, 'edição local');
});

test('atualizações de personagem preservam aparência legada sem expor operações do editor', () => {
  const backend = createMemoryBackend(), repository = createSheetRepository(() => backend);
  const document = migrateDocument(createDefault());
  document.sheetAppearance.components['resource:hp'] = { label: 'Vitalidade' };
  document.sheetAppearance.layouts.mobile['resource:hp'] = { parent: 'root', x: 0, y: 10, w: 100, h: 80 };
  backend.setItem(SHEET_KEY, JSON.stringify(document));
  const session = createSession({ repository, migrate: migrateDocument });
  session.store.dispatch('setAttribute', { key: 'con', value: 14 }); session.flush();
  assert.deepEqual(JSON.parse(backend.getItem(SHEET_KEY)).sheetAppearance, document.sheetAppearance);
  assert.equal(session.saveAppearance, undefined);
  assert.equal(session.store.setAppearance, undefined);
});
