import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAutosave } from '../../src/application/autosave.js';
import { createSheetRepository, createMemoryBackend, SHEET_KEY, BACKUP_KEY } from '../../src/infrastructure/sheetRepository.js';
test('repositório distingue vazio, corrupção e acesso negado', () => {
  const backend = createMemoryBackend(), repository = createSheetRepository(() => backend);
  assert.equal(repository.load().empty, true);
  backend.setItem(SHEET_KEY, '{broken');
  assert.equal(repository.load().ok, false);
  assert.equal(repository.load().raw, '{broken');
  backend.getItem = () => { throw Error('denied'); };
  assert.equal(repository.load().ok, false);
});
test('backup preserva texto exato e comunica falha de quota', () => {
  const backend = createMemoryBackend(), repository = createSheetRepository(() => backend);
  assert.equal(repository.backup(' original ').ok, true);
  assert.equal(backend.getItem(BACKUP_KEY), ' original ');
  backend.setItem = () => { throw Error('quota'); };
  assert.equal(repository.backup('novo').ok, false);
  assert.equal(repository.save({}).ok, false);
});
test('autosave reporta falha, captura snapshot e permite cancelar gravação antiga', async () => {
  const statuses = [], saved = [];
  const autosave = createAutosave(value => { saved.push(value); return false; });
  const value = { name: 'original' };
  autosave.schedule(value, status => statuses.push(status), 5); value.name = 'alterado';
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(statuses, ['saving', 'error']);
  assert.equal(saved[0].name, 'original');
  autosave.schedule({}, () => {}, 5); autosave.cancel();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(saved.length, 1);
});
