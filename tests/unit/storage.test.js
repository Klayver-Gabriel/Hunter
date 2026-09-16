import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../../src/infrastructure/storage.js';
function setup() {
  const values = new Map();
  const localStorage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
  return { storage: createStorage(() => localStorage), localStorage, values };
}
test('distingue vazio, corrupção e acesso negado sem sobrescrever', () => {
  const { storage: s, localStorage: ls, values } = setup();
  assert.equal(s.load().empty, true);
  values.set(s.KEY, '{corrompido');
  assert.equal(s.load().ok, false);
  assert.equal(s.load().raw, '{corrompido');
  ls.getItem = () => { throw Error('denied'); };
  assert.equal(s.load().ok, false);
  assert.equal(values.get(s.KEY), '{corrompido');
});
test('backup preserva o texto exato e comunica falha', () => {
  const { storage: s, localStorage: ls, values } = setup();
  assert.equal(s.backup(' original '), true);
  assert.equal(values.get(s.BACKUP_KEY), ' original ');
  ls.setItem = () => { throw Error('quota'); };
  assert.equal(s.backup('novo'), false);
  assert.equal(s.save({ name: 'novo' }), false);
});
test('autosave falho nunca informa salvo e pode ser cancelado', async () => {
  const { storage: s, localStorage: ls, values } = setup();
  ls.setItem = () => { throw Error('quota'); };
  const statuses = [];
  s.autosave({}, status => statuses.push(status), 5);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.deepEqual(statuses, ['saving', 'error']);
  s.autosave({}, status => statuses.push(status), 5); s.cancelAutosave();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(statuses.at(-1), 'saving');
  assert.equal(values.size, 0);
});
