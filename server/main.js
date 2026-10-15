import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readConfig } from './config.js';
import { createPool, createPostgresAuth, createPostgresSheets, createPostgresLimiter } from './infrastructure/postgres.js';
import { createGoogleIdentity } from './infrastructure/google.js';
import { normalizeDocument, fingerprint } from './infrastructure/documents.js';
import { createSheets } from './application/sheets.js';
import { createHandler } from './http/handler.js';

const config = readConfig(), db = createPool(config.databaseUrl);
await db.query('SELECT 1');
const identity = await createGoogleIdentity(config);
const handler = createHandler({ config, identity, auth: createPostgresAuth(db), limiter: createPostgresLimiter(db),
  sheets: createSheets({ repository: createPostgresSheets(db), normalize: normalizeDocument, fingerprint, newId: randomUUID }), health: () => db.query('SELECT 1') });
const server = http.createServer(handler);
server.requestTimeout = 15000; server.headersTimeout = 10000; server.timeout = 20000; server.keepAliveTimeout = 5000;
server.listen(config.port, config.host, () => console.log(`Hunter pronto em ${config.publicUrl}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => db.end().then(() => process.exit(0))));
