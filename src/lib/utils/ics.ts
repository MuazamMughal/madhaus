/**
 * iCalendar primitives.
 *
 * Hand-rolled rather than pulled from a package: the format needed here is a handful of
 * lines, and the fiddly parts — CRLF endings, escaping, 75-octet folding — are less code
 * than integrating a library would be.
 */

/** UTC basic format: 20261002T143000Z */
export function icsTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape the characters iCalendar treats as structural. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold at 75 octets, continuation lines starting with a single space. */
export function foldIcsLine(line: string): string {
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
