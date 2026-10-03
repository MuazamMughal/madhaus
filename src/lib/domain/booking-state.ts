/**
 * Booking and payment state machines.
 *
 * The two are deliberately independent. A booking can be `confirmed` + `unpaid`
 * (pay at venue, the common case here), or `cancelled` + `paid` while a refund is
 * being processed. Collapsing them into one field is the classic way to end up
 * unable to represent a real situation the front desk is looking at.
 *
 * Every transition is checked on the server before it is written. The dashboard hides
 * buttons the current role cannot use, but hiding a button is presentation, not
 * authorisation.
 */

export const BOOKING_STATUSES = [
  "held",
  "pending_approval",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "unpaid",
  "pending_verification",
  "paid",
  "failed",
  "partially_refunded",
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Who is asking for the transition. Not a role -- a role maps onto one of these. */
export type Actor = "customer" | "staff" | "system";

export interface TransitionRule {
  to: BookingStatus;
  by: readonly Actor[];
  /** Shown in the audit log and, where useful, to staff. */
  note: string;
}

/**
 * Allowed booking transitions.
 *
 * `held` is the only state a booking starts in for an online checkout, and it is the
 * only state that expires on its own.
 */
export const BOOKING_TRANSITIONS: Readonly<Record<BookingStatus, readonly TransitionRule[]>> = {
  held: [
    {
      to: "confirmed",
      by: ["system", "staff"],
      note: "Checkout completed, or staff confirmed on the customer's behalf.",
    },
    {
      to: "pending_approval",
      by: ["system"],
      note: "Checkout completed but the payment method needs a human check (bank transfer).",
    },
    {
      to: "cancelled",
      by: ["customer", "staff", "system"],
      note: "Customer abandoned checkout, staff released the slot, or the hold expired.",
    },
  ],
  pending_approval: [
    { to: "confirmed", by: ["staff"], note: "Staff approved the request or verified the payment." },
    { to: "cancelled", by: ["staff", "customer", "system"], note: "Staff rejected it, or the customer withdrew." },
  ],
  confirmed: [
    { to: "cancelled", by: ["customer", "staff"], note: "Cancelled within the policy window, or cancelled by the venue." },
    { to: "completed", by: ["staff", "system"], note: "The session was played." },
    { to: "no_show", by: ["staff"], note: "The slot was held and nobody arrived." },
  ],
  // Terminal states. Re-opening a booking is deliberately not possible: staff create a
  // fresh booking instead, so the history of what happened stays truthful.
  cancelled: [],
  completed: [],
  no_show: [],
};

export const PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  unpaid: ["pending_verification", "paid", "failed"],
  pending_verification: ["paid", "failed", "unpaid"],
  paid: ["partially_refunded", "refunded"],
  failed: ["unpaid", "pending_verification", "paid"],
  partially_refunded: ["refunded", "partially_refunded"],
  refunded: [],
};

export interface TransitionResult {
  ok: boolean;
  reason?: string;
}

export function canTransitionBooking(
  from: BookingStatus,
  to: BookingStatus,
  actor: Actor,
): TransitionResult {
  if (from === to) return { ok: false, reason: `The booking is already ${humanBookingStatus(to)}.` };
  const rule = BOOKING_TRANSITIONS[from].find((candidate) => candidate.to === to);
  if (!rule) {
    return {
      ok: false,
      reason: `A ${humanBookingStatus(from)} booking cannot become ${humanBookingStatus(to)}.`,
    };
  }
  if (!rule.by.includes(actor)) {
    return { ok: false, reason: `That change can only be made by: ${rule.by.join(", ")}.` };
  }
  return { ok: true };
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): TransitionResult {
  if (!PAYMENT_TRANSITIONS[from].includes(to)) {
    return {
      ok: false,
      reason: `Payment cannot move from ${humanPaymentStatus(from)} to ${humanPaymentStatus(to)}.`,
    };
  }
  return { ok: true };
}

/** A booking in one of these states is still holding the court. */
export function occupiesCourt(status: BookingStatus): boolean {
  return status === "held" || status === "pending_approval" || status === "confirmed";
}

/** States from which a customer may ask to cancel or reschedule. */
export function isCustomerManageable(status: BookingStatus): boolean {
  return status === "confirmed" || status === "pending_approval";
}

// --- Customer-facing wording -------------------------------------------------------
// Never leak the enum value into the UI. In particular a held or pending booking must
// not read as "confirmed": a request submitted is not a reservation.

const BOOKING_STATUS_LABELS: Readonly<Record<BookingStatus, string>> = {
  held: "Holding your slot",
  pending_approval: "Awaiting confirmation",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Played",
  no_show: "Missed",
};

const BOOKING_STATUS_EXPLANATIONS: Readonly<Record<BookingStatus, string>> = {
  held: "We are keeping this slot for you while you finish checkout. It is not booked yet.",
  pending_approval:
    "We have your request and the court is being kept aside. The venue will confirm it shortly — it is not a confirmed booking yet.",
  confirmed: "You are on the court. See you there.",
  cancelled: "This booking was cancelled.",
  completed: "Thanks for playing.",
  no_show: "This slot was held but nobody arrived.",
};

const PAYMENT_STATUS_LABELS: Readonly<Record<PaymentStatus, string>> = {
  unpaid: "Pay at the venue",
  pending_verification: "Payment being checked",
  paid: "Paid",
  failed: "Payment failed",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
};

export function humanBookingStatus(status: BookingStatus): string {
  return BOOKING_STATUS_LABELS[status];
}

export function explainBookingStatus(status: BookingStatus): string {
  return BOOKING_STATUS_EXPLANATIONS[status];
}

export function humanPaymentStatus(status: PaymentStatus): string {
  return PAYMENT_STATUS_LABELS[status];
}

/**
 * Payment wording that accounts for how the customer said they would pay.
 *
 * "Unpaid" means two very different things here: a pay-at-venue customer owes nothing
 * until they arrive, while an online payer is waiting for a link or has one sitting in
 * their inbox. Labelling both "Pay at the venue" tells one of them the wrong thing.
 */
export function describePaymentState(args: {
  paymentStatus: PaymentStatus;
  paymentPreference: "at_venue" | "online";
  slotApproved: boolean;
}): string {
  if (args.paymentStatus !== "unpaid") return PAYMENT_STATUS_LABELS[args.paymentStatus];

  if (args.paymentPreference === "online") {
    return args.slotApproved
      ? "Pay by JazzCash — link sent to you"
      : "Pay online once we confirm the slot";
  }
  return PAYMENT_STATUS_LABELS.unpaid;
}

/**
 * Status tone for the UI. Paired with an icon and the text label, never used as the
 * only signal -- colour alone fails both colour-blind users and screen readers.
 */
export type StatusTone = "positive" | "pending" | "negative" | "neutral";

export function bookingStatusTone(status: BookingStatus): StatusTone {
  switch (status) {
    case "confirmed":
      return "positive";
    case "held":
    case "pending_approval":
      return "pending";
    case "cancelled":
    case "no_show":
      return "negative";
    case "completed":
      return "neutral";
  }
}

export function paymentStatusTone(status: PaymentStatus): StatusTone {
  switch (status) {
    case "paid":
      return "positive";
    case "pending_verification":
      return "pending";
    case "failed":
      return "negative";
    case "refunded":
    case "partially_refunded":
    case "unpaid":
      return "neutral";
  }
}
