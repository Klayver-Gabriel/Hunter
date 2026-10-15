import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { prepareDockerEnv } from './lib/dockerEnv.js';

const envFile = process.argv[2] || '.env';
const template = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
let current = '';
try { current = await readFile(envFile, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const content = prepareDockerEnv(current, template, () => randomBytes(32).toString('hex'));
const temporary = `${envFile}.${randomBytes(8).toString('hex')}.tmp`;
try {
  await writeFile(temporary, content, { mode: 0o600, flag: 'wx' });
  await rename(temporary, envFile);
} finally { await unlink(temporary).catch(() => {}); }
const values = parseEnv(content);
const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].filter(key => !values[key]);
console.log(`Configuração Docker gravada em ${envFile}.`);
if (missing.length) console.log(`Preencha no arquivo: ${missing.join(', ')}.`);
console.log('Inicie os serviços com npm run docker:up.');
