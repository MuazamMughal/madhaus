import { formatPkr } from "@/lib/domain/money";
import { serverEnv } from "@/lib/env";
import type { RenderedMessage } from "./types";

/**
 * Message templates.
 *
 * Written the way the venue would speak, and careful about one thing above all: a request
 * is never described as a confirmed booking, and a transfer the venue has not checked is
 * never described as a payment received.
 *
 * Venue-addressed templates are written for someone standing behind a counter: the detail
 * they need to make a decision, at the top, with no preamble.
 */

type Payload = Record<string, unknown>;

const str = (payload: Payload, key: string, fallback = ""): string => {
  const value = payload[key];
  return typeof value === "string" ? value : fallback;
};

const num = (payload: Payload, key: string): number | null => {
  const value = payload[key];
  return typeof value === "number" ? value : null;
};

const bool = (payload: Payload, key: string): boolean => payload[key] === true;

function siteUrl(path: string): string {
  try {
    return new URL(path, serverEnv().NEXT_PUBLIC_SITE_URL).toString();
  } catch {
    return path;
  }
}

type Template = (payload: Payload) => RenderedMessage;

const TEMPLATES: Record<string, Template> = {
  // --- To the customer ---------------------------------------------------------------

  request_received: (payload) => {
    const total = num(payload, "totalMinor");
    const online = str(payload, "paymentPreference") === "online";
    const lines = [
      `Hi ${str(payload, "name", "there")},`,
      "",
      `We have your request for the ${str(payload, "sport")} court on ${str(payload, "when")}.`,
      "",
      // The sentence this whole email exists for.
      "This is not a confirmed booking yet. We are holding the slot while someone at the venue checks it against the night's other bookings, and we will come back to you shortly either way.",
      "",
      `Reference: ${str(payload, "reference")}`,
      total !== null ? `Total: ${formatPkr(total)}` : "",
      "",
      online
        ? "You chose to pay online. Once we confirm the slot we will send you a payment link — please do not send anything before then."
        : "You chose to pay at the venue. There is nothing to pay now.",
    ].filter(Boolean);

    return {
      subject: `Request received — ${str(payload, "sport")} on ${str(payload, "when")}`,
      text: lines.join("\n"),
      html: paragraphs(lines),
    };
  },

  slot_approved_pay_now: (payload) => {
    const total = num(payload, "totalMinor");
    const payUrl = str(payload, "payUrl");
    const lines = [
      `Hi ${str(payload, "name", "there")},`,
      "",
      `Good news — the ${str(payload, "sport")} court is yours for ${str(payload, "when")}.`,
      "",
      "To lock it in, send the payment by JazzCash and give us the transaction ID:",
      payUrl,
      "",
      total !== null ? `Amount: ${formatPkr(total)}` : "",
      `Reference: ${str(payload, "reference")}`,
      "",
      "The court is held for you in the meantime. We will confirm as soon as we have matched the payment.",
    ].filter(Boolean);

    return {
      subject: `Slot held — pay to confirm (${str(payload, "reference")})`,
      text: lines.join("\n"),
      html: paragraphs(lines, { link: payUrl }),
    };
  },

  booking_confirmed: (payload) => {
    const total = num(payload, "totalMinor");
    const paid = bool(payload, "paid");
    const lines = [
      `Hi ${str(payload, "name", "there")},`,
      "",
      "You are booked in at MadHaus.",
      "",
      `${str(payload, "sport")} — ${str(payload, "when")}`,
      str(payload, "court") ? `Court: ${str(payload, "court")}` : "",
      `Reference: ${str(payload, "reference")}`,
      total !== null ? `Total: ${formatPkr(total)}${paid ? " — paid, thank you" : " — payable at the venue"}` : "",
      "",
      "The calendar invite is attached, with a reminder an hour before.",
      "",
      "See you on the court.",
    ].filter(Boolean);

    return {
      subject: `Confirmed — ${str(payload, "sport")} on ${str(payload, "when")}`,
      text: lines.join("\n"),
      html: paragraphs(lines),
    };
  },

  request_declined: (payload) => {
    const reason = str(payload, "reason");
    const lines = [
      `Hi ${str(payload, "name", "there")},`,
      "",
      `We are sorry — we cannot take your booking for ${str(payload, "sport")} on ${str(payload, "when")}.`,
      reason ? "" : "",
      reason ? reason : "",
      "",
      "Nothing has been charged. The slot is back on the board, and there may be another time that works:",
      siteUrl("/book"),
      "",
      `Reference: ${str(payload, "reference")}`,
    ].filter(Boolean);

    return {
      subject: `Could not take your booking — ${str(payload, "reference")}`,
      text: lines.join("\n"),
      html: paragraphs(lines, { link: siteUrl("/book") }),
    };
  },

  payment_not_matched: (payload) => {
    const reason = str(payload, "reason");
    const lines = [
      `Hi ${str(payload, "name", "there")},`,
      "",
      "We could not match the payment you sent us against our JazzCash account.",
      reason ? reason : "",
      "",
      "Your court is still held. Please check the transaction ID and send it again, or give us a call and we will sort it out.",
      "",
      `Reference: ${str(payload, "reference")}`,
      `${str(payload, "sport")} — ${str(payload, "when")}`,
    ].filter(Boolean);

    return {
      subject: `We could not match your payment — ${str(payload, "reference")}`,
      text: lines.join("\n"),
      html: paragraphs(lines),
    };
  },

  booking_rescheduled: (payload) => {
    const total = num(payload, "totalMinor");
    const lines = [
      `Hi ${str(payload, "name", "there")},`,
      "",
      "Your booking has been moved.",
      "",
      `${str(payload, "sport")} — ${str(payload, "when")}`,
      `Reference: ${str(payload, "reference")}`,
      total !== null ? `Total: ${formatPkr(total)}` : "",
      "",
      "Same reference, new time. Your original booking link still works.",
    ].filter(Boolean);

    return {
      subject: `Moved — now ${str(payload, "when")}`,
      text: lines.join("\n"),
      html: paragraphs(lines),
    };
  },

  booking_cancelled: (payload) => {
    const lines = [
      `Hi ${str(payload, "name", "there")},`,
      "",
      `Your booking for ${str(payload, "sport")} on ${str(payload, "when")} has been cancelled.`,
      `Reference: ${str(payload, "reference")}`,
      "",
      "If this was not you, get in touch with the venue.",
    ];

    return {
      subject: `Cancelled — ${str(payload, "reference")}`,
      text: lines.join("\n"),
      html: paragraphs(lines),
    };
  },

  table_requested: (payload) => {
    const lines = [
      `Hi ${str(payload, "name", "there")},`,
      "",
      `We have your table request for ${num(payload, "partySize") ?? ""} on ${str(payload, "when")}.`,
      "",
      "This is a request, not a booking. The venue will confirm before your table is held.",
      "",
      `Reference: ${str(payload, "reference")}`,
    ];
    return { subject: "Table request received", text: lines.join("\n"), html: paragraphs(lines) };
  },

  table_confirmed: (payload) => {
    const lines = [
      `Hi ${str(payload, "name", "there")},`,
      "",
      `Your table is booked for ${num(payload, "partySize") ?? ""} on ${str(payload, "when")}.`,
      `Reference: ${str(payload, "reference")}`,
      "",
      "See you soon.",
    ];
    return { subject: "Table booked", text: lines.join("\n"), html: paragraphs(lines) };
  },

  // --- To the venue ------------------------------------------------------------------

  request_received_venue: (payload) => {
    const total = num(payload, "totalMinor");
    const online = str(payload, "paymentPreference") === "online";
    const notes = str(payload, "notes");
    const lines = [
      "NEW BOOKING REQUEST — needs a decision",
      "",
      `${str(payload, "sport")} · ${str(payload, "court")}`,
      `${str(payload, "when")} · ${num(payload, "durationMinutes") ?? "?"} min`,
      "",
      `Name:  ${str(payload, "name")}`,
      `Phone: ${str(payload, "phone")}`,
      str(payload, "email") ? `Email: ${str(payload, "email")}` : "",
      "",
      total !== null ? `Total: ${formatPkr(total)}` : "",
      `Paying: ${online ? "ONLINE (JazzCash) — they get a payment link once you approve" : "At the venue"}`,
      notes ? `\nNotes: ${notes}` : "",
      "",
      `Reference: ${str(payload, "reference")}`,
      "",
      "The slot is held and will not be offered to anyone else until you decide.",
      "",
      "Approve or decline:",
      siteUrl("/admin"),
    ].filter(Boolean);

    return {
      subject: `New request — ${str(payload, "sport")}, ${str(payload, "when")}`,
      text: lines.join("\n"),
      html: paragraphs(lines, { link: siteUrl("/admin") }),
    };
  },

  payment_proof_received_venue: (payload) => {
    const total = num(payload, "totalMinor");
    const lines = [
      "PAYMENT SUBMITTED — needs checking against JazzCash",
      "",
      `Reference: ${str(payload, "reference")}`,
      `${str(payload, "sport")} · ${str(payload, "when")}`,
      "",
      `Name:  ${str(payload, "name")}`,
      `Phone: ${str(payload, "phone")}`,
      `Paid from: ${str(payload, "payerEmail")}`,
      "",
      `Transaction ID: ${str(payload, "transactionReference")}`,
      total !== null ? `Amount claimed: ${formatPkr(total)}` : "",
      bool(payload, "hasScreenshot") ? "A screenshot was attached — view it in the dashboard." : "No screenshot was attached.",
      "",
      "This booking is NOT confirmed until someone checks the account and approves it:",
      siteUrl("/admin/payments"),
    ].filter(Boolean);

    return {
      subject: `Payment to verify — ${str(payload, "reference")}`,
      text: lines.join("\n"),
      html: paragraphs(lines, { link: siteUrl("/admin/payments") }),
    };
  },
};

export function renderTemplate(name: string, payload: Payload): RenderedMessage {
  const template = TEMPLATES[name];
  if (!template) {
    throw new Error(`No notification template named "${name}".`);
  }
  return template(payload);
}

export function templateExists(name: string): boolean {
  return name in TEMPLATES;
}

/** Templates addressed to the venue rather than to a customer. */
export function isVenueTemplate(name: string): boolean {
  return name.endsWith("_venue");
}

/**
 * Minimal HTML. Deliberately plain: it has to survive every mail client, and nobody needs
 * a designed email to read a transaction ID.
 */
function paragraphs(lines: string[], options: { link?: string } = {}): string {
  const body = lines
    .filter((line) => line !== "")
    .map((line) => {
      if (options.link && line === options.link) {
        return `<p style="margin:0 0 16px 0;"><a href="${escapeHtml(line)}" style="background:#D5FF3F;color:#101010;padding:12px 20px;text-decoration:none;font-weight:600;display:inline-block;">${escapeHtml(shortenUrl(line))}</a></p>`;
      }
      return `<p style="margin:0 0 12px 0;">${escapeHtml(line)}</p>`;
    })
    .join("");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#101010;max-width:560px;">${body}</div>`;
}

function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/book"
      ? "Find another time"
      : parsed.pathname.startsWith("/admin/payments")
        ? "Verify this payment"
        : parsed.pathname.startsWith("/admin")
          ? "Open the dashboard"
          : "Pay now";
  } catch {
    return "Open";
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
