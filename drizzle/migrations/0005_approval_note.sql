-- Record the phone check that happens before a booking is confirmed.
--
-- The venue rings every customer to confirm the booking before locking the slot. That
-- call is the actual decision, so it deserves a record: who at the venue made it, when,
-- and anything said worth keeping ("asked to move to 9pm", "said they may be 10 late").
--
-- Without it the audit trail says a booking was approved but not on what basis, which is
-- exactly the question asked when a customer turns up disputing something.

ALTER TABLE bookings
  ADD COLUMN approval_note text;
