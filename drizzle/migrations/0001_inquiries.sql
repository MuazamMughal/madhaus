-- Inbound enquiries: the contact form, private-event requests and group bookings.
-- Kept in the transactional database rather than emailed away, so nothing is lost when
-- a mail provider is down and staff have one queue to work through.

CREATE TYPE inquiry_kind AS ENUM ('general', 'private_event', 'group_booking', 'corporate', 'feedback');

CREATE TYPE inquiry_status AS ENUM ('new', 'in_progress', 'answered', 'closed', 'spam');

CREATE TABLE inquiries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference      text NOT NULL UNIQUE,
  kind           inquiry_kind NOT NULL DEFAULT 'general',
  status         inquiry_status NOT NULL DEFAULT 'new',
  customer_name  text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  subject        text,
  message        text NOT NULL,
  -- Free text for a private event: date, headcount, what they want.
  event_details  jsonb NOT NULL DEFAULT '{}',
  -- Hashed, never the raw address: enough to spot abuse, not a stored identifier.
  ip_hash        text,
  handled_by     uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  handled_at     timestamptz,
  staff_note     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inquiries_queue_idx ON inquiries (status, created_at DESC);
CREATE INDEX inquiries_phone_idx ON inquiries (customer_phone);

CREATE TRIGGER inquiries_touch BEFORE UPDATE ON inquiries
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE notifications
  ADD COLUMN inquiry_id uuid REFERENCES inquiries(id) ON DELETE CASCADE;
