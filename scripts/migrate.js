import { readFile } from 'node:fs/promises';
import { createPool } from '../server/infrastructure/postgres.js';
if (!process.env.DATABASE_URL) throw Error('Configure DATABASE_URL no ambiente privado.');
const db = createPool(process.env.DATABASE_URL);
try {
  await db.query(await readFile(new URL('../server/migrations/001_remote.sql', import.meta.url), 'utf8'));
  console.log('Migração aditiva concluída.');
} finally { await db.end(); }
