-- A dedicated token for the "pay now" page.
--
-- The booking's own access token is stored hashed and the plaintext is never kept, so by
-- the time staff approve a slot there is no way to rebuild the customer's original link.
-- Minting a second, single-purpose token at approval time solves that without rotating
-- the first one -- the link in the customer's original email keeps working.
--
-- It is also better separation: a payment link that gets forwarded grants the ability to
-- submit a transaction reference, not the ability to cancel a booking.

ALTER TABLE bookings
  ADD COLUMN payment_token_hash text,
  ADD COLUMN payment_link_sent_at timestamptz;
