import { escapeIcsText, foldIcsLine, icsTimestamp } from "@/lib/utils/ics";

/**
 * The calendar invite attached to a confirmation email.
 *
 * Separate from the download route so the same builder serves both and they can never
 * drift apart. The reminder is one hour before the session, which is roughly the point at
 * which someone in Sahiwal needs to leave.
 */
export function buildBookingIcs(args: {
  reference: string;
  summary: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  confirmed: boolean;
  productName: string;
  reminderMinutesBefore?: number;
}): Buffer {
  const reminder = args.reminderMinutesBefore ?? 60;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${args.productName}//Booking//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    // Stable, so re-downloading or re-receiving updates the same event rather than
    // adding a second one to the customer's calendar.
    `UID:${args.reference}@madhaus`,
    `DTSTAMP:${icsTimestamp(new Date())}`,
    `DTSTART:${icsTimestamp(args.startsAt)}`,
    `DTEND:${icsTimestamp(args.endsAt)}`,
    `SUMMARY:${escapeIcsText(args.summary)}`,
    `DESCRIPTION:${escapeIcsText(args.description)}`,
    `LOCATION:${escapeIcsText(args.location)}`,
    `STATUS:${args.confirmed ? "CONFIRMED" : "TENTATIVE"}`,
    "BEGIN:VALARM",
    `TRIGGER:-PT${reminder}M`,
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(`${args.summary} in ${reminder} minutes`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // RFC 5545 requires CRLF line endings, folded at 75 octets.
  return Buffer.from(lines.map(foldIcsLine).join("\r\n"), "utf8");
}
