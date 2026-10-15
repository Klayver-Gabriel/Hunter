import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from 'node:util';
import { prepareDockerEnv } from '../../scripts/lib/dockerEnv.js';

const template = 'GOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nPOSTGRES_ADMIN_PASSWORD=\nPOSTGRES_RUNTIME_PASSWORD=\nDATABASE_URL=\n';
test('Docker setup generates independent passwords and retains configured credentials', () => {
  let count = 0;
  const original = '# Conta configurada\nGOOGLE_CLIENT_ID=existing-client\nGOOGLE_CLIENT_SECRET="existing-secret"\nDATABASE_URL=postgresql://external/db\nCUSTOM=value\n';
  const content = prepareDockerEnv(original, template, () => `${++count}`.repeat(64));
  const env = parseEnv(content);
  assert.equal(env.GOOGLE_CLIENT_ID, 'existing-client'); assert.equal(env.GOOGLE_CLIENT_SECRET, 'existing-secret');
  assert.equal(env.DATABASE_URL, 'postgresql://external/db'); assert.equal(env.CUSTOM, 'value');
  assert.match(content, /# Conta configurada/); assert.equal(count, 2);
  assert.notEqual(env.POSTGRES_ADMIN_PASSWORD, env.POSTGRES_RUNTIME_PASSWORD);
  assert.equal(prepareDockerEnv(content, template, () => { throw Error('unexpected rotation'); }), content);
});
test('empty environment receives the template and generated database passwords', () => {
  const content = prepareDockerEnv('', template, () => 'x'.repeat(64)), env = parseEnv(content);
  assert.equal(env.GOOGLE_CLIENT_ID, ''); assert.equal(env.GOOGLE_CLIENT_SECRET, '');
  assert.equal(env.POSTGRES_ADMIN_PASSWORD.length, 64); assert.equal(env.POSTGRES_RUNTIME_PASSWORD.length, 64);
});
test('configured database passwords must be URL safe and sufficiently long', () => {
  assert.throws(() => prepareDockerEnv('POSTGRES_ADMIN_PASSWORD=short\n', template, () => 'x'.repeat(64)), /32 caracteres/);
});
test('blank passwords with indentation or export syntax receive generated values', () => {
  const original = '  POSTGRES_ADMIN_PASSWORD = ""\nexport POSTGRES_RUNTIME_PASSWORD=\n';
  const env = parseEnv(prepareDockerEnv(original, template, () => 'x'.repeat(64)));
  assert.equal(env.POSTGRES_ADMIN_PASSWORD.length, 64); assert.equal(env.POSTGRES_RUNTIME_PASSWORD.length, 64);
});
