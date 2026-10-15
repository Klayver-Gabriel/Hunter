import { createPool } from '../server/infrastructure/postgres.js';
if (!process.env.DATABASE_URL) throw Error('Configure DATABASE_URL no ambiente privado.');
const db = createPool(process.env.DATABASE_URL);
try {
  // Remove expired sessions, OAuth flows and rate-limit counters.
  for (const table of ['hunter_sessions', 'hunter_auth_flows', 'hunter_rate_limits']) await db.query(`DELETE FROM ${table} WHERE expires_at < now()`);
  console.log('Registros operacionais expirados removidos.');
} finally { await db.end(); }
