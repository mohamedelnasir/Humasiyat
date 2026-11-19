-- Up Migration
CREATE TABLE bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference        text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  pitch_id         uuid NOT NULL REFERENCES pitches(id) ON DELETE RESTRICT,
  customer_id      uuid REFERENCES users(id) ON DELETE RESTRICT,  -- NULL for walk-in manual bookings
  guest_name       text,
  guest_phone      text,
  source           text NOT NULL DEFAULT 'online' CHECK (source IN ('online', 'manual')),
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  total_price      numeric(12,2) NOT NULL CHECK (total_price >= 0),
  currency         char(3) NOT NULL DEFAULT 'SDG',
  status           text NOT NULL DEFAULT 'pending_manager_approval' CHECK (status IN (
                     'pending_manager_approval', 'awaiting_payment', 'payment_submitted', 'payment_rejected',
                     'confirmed', 'rejected', 'expired', 'cancelled', 'completed')),
  hold_expires_at  timestamptz,
  customer_note    text,
  manager_note     text,
  rejection_reason text,
  cancelled_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at     timestamptz,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_range CHECK (ends_at > starts_at),
  CONSTRAINT bookings_party_present CHECK (customer_id IS NOT NULL OR (source = 'manual' AND guest_name IS NOT NULL)),
  CONSTRAINT bookings_hold_required CHECK (status <> 'awaiting_payment' OR hold_expires_at IS NOT NULL),
  -- THE double-booking guard: no two time-occupying bookings of one pitch may overlap.
  -- 'pending_manager_approval' is deliberately excluded: many customers may request the same slot
  -- and the manager chooses one. Approval moves a row into the constrained set inside a transaction;
  -- a losing writer gets SQLSTATE 23P01, mapped to 409 SLOT_TAKEN.
  CONSTRAINT bookings_no_overlap_active EXCLUDE USING gist (
    pitch_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('awaiting_payment', 'payment_submitted', 'payment_rejected', 'confirmed'))
);
CREATE INDEX bookings_pitch_time_idx ON bookings (pitch_id, starts_at);
CREATE INDEX bookings_customer_idx ON bookings (customer_id, created_at DESC);
CREATE INDEX bookings_status_idx ON bookings (pitch_id, status);
CREATE INDEX bookings_expiring_holds_idx ON bookings (hold_expires_at) WHERE status = 'awaiting_payment';
CREATE TRIGGER bookings_set_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  amount                numeric(12,2) NOT NULL CHECK (amount > 0),
  currency              char(3) NOT NULL DEFAULT 'SDG',
  method                text NOT NULL DEFAULT 'bankak' CHECK (method IN ('bankak')),
  status                text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN (
                          'awaiting_payment', 'submitted', 'verified', 'rejected', 'refunded')),
  transaction_reference text,
  payer_note            text,
  submitted_at          timestamptz,
  verified_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  verified_at           timestamptz,
  rejection_reason      text,
  refunded_at           timestamptz,
  refund_note           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
-- At most one open attempt and one verified payment per booking.
CREATE UNIQUE INDEX payments_one_open_idx ON payments (booking_id) WHERE status IN ('awaiting_payment', 'submitted');
CREATE UNIQUE INDEX payments_one_verified_idx ON payments (booking_id) WHERE status = 'verified';
CREATE INDEX payments_status_idx ON payments (status, created_at);
CREATE INDEX payments_reference_idx ON payments (transaction_reference) WHERE transaction_reference IS NOT NULL;
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE payment_receipts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id       uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  storage_path     text NOT NULL,  -- private bucket; served only through short-lived signed URLs
  mime_type        text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  file_size_bytes  integer NOT NULL CHECK (file_size_bytes > 0),
  uploaded_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_receipts_payment_idx ON payment_receipts (payment_id);

-- Down Migration
DROP TABLE IF EXISTS payment_receipts;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS bookings;
