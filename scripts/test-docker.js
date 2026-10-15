import { execFile } from 'node:child_process';
import { promisify, parseEnv } from 'node:util';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { prepareDockerEnv } from './lib/dockerEnv.js';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const folder = await mkdtemp(path.join(tmpdir(), 'hunter-docker-'));
const project = `hunter-test-${randomBytes(6).toString('hex')}`;
const envFile = path.join(folder, 'test.env'), override = path.join(folder, 'compose.test.json');
const args = ['compose', '--project-name', project, '--env-file', envFile, '-f', path.join(root, 'compose.yaml'), '-f', override];
let composeEnv;
const compose = async (...command) => (await exec('docker', [...args, ...command], { cwd: root, env: composeEnv, maxBuffer: 4 * 1024 * 1024 })).stdout;
const insideApp = async code => compose('exec', '-T', 'app', 'node', '--input-type=module', '-e', code);

try {
  const template = await readFile(path.join(root, '.env.example'), 'utf8');
  const content = prepareDockerEnv('', template, () => randomBytes(32).toString('hex'))
    .replace(/^GOOGLE_CLIENT_ID=.*$/m, 'GOOGLE_CLIENT_ID=docker-test-client')
    .replace(/^GOOGLE_CLIENT_SECRET=.*$/m, 'GOOGLE_CLIENT_SECRET=docker-test-secret')
    .replace(/^APP_PORT=.*$/m, 'APP_PORT=0');
  composeEnv = { ...process.env, ...parseEnv(content), HUNTER_IMAGE: `${project}:local` };
  await writeFile(envFile, content, { mode: 0o600 });
  await writeFile(override, JSON.stringify({ services: { migrate: { image: `${project}:local` }, app: {
    image: `${project}:local`,
    healthcheck: { interval: '1s', timeout: '3s', retries: 30 },
    command: ['node', '--import', '/test/mock-google.js', 'server/main.js'],
    volumes: [{ type: 'bind', source: path.join(root, 'tests/docker/mock-google.js'), target: '/test/mock-google.js', read_only: true }]
  } } }));
  await compose('config', '--quiet');
  const remote = JSON.parse((await exec('docker', ['compose', '--env-file', envFile, '-f', path.join(root, 'compose.remote.yaml'), 'config', '--format', 'json'], {
    cwd: root, env: { ...composeEnv, DATABASE_URL: 'postgresql://runtime@external.example.invalid/hunter' }
  })).stdout);
  assert.equal(remote.services.app.environment.DATABASE_URL, 'postgresql://runtime@external.example.invalid/hunter');
  assert.equal(remote.services.app.environment.POSTGRES_ADMIN_PASSWORD, undefined);
  console.log('Construindo e iniciando o projeto Docker de teste.');
  await exec('docker', ['build', '--tag', `${project}:local`, '.'], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
  await compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '90');
  const baseUrl = () => compose('port', 'app', '4173').then(address => `http://${address.trim()}`);
  let origin = await baseUrl();
  assert.equal((await fetch(origin + '/healthz')).status, 200);
  assert.equal((await fetch(origin + '/api/sheets')).status, 401);
  const dbId = (await compose('ps', '-q', 'db')).trim();
  const bindings = JSON.parse((await exec('docker', ['inspect', '--format', '{{json .HostConfig.PortBindings}}', dbId])).stdout);
  assert.ok(!bindings || !Object.keys(bindings).length);

  const credentials = JSON.parse(await insideApp(`
    import assert from 'node:assert/strict';
    import { randomBytes } from 'node:crypto';
    import { createPool, createPostgresAuth } from './server/infrastructure/postgres.js';
    import { hash } from './server/infrastructure/documents.js';
    const db = createPool(process.env.DATABASE_URL);
    try {
      const row = (await db.query("SELECT current_user, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user")).rows[0];
      assert.equal(row.current_user, 'hunter_runtime');
      assert.equal(row.rolsuper, false); assert.equal(row.rolcreatedb, false); assert.equal(row.rolcreaterole, false);
      assert.equal((await db.query("SELECT has_table_privilege(current_user,'hunter_sheets','DELETE') AS allowed")).rows[0].allowed, false);
      assert.equal((await db.query("SELECT has_schema_privilege(current_user,'public','CREATE') AS allowed")).rows[0].allowed, false);
      assert.equal(process.env.POSTGRES_ADMIN_PASSWORD, undefined);
      const token = randomBytes(32).toString('base64url'), csrf = randomBytes(32).toString('base64url');
      const user = await createPostgresAuth(db).createSession(hash(token), csrf, { issuer: 'docker-test', subject: 'isolated-test', name: 'Docker test' }, 3600);
      console.log(JSON.stringify({ token, csrf, user }));
    } finally { await db.end(); }
  `));
  const document = JSON.parse(await insideApp("import { emptyDocument } from './src/application/remoteSession.js'; console.log(JSON.stringify(emptyDocument()));"));
  document.character.info.name = 'Persistência Docker';
  const headers = { Cookie: `hunter_session=${credentials.token}`, 'X-Account-ID': credentials.user.id, 'X-CSRF-Token': credentials.csrf,
    Origin: 'http://127.0.0.1:4173', 'Content-Type': 'application/json' };
  const input = { document, key: randomUUID() };
  const created = await fetch(origin + '/api/sheets', { method: 'POST', headers, body: JSON.stringify(input) });
  assert.equal(created.status, 201); const sheet = await created.json();
  const replay = await fetch(origin + '/api/sheets', { method: 'POST', headers, body: JSON.stringify(input) });
  assert.equal((await replay.json()).id, sheet.id);
  console.log('Healthcheck, migração, permissões e gravação aprovados. Recriando os containers.');
  await compose('down');
  await compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '90');
  origin = await baseUrl();
  const reopened = await fetch(`${origin}/api/sheets/${sheet.id}`, { headers });
  assert.equal(reopened.status, 200); assert.equal((await reopened.json()).document.character.info.name, 'Persistência Docker');
  await compose('exec', '-T', 'app', 'node', 'scripts/cleanup.js');
  console.log('Persistência após recriação, migração repetida e limpeza aprovadas.');
} catch (error) {
  console.error('Falha no teste Docker:', error.message);
  try { console.error(await compose('logs', '--tail', '30', 'db', 'app', 'migrate')); } catch { /* Project may not have started. */ }
  process.exitCode = 1;
} finally {
  let cleaned = false;
  try { await compose('down', '--volumes', '--remove-orphans'); cleaned = true; }
  catch { console.error(`Limpeza pendente do projeto de teste ${project}. Configuração em ${folder}.`); process.exitCode = 1; }
  if (cleaned) {
    await exec('docker', ['image', 'rm', `${project}:local`]).catch(() => {});
    await rm(folder, { recursive: true, force: true });
  }
}
