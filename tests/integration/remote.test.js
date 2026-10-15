import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { createPool, createPostgresAuth, createPostgresSheets, createPostgresLimiter } from '../../server/infrastructure/postgres.js';
import { hash, fingerprint, normalizeDocument } from '../../server/infrastructure/documents.js';
import { createSheets } from '../../server/application/sheets.js';
import { createHandler } from '../../server/http/handler.js';
import { emptyDocument } from '../../src/application/remoteSession.js';

// TEST_DATABASE_URL identifies the local database used for disposable test schemas.
const url = process.env.TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith('_test')) throw Error('TEST_DATABASE_URL deve apontar para banco local com nome terminado em _test.');
const db = createPool(url), schema = `hunter_test_${randomUUID().replaceAll('-', '')}`;
let auth, sheets, limiter, server, origin, userA, userB, sessionA, sessionB, isolated;
const csrf = 'test-csrf', name = () => randomBytes(32).toString('base64url');
before(async () => {
  await db.query(`CREATE SCHEMA ${schema}`);
  await db.end();
  const pg = await import('pg');
  isolated = new pg.default.Pool({ connectionString: url, max: 10, options: `-c search_path=${schema}` });
  assert.equal((await isolated.query('SELECT current_schema() AS schema')).rows[0].schema, schema);
  await isolated.query(await readFile(new URL('../../server/migrations/001_remote.sql', import.meta.url), 'utf8'));
  auth = createPostgresAuth(isolated); limiter = createPostgresLimiter(isolated);
  sheets = createSheets({ repository: createPostgresSheets(isolated), normalize: normalizeDocument, fingerprint, newId: randomUUID });
  sessionA = name(); sessionB = name();
  userA = await auth.createSession(hash(sessionA), csrf, { issuer: 'https://accounts.google.com', subject: 'a', name: 'A' }, 3600);
  userB = await auth.createSession(hash(sessionB), csrf, { issuer: 'https://accounts.google.com', subject: 'b', name: 'B' }, 3600);
  server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const config = { secure: false, publicUrl: origin, callbackUrl: `${origin}/auth/google/callback`, sessionSeconds: 3600,
    trustedProxies: [], bodyLimit: 1048576, limits: { authStart: 20, authCallback: 40, read: 300, save: 120, mutation: 30 } };
  const identity = {
    async start() { return { url: 'https://accounts.google.com/test', state: 'state', nonce: 'nonce', verifier: 'verifier' }; },
    async finish(url, flow) { assert.equal(flow.state, 'state'); assert.equal(url.origin, origin); return { issuer: 'https://accounts.google.com', subject: 'oidc-test', name: 'Google Test' }; }
  };
  server.on('request', createHandler({ config, sheets, auth, limiter, identity, health: () => isolated.query('SELECT 1'), logger: { error() {} } }));
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (isolated) { await isolated.query(`DROP SCHEMA ${schema} CASCADE`); await isolated.end(); }
});
async function request(path, { method = 'GET', body, token = sessionA, owner = userA?.id, headers = {} } = {}) {
  const response = await fetch(origin + path, { method, redirect: 'manual', headers: {
    Cookie: `hunter_session=${token}`, 'X-Account-ID': owner || '', Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...headers
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return response;
}
const creation = document => ({ document: document || emptyDocument(), key: randomUUID() });
test('anonymous/invalid/expired sessions cannot access private data', async () => {
  assert.equal((await request('/api/sheets', { token: '' })).status, 401);
  assert.equal((await request('/api/sheets', { token: name() })).status, 401);
  const expired = name(); await auth.createSession(hash(expired), csrf, { issuer: 'test', subject: 'expired', name: 'Expired' }, -1);
  assert.equal((await request('/api/sheets', { token: expired })).status, 401);
  const session = await (await request('/api/session')).json(); assert.equal(session.user.id, userA.id); assert.equal(session.token, undefined);
});
test('create/list/open/update/delete enforce owner for every manipulated ID', async () => {
  const input = creation(); input.document.character.info.name = '<img onerror=alert(1)>';
  const result = await request('/api/sheets', { method: 'POST', body: input }); assert.equal(result.status, 201);
  const sheet = await result.json(), path = `/api/sheets/${sheet.id}`;
  const b = { token: sessionB, owner: userB.id };
  assert.equal((await request(path, b)).status, 404);
  assert.equal((await request(path, { ...b, method: 'PUT', body: { document: input.document, revision: 1, mutation: randomUUID() } })).status, 404);
  assert.equal((await request(path, { ...b, method: 'DELETE', body: { revision: 1, mutation: randomUUID() } })).status, 404);
  assert.equal((await (await request('/api/sheets', b)).json()).sheets.length, 0);
  const changed = structuredClone(input.document); changed.character.info.name = 'Atualizada';
  const updated = await request(path, { method: 'PUT', body: { document: changed, revision: 1, mutation: randomUUID() } });
  assert.equal(updated.status, 200); assert.equal((await updated.json()).revision, 2);
  assert.equal((await (await request(path)).json()).document.character.info.name, 'Atualizada');
  assert.equal((await request(path, { method: 'DELETE', body: { revision: 2, mutation: randomUUID() } })).status, 200);
  assert.equal((await request(path)).status, 404);
  assert.equal((await isolated.query('SELECT document,deleted_at FROM hunter_sheets WHERE id=$1', [sheet.id])).rows[0].document.character.info.name, 'Atualizada');
});
test('atomic concurrent updates detect conflicts and retry of a lost response is idempotent', async () => {
  const sheet = await sheets.create(userA.id, creation());
  const a = structuredClone(sheet.document), b = structuredClone(sheet.document); a.character.info.name = 'One'; b.character.info.name = 'Two';
  const inputs = [{ document: a, revision: 1, mutation: randomUUID() }, { document: b, revision: 1, mutation: randomUUID() }];
  const results = await Promise.allSettled(inputs.map(input => sheets.update(userA.id, sheet.id, input)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'conflict');
  const winner = results.findIndex(result => result.status === 'fulfilled');
  const replay = await sheets.update(userA.id, sheet.id, inputs[winner]); assert.equal(replay.revision, 2);
  const noChange = await sheets.update(userA.id, sheet.id, { document: replay.document, revision: 2, mutation: randomUUID() }); assert.equal(noChange.revision, 2);
  await sheets.update(userA.id, sheet.id, { document: { ...replay.document, character: { ...replay.document.character, info: { ...replay.document.character.info, name: 'Third' } } }, revision: 2, mutation: randomUUID() });
  await assert.rejects(sheets.update(userA.id, sheet.id, inputs[winner]), { code: 'conflict' });
});
test('creation/import retry never duplicates and rejects a reused key with different content', async () => {
  const input = creation(); input.document.character.extension = { custom: ['preserved'] };
  const results = await Promise.all([sheets.create(userA.id, input), sheets.create(userA.id, input)]);
  assert.equal(results[0].id, results[1].id); assert.deepEqual(results[0].document.character.extension, { custom: ['preserved'] });
  const wrong = structuredClone(input); wrong.document.character.info.name = 'different';
  await assert.rejects(sheets.create(userA.id, wrong), { code: 'conflict' });
  const legacy = { document: { info: { name: 'Antiga' }, attributes: { for: 12 } }, key: randomUUID() };
  assert.equal((await sheets.create(userA.id, legacy)).id, (await sheets.create(userA.id, legacy)).id);
});
test('CSRF, account change, JSON size and schema validation reject unsafe writes', async () => {
  const body = creation();
  assert.equal((await request('/api/sheets', { method: 'POST', body, headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request('/api/sheets', { method: 'POST', body, headers: { 'X-CSRF-Token': 'wrong' } })).status, 403);
  assert.equal((await request('/api/sheets', { method: 'POST', body, owner: userB.id })).status, 409);
  assert.equal((await request('/api/sheets', { method: 'POST', body: { key: randomUUID(), document: { formatVersion: 99 } } })).status, 400);
  assert.equal((await request('/api/sheets', { method: 'POST', body: { ...body, huge: 'a'.repeat(1050000) } })).status, 413);
});
test('auth flow is single use, rotates session, issues HttpOnly cookie and logout revokes it', async () => {
  const start = await request('/auth/google'); assert.equal(start.status, 303);
  const flow = start.headers.get('set-cookie').match(/hunter_flow=([^;]+)/)[1];
  assert.match(start.headers.get('set-cookie'), /HttpOnly/);
  const callback = await request('/auth/google/callback?code=fake&state=state', { headers: { Cookie: `hunter_flow=${flow}` } });
  assert.equal(callback.status, 303); assert.equal(callback.headers.get('location'), '/?auth=complete');
  const token = callback.headers.get('set-cookie').match(/hunter_session=([^;]+)/)[1];
  assert.match(callback.headers.get('set-cookie'), /HttpOnly/); assert.match(callback.headers.get('set-cookie'), /SameSite=Lax/);
  const repeated = await request('/auth/google/callback?code=fake&state=state', { headers: { Cookie: `hunter_flow=${flow}` } });
  assert.equal(repeated.status, 303); assert.equal(repeated.headers.get('location'), '/?auth=error');
  const current = await (await request('/api/session', { token })).json();
  assert.equal((await request('/api/logout', { method: 'POST', body: {}, token, owner: current.user.id, headers: { 'X-CSRF-Token': current.csrf } })).status, 200);
  assert.equal((await request('/api/sheets', { token, owner: current.user.id })).status, 401);
});
test('distributed rate limiting shares atomic budgets across independent adapters', async () => {
  const other = createPostgresLimiter(isolated), key = randomUUID();
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? limiter : other).consume(key, 7, 60)));
  assert.equal(results.filter(result => result.allowed).length, 7); assert.ok(results.every(result => result.retryAfter >= 1));
  const readKey = hash(`read:${userB.id}`); await isolated.query("INSERT INTO hunter_rate_limits VALUES ($1,300,now()+interval '1 minute') ON CONFLICT (key) DO UPDATE SET count=300, expires_at=EXCLUDED.expires_at", [readKey]);
  const limited = await request('/api/sheets', { token: sessionB, owner: userB.id, headers: { 'X-Forwarded-For': '1.2.3.4' } });
  assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
});
test('storage failure is not success; static routes never expose server/configuration files', async () => {
  for (const path of ['/server/config.js', '/scripts/migrate.js', '/package.json', '/.env', '/node_modules/pg/package.json']) assert.equal((await request(path)).status, 404);
  assert.equal((await request('/healthz')).status, 200);
  const failing = createSheets({ repository: { create() { throw Error('storage offline'); } }, normalize: normalizeDocument, fingerprint, newId: randomUUID });
  await assert.rejects(failing.create(userA.id, creation()), /storage offline/);
  const original = sheets.create;
  try {
    sheets.create = failing.create;
    assert.equal((await request('/api/sheets', { method: 'POST', body: creation() })).status, 503);
  } finally { sheets.create = original; }
});
