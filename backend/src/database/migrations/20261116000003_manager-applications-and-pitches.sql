-- Up Migration
CREATE TABLE manager_applications (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name      text NOT NULL CHECK (char_length(business_name) BETWEEN 2 AND 160),
  contact_phone      text,
  message            text,
  document_path      text,  -- private storage path (manager-documents bucket)
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at        timestamptz,
  rejection_reason   text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
-- A user can only have one pending application at a time.
CREATE UNIQUE INDEX manager_applications_one_pending_idx ON manager_applications (user_id) WHERE status = 'pending';
CREATE INDEX manager_applications_status_idx ON manager_applications (status, created_at);
CREATE TRIGGER manager_applications_set_updated_at BEFORE UPDATE ON manager_applications FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE pitches (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id           uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name                 text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  description          text,
  address              text NOT NULL,
  city                 text NOT NULL,
  latitude             numeric(9,6) CHECK (latitude BETWEEN -90 AND 90),
  longitude            numeric(9,6) CHECK (longitude BETWEEN -180 AND 180),
  timezone             text NOT NULL DEFAULT 'Africa/Khartoum',
  slot_duration_minutes integer NOT NULL DEFAULT 60 CHECK (slot_duration_minutes IN (30, 60, 90, 120)),
  approval_status      text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  rejection_reason     text,
  approved_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at          timestamptz,
  availability_status  text NOT NULL DEFAULT 'available' CHECK (availability_status IN ('available', 'unavailable')),
  -- Bankak manual-payment details configured by the manager (per pitch).
  bankak_account_number text,
  bankak_account_holder text,
  bank_name             text,
  payment_notes         text,
  deleted_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pitches_coordinates_pair CHECK ((latitude IS NULL) = (longitude IS NULL))
);
CREATE INDEX pitches_manager_idx ON pitches (manager_id) WHERE deleted_at IS NULL;
CREATE INDEX pitches_discovery_idx ON pitches (city, approval_status, availability_status) WHERE deleted_at IS NULL;
CREATE INDEX pitches_name_idx ON pitches (lower(name));
CREATE TRIGGER pitches_set_updated_at BEFORE UPDATE ON pitches FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE pitch_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id      uuid NOT NULL REFERENCES pitches(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  sort_order    integer NOT NULL DEFAULT 0,
  is_cover      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pitch_images_pitch_idx ON pitch_images (pitch_id, sort_order);
CREATE UNIQUE INDEX pitch_images_one_cover_idx ON pitch_images (pitch_id) WHERE is_cover;

CREATE TABLE pitch_facilities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id      uuid NOT NULL REFERENCES pitches(id) ON DELETE CASCADE,
  facility_key  text NOT NULL CHECK (facility_key ~ '^[a-z][a-z0-9_]{1,40}$'),  -- e.g. parking, lighting, showers
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pitch_id, facility_key)
);

-- One opening window per weekday. close_time <= open_time means the window crosses midnight.
CREATE TABLE pitch_operating_hours (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id     uuid NOT NULL REFERENCES pitches(id) ON DELETE CASCADE,
  day_of_week  smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0 = Sunday
  open_time    time NOT NULL,
  close_time   time NOT NULL,
  is_closed    boolean NOT NULL DEFAULT false,
  UNIQUE (pitch_id, day_of_week),
  CONSTRAINT pitch_hours_window CHECK (is_closed OR open_time <> close_time)
);

-- Price per hour for a weekday/time band. day_of_week NULL = applies to every day.
CREATE TABLE pitch_pricing (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id        uuid NOT NULL REFERENCES pitches(id) ON DELETE CASCADE,
  day_of_week     smallint CHECK (day_of_week BETWEEN 0 AND 6),
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  price_per_hour  numeric(12,2) NOT NULL CHECK (price_per_hour >= 0),
  currency        char(3) NOT NULL DEFAULT 'SDG',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pitch_pricing_band CHECK (start_time <> end_time)
);
CREATE INDEX pitch_pricing_pitch_idx ON pitch_pricing (pitch_id, day_of_week);
CREATE TRIGGER pitch_pricing_set_updated_at BEFORE UPDATE ON pitch_pricing FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Manager-created blocks (maintenance etc.). Blocks may never overlap each other.
CREATE TABLE pitch_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id    uuid NOT NULL REFERENCES pitches(id) ON DELETE CASCADE,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  reason      text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pitch_blocks_range CHECK (ends_at > starts_at),
  CONSTRAINT pitch_blocks_no_overlap EXCLUDE USING gist (pitch_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
);
CREATE INDEX pitch_blocks_pitch_time_idx ON pitch_blocks (pitch_id, starts_at);

-- Down Migration
DROP TABLE IF EXISTS pitch_blocks;
DROP TABLE IF EXISTS pitch_pricing;
DROP TABLE IF EXISTS pitch_operating_hours;
DROP TABLE IF EXISTS pitch_facilities;
DROP TABLE IF EXISTS pitch_images;
DROP TABLE IF EXISTS pitches;
DROP TABLE IF EXISTS manager_applications;
