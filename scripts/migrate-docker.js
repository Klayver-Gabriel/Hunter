import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { configureRuntimeRole } from '../server/infrastructure/runtimeRole.js';
import { createPostgresSystems } from '../server/infrastructure/postgres.js';
import { createDefaultSystems } from '../src/domain/gameSystems.js';

if (!process.env.DATABASE_URL || !process.env.RUNTIME_DATABASE_PASSWORD) throw Error('Configure DATABASE_URL e RUNTIME_DATABASE_PASSWORD.');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, statement_timeout: 30000 });
try {
  await db.connect();
  await db.query('SELECT pg_advisory_lock(184923117)');
  for (const migration of ['001_remote.sql', '002_systems.sql']) {
    await db.query(await readFile(new URL(`../server/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  const systems = createPostgresSystems(db), users = await db.query('SELECT id FROM hunter_users');
  for (const user of users.rows) await systems.seed(user.id, createDefaultSystems());
  await configureRuntimeRole(db, process.env.RUNTIME_DATABASE_PASSWORD);
  console.log('Migração concluída. Usuário de execução configurado.');
} catch (error) {
  console.error('Falha na migração Docker.', { code: error.code || 'migration_failed' });
  process.exitCode = 1;
} finally { await db.end(); }
