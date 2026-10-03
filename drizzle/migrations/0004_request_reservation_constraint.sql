-- Let a `request` reservation own a booking.
--
-- The original constraint predates the request-and-approve flow and only allowed
-- `booking` and `hold` rows to carry a booking_id. A request is a booking's reservation
-- just as much as the other two, so it belongs in the same branch.

ALTER TABLE reservations DROP CONSTRAINT reservations_owner_matches_kind;

ALTER TABLE reservations ADD CONSTRAINT reservations_owner_matches_kind CHECK (
  (kind IN ('booking', 'hold', 'request')
     AND booking_id IS NOT NULL AND maintenance_id IS NULL AND event_id IS NULL) OR
  (kind = 'maintenance'
     AND maintenance_id IS NOT NULL AND booking_id IS NULL AND event_id IS NULL) OR
  (kind = 'event'
     AND event_id IS NOT NULL AND booking_id IS NULL AND maintenance_id IS NULL)
);
