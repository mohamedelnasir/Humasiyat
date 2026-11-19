-- Up Migration
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- lets exclusion constraints combine uuid equality with range overlap
CREATE EXTENSION IF NOT EXISTS citext;      -- case-insensitive email

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Down Migration
DROP FUNCTION IF EXISTS set_updated_at();
