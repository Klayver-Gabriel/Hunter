import pg from 'pg';
import { randomUUID } from 'node:crypto';

export function createPool(connectionString) {
  // Production connections use sslmode=verify-full and the provider's CA.
  return new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 10000, query_timeout: 12000 });
}
const metadata = 'id, title, schema_version AS "schemaVersion", revision, created_at AS "createdAt", updated_at AS "updatedAt"';
const full = `${metadata}, document, fingerprint`;
export function createPostgresSheets(db) {
  return {
    async list(owner) { return (await db.query(`SELECT ${metadata} FROM hunter_sheets WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1000`, [owner])).rows; },
    async get(owner, id) { return (await db.query(`SELECT ${full} FROM hunter_sheets WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL`, [owner, id])).rows[0]; },
    async create(owner, value) {
      const result = await db.query(`INSERT INTO hunter_sheets (id,owner_id,title,schema_version,document,fingerprint,creation_key,creation_fingerprint)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (owner_id,creation_key) DO UPDATE SET creation_key=EXCLUDED.creation_key
        WHERE hunter_sheets.creation_fingerprint=EXCLUDED.creation_fingerprint AND hunter_sheets.deleted_at IS NULL RETURNING ${full}`,
      [value.id, owner, value.title, value.schemaVersion, value.document, value.fingerprint, value.key, value.creationFingerprint]);
      return result.rows[0];
    },
    async update(owner, id, value) {
      const result = await db.query(`UPDATE hunter_sheets SET title=$5, schema_version=$6, document=$7, fingerprint=$8,
        revision=CASE WHEN fingerprint=$8 THEN revision ELSE revision+1 END,
        updated_at=CASE WHEN fingerprint=$8 THEN updated_at ELSE now() END, last_mutation=$4, last_base_revision=$3
        WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL AND
        ((revision=$3 AND (last_mutation IS DISTINCT FROM $4 OR fingerprint=$8)) OR
         (last_mutation=$4 AND last_base_revision=$3 AND fingerprint=$8)) RETURNING ${full}`,
      [owner, id, value.revision, value.mutation, value.title, value.schemaVersion, value.document, value.fingerprint]);
      return result.rows[0];
    },
    async remove(owner, id, revision, mutation) {
      const result = await db.query(`UPDATE hunter_sheets SET deleted_at=COALESCE(deleted_at,now()),
        updated_at=CASE WHEN deleted_at IS NULL THEN now() ELSE updated_at END,
        revision=CASE WHEN deleted_at IS NULL THEN revision+1 ELSE revision END, last_mutation=$4, last_base_revision=$3
        WHERE owner_id=$1 AND id=$2 AND ((revision=$3 AND deleted_at IS NULL) OR
        (deleted_at IS NOT NULL AND last_mutation=$4 AND last_base_revision=$3)) RETURNING id`, [owner, id, revision, mutation]);
      return result.rowCount === 1;
    }
  };
}
export function createPostgresAuth(db) {
  return {
    async putFlow(token, data) { await db.query("INSERT INTO hunter_auth_flows VALUES ($1,$2,now()+interval '10 minutes')", [token, data]); },
    async takeFlow(token) { return (await db.query('DELETE FROM hunter_auth_flows WHERE token_hash=$1 RETURNING data, expires_at > now() AS valid', [token])).rows.find(row => row.valid)?.data; },
    async createSession(token, csrf, identity, ttl) {
      // Provider identity is keyed by issuer and subject.
      const user = (await db.query(`INSERT INTO hunter_users (id,issuer,subject,name) VALUES ($1,$2,$3,$4)
        ON CONFLICT (issuer,subject) DO UPDATE SET name=EXCLUDED.name RETURNING id,name`, [randomUUID(), identity.issuer, identity.subject, identity.name])).rows[0];
      await db.query("INSERT INTO hunter_sessions VALUES ($1,$2,$3,now()+$4*interval '1 second')", [token, user.id, csrf, ttl]);
      return user;
    },
    async getSession(token) {
      return (await db.query(`SELECT u.id,u.name,s.csrf FROM hunter_sessions s JOIN hunter_users u ON u.id=s.user_id
        WHERE token_hash=$1 AND expires_at>now()`, [token])).rows[0];
    },
    async revokeSession(token) { await db.query('DELETE FROM hunter_sessions WHERE token_hash=$1', [token]); }
  };
}
export function createPostgresLimiter(db) {
  return { async consume(key, limit, seconds) {
    const row = (await db.query(`INSERT INTO hunter_rate_limits (key,count,expires_at) VALUES ($1,1,now()+$2*interval '1 second')
      ON CONFLICT (key) DO UPDATE SET count=CASE WHEN hunter_rate_limits.expires_at<=now() THEN 1 ELSE hunter_rate_limits.count+1 END,
      expires_at=CASE WHEN hunter_rate_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE hunter_rate_limits.expires_at END
      RETURNING count, GREATEST(1,ceil(extract(epoch FROM expires_at-now()))) AS retry`, [key, seconds])).rows[0];
    return { allowed: row.count <= limit, retryAfter: Number(row.retry) };
  } };
}
