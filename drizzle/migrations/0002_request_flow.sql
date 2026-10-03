-- Request-and-approve booking flow.
--
-- The venue decides every booking by hand. A customer submits a REQUEST; it reserves the
-- slot immediately (so nobody else can request it and staff cannot approve two overlapping
-- ones), and a member of staff then approves or declines it against what they know,
-- including walk-ins and phone bookings that never reached this system.
--
-- Payment is pay-at-venue by default. A customer who chooses to pay online is sent a
-- JazzCash link AFTER the slot is approved, submits a transaction reference, and a member
-- of staff confirms the money arrived. Nothing is ever auto-confirmed by a payment.

-- A pending request occupies a court, but it is not a checkout hold -- availability needs
-- to tell a customer "requested, awaiting confirmation" rather than "already booked",
-- because it may yet free up.
ALTER TYPE reservation_kind ADD VALUE IF NOT EXISTS 'request';

-- How the customer said they want to pay, captured at request time.
CREATE TYPE payment_preference AS ENUM ('at_venue', 'online');

ALTER TABLE bookings
  ADD COLUMN payment_preference payment_preference NOT NULL DEFAULT 'at_venue',
  -- Set when staff confirm the slot is genuinely free. For a pay-at-venue booking this is
  -- the moment it becomes confirmed; for an online payer it is the moment the payment link
  -- is sent, and the booking stays pending until the money is verified.
  ADD COLUMN slot_approved_at timestamptz,
  ADD COLUMN slot_approved_by uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  ADD COLUMN declined_reason text;

CREATE INDEX bookings_awaiting_slot_decision_idx ON bookings (created_at)
  WHERE status = 'pending_approval' AND slot_approved_at IS NULL;

-- Proof of a manual JazzCash transfer.
--
-- Separate from payment_intents because a customer may submit more than once -- a wrong
-- transaction id, a clearer screenshot -- and each attempt is worth keeping. The intent
-- records what is owed; these record what the customer says they sent.
CREATE TABLE payment_proofs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id           uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payment_intent_id    uuid REFERENCES payment_intents(id) ON DELETE SET NULL,

  -- Re-asked on the payment page so staff can match it against the JazzCash statement
  -- even when the customer paid from a different address than they booked with.
  payer_email          text NOT NULL,
  transaction_reference text NOT NULL,

  -- Optional screenshot, held inline. Kept small on purpose: a handful of these a night
  -- at a few hundred KB costs nothing, and it means the proof survives an email failure
  -- and is visible in the dashboard. Anything larger is rejected at the form.
  screenshot           bytea,
  screenshot_mime      text,
  screenshot_bytes     integer,

  status               text NOT NULL DEFAULT 'submitted'
                       CHECK (status IN ('submitted', 'accepted', 'rejected')),
  reviewed_by          uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  reviewed_at          timestamptz,
  review_note          text,

  ip_hash              text,
  submitted_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payment_proofs_screenshot_complete CHECK (
    (screenshot IS NULL AND screenshot_mime IS NULL AND screenshot_bytes IS NULL) OR
    (screenshot IS NOT NULL AND screenshot_mime IS NOT NULL AND screenshot_bytes IS NOT NULL)
  ),
  -- 2 MB. Enforced here as well as at the form, because the form is not the only way in.
  CONSTRAINT payment_proofs_screenshot_size CHECK (
    screenshot_bytes IS NULL OR screenshot_bytes <= 2097152
  ),
  -- Only image formats a browser will render, so staff can view it inline safely.
  CONSTRAINT payment_proofs_screenshot_type CHECK (
    screenshot_mime IS NULL OR screenshot_mime IN ('image/png', 'image/jpeg', 'image/webp')
  )
);

CREATE INDEX payment_proofs_queue_idx ON payment_proofs (status, submitted_at);
CREATE INDEX payment_proofs_booking_idx ON payment_proofs (booking_id, submitted_at DESC);

-- Messages the venue itself receives (a new request, a submitted proof) rather than the
-- customer. Lets the outbox address the venue without inventing a fake customer record.
ALTER TABLE notifications
  ADD COLUMN audience text NOT NULL DEFAULT 'customer'
    CHECK (audience IN ('customer', 'venue'));
