BEGIN;
CREATE TABLE IF NOT EXISTS hunter_systems (
  owner_id uuid NOT NULL REFERENCES hunter_users(id),
  id text NOT NULL,
  title text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  config jsonb NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id)
);
CREATE INDEX IF NOT EXISTS hunter_systems_owner ON hunter_systems(owner_id, updated_at DESC) WHERE deleted_at IS NULL;
ALTER TABLE hunter_sheets ADD COLUMN IF NOT EXISTS system_id text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='hunter_sheets_system_fk' AND conrelid='hunter_sheets'::regclass) THEN
    ALTER TABLE hunter_sheets ADD CONSTRAINT hunter_sheets_system_fk
      FOREIGN KEY (owner_id, system_id) REFERENCES hunter_systems(owner_id, id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS hunter_sheets_system ON hunter_sheets(owner_id, system_id) WHERE deleted_at IS NULL;
COMMIT;
