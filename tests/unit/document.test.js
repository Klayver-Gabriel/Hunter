import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefault } from '../../src/domain/character.js';
import { createAppearance, validateAppearance } from '../../src/customization/appearance.js';
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
test('importação inválida e save de aparência falho preservam estado ativo', () => {
  const backend = createMemoryBackend(), repository = createSheetRepository(() => backend);
  const session = createSession({ repository, migrate: migrateDocument }); const before = session.store.getDocument();
  assert.throws(() => session.replace({ formatVersion: 999 }));
  repository.save = () => ({ ok: false, error: Error('quota') });
  const appearance = createAppearance(); appearance.components['resource:hp'] = { label: 'Vida' };
  assert.equal(session.saveAppearance(appearance).ok, false);
  assert.equal(session.store.getAppearance(), before.sheetAppearance);
});
