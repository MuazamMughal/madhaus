import { findBookingForCustomer } from "@/server/booking-access";
import { getSiteSettings } from "@/lib/content";

/**
 * Calendar download for a booking.
 *
 * Hand-rolled iCalendar rather than a dependency: the format needed here is a handful of
 * lines, and the fiddly parts (CRLF endings, escaping, 75-octet folding) are less code
 * than integrating a library.
 *
 * Guarded by the same reference + token pair as the booking page, so a calendar file
 * cannot be pulled for a reference someone guessed.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/bookings/[reference]/calendar">,
) {
  const { reference } = await context.params;
  const token = new URL(request.url).searchParams.get("t");

  const booking = await findBookingForCustomer({ reference, token });
  if (!booking) {
    return new Response("Not found", { status: 404 });
  }
  if (booking.status === "cancelled") {
    return new Response("This booking was cancelled.", { status: 410 });
  }

  const settings = await getSiteSettings();
  const location = settings.addressLines?.join(", ") ?? `${settings.brandName}, ${settings.city}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${settings.brandName}//Booking//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    // Stable, so re-downloading updates the same event rather than adding a second one.
    `UID:${booking.reference}@madhaus`,
    `DTSTAMP:${icsTimestamp(new Date())}`,
    `DTSTART:${icsTimestamp(booking.startsAt)}`,
    `DTEND:${icsTimestamp(booking.endsAt)}`,
    `SUMMARY:${escapeIcsText(`${booking.sportName} at ${settings.brandName}`)}`,
    `DESCRIPTION:${escapeIcsText(
      [
        `Booking reference: ${booking.reference}`,
        `Court: ${booking.resourceName}`,
        `Booked for: ${booking.customerName}`,
        booking.status === "pending_approval"
          ? "Status: awaiting confirmation from the venue."
          : "Status: confirmed.",
      ].join("\n"),
    )}`,
    `LOCATION:${escapeIcsText(location)}`,
    `STATUS:${booking.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(`${booking.sportName} at ${settings.brandName} in 2 hours`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // RFC 5545 requires CRLF line endings, and lines folded at 75 octets.
  const body = lines.map(foldIcsLine).join("\r\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="madhaus-${booking.reference}.ics"`,
      // A private record: never cached by a shared proxy.
      "Cache-Control": "private, no-store",
    },
  });
}

/** UTC basic format: 20261002T143000Z */
function icsTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape the characters iCalendar treats as structural. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold at 75 octets, continuation lines starting with a single space. */
function foldIcsLine(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;

  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    if (Buffer.byteLength(current + char, "utf8") > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
}
