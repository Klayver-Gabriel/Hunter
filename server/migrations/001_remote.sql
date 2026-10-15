BEGIN;
CREATE TABLE IF NOT EXISTS hunter_users (
  id uuid PRIMARY KEY,
  issuer text NOT NULL,
  subject text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);
CREATE TABLE IF NOT EXISTS hunter_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES hunter_users(id),
  csrf text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS hunter_sessions_expiry ON hunter_sessions(expires_at);
CREATE TABLE IF NOT EXISTS hunter_auth_flows (
  token_hash text PRIMARY KEY,
  data jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS hunter_sheets (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES hunter_users(id),
  title text NOT NULL,
  schema_version integer NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  document jsonb NOT NULL,
  fingerprint text NOT NULL,
  creation_key text NOT NULL,
  creation_fingerprint text NOT NULL,
  last_mutation text,
  last_base_revision integer,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, creation_key)
);
CREATE INDEX IF NOT EXISTS hunter_sheets_owner ON hunter_sheets(owner_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS hunter_rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL
);
COMMIT;
