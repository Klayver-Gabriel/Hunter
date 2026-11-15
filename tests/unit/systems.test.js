import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSystems } from '../../server/application/systems.js';
import { createDefaultSystems } from '../../src/domain/gameSystems.js';

function repository() {
  const records = new Map(), seeded = [];
  return {
    records, seeded,
    async seed(owner, profiles) { seeded.push({ owner, profiles }); },
    async list(owner) { return [...records.values()].filter(profile => profile.owner === owner); },
    async get(owner, id) { return records.get(id)?.owner === owner ? records.get(id) : null; },
    async create(owner, profile) { const value = { ...profile, owner }; records.set(profile.id, value); return value; },
    async update(owner, id, revision, profile) {
      const current = records.get(id);
      if (!current || current.owner !== owner || current.revision !== revision) return null;
      const value = { ...profile, owner }; records.set(id, value); return value;
    },
    async remove(owner, id, revision) {
      const current = records.get(id);
      if (current?.owner !== owner || current.revision !== revision) return false;
      return current.used ? 'used' : (records.delete(id), true);
    }
  };
}

test('system library seeds defaults per account and scopes mutations to that account', async () => {
  const store = repository(), systems = createSystems({ repository: store, newId: () => 'created' });
  const listed = await systems.list('account-a');
  assert.equal(store.seeded[0].owner, 'account-a');
  assert.deepEqual(store.seeded[0].profiles.map(profile => profile.id), ['dnd5e', 'tormenta20']);
  assert.equal(listed.length, 0);

  const created = await systems.create('account-a', { title: 'Mesa Nova', config: createDefaultSystems()[0].config });
  assert.equal(created.id, 'sys_created');
  assert.equal(created.revision, 1);
  assert.equal(await store.get('account-b', created.id), null);
  const updated = await systems.update('account-a', created.id, { title: 'Mesa Atualizada', revision: 1, config: created.config });
  assert.equal(updated.revision, 2);
  await assert.rejects(() => systems.update('account-a', created.id, { title: 'Conflito', revision: 1, config: created.config }), error => error.code === 'conflict');
});

test('system library rejects invalid profiles and protects defaults and linked systems', async () => {
  const store = repository(), systems = createSystems({ repository: store, newId: () => 'custom' });
  await assert.rejects(() => systems.create('account-a', { title: '', config: {} }), error => error.status === 400 && error.code === 'invalid_system');
  await assert.rejects(() => systems.remove('account-a', 'dnd5e', { revision: 1 }), error => error.code === 'system_default');
  const created = await systems.create('account-a', { title: 'Minha mesa', config: createDefaultSystems()[0].config });
  store.records.get(created.id).used = true;
  await assert.rejects(() => systems.remove('account-a', created.id, { revision: 1 }), error => error.code === 'system_in_use');
  store.records.get(created.id).used = false;
  await systems.remove('account-a', created.id, { revision: 1 });
  assert.equal(await store.get('account-a', created.id), null);
});
