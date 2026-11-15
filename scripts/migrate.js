import { readFile } from 'node:fs/promises';
import { createPool, createPostgresSystems } from '../server/infrastructure/postgres.js';
import { createDefaultSystems } from '../src/domain/gameSystems.js';
if (!process.env.DATABASE_URL) throw Error('Configure DATABASE_URL no ambiente privado.');
const db = createPool(process.env.DATABASE_URL);
try {
  for (const migration of ['001_remote.sql', '002_systems.sql']) {
    await db.query(await readFile(new URL(`../server/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  const systems = createPostgresSystems(db), users = await db.query('SELECT id FROM hunter_users');
  for (const user of users.rows) await systems.seed(user.id, createDefaultSystems());
  console.log('Migração aditiva concluída.');
} finally { await db.end(); }
