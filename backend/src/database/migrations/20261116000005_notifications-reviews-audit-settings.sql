-- Up Migration
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE device_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token         text NOT NULL UNIQUE,
  platform      text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_tokens_user_idx ON device_tokens (user_id);

CREATE TABLE reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id     uuid NOT NULL REFERENCES pitches(id) ON DELETE CASCADE,
  customer_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id   uuid NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,  -- one review per booking
  rating       smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reviews_pitch_idx ON reviews (pitch_id, created_at DESC);
CREATE TRIGGER reviews_set_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE activity_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action       text NOT NULL,       -- e.g. payment.verified, pitch.approved
  entity_type  text NOT NULL,
  entity_id    uuid,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address   inet,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_logs_entity_idx ON activity_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX activity_logs_actor_idx ON activity_logs (actor_id, created_at DESC);
CREATE INDEX activity_logs_action_idx ON activity_logs (action, created_at DESC);

CREATE TABLE platform_settings (
  key          text PRIMARY KEY,
  value        jsonb NOT NULL,
  description  text,
  updated_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER platform_settings_set_updated_at BEFORE UPDATE ON platform_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO platform_settings (key, value, description) VALUES
  ('payment_hold_minutes', '15', 'Minutes a customer has to submit payment after the manager approves availability'),
  ('payment_reminder_minutes', '5', 'Send a payment-deadline reminder this many minutes before the hold expires'),
  ('default_currency', '"SDG"', 'Default currency code for prices');

-- Down Migration
DROP TABLE IF EXISTS platform_settings;
DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS device_tokens;
DROP TABLE IF EXISTS notifications;
