import { createHash } from "node:crypto";
import { pool } from "@/lib/db/client";
import { normalisePakistaniPhone } from "@/lib/domain/phone";
import { generateBookingReference } from "@/lib/domain/reference";

/**
 * Enquiries.
 *
 * Written to the database first and notified about second, so a message is never lost to
 * a mail outage. The sender's IP is hashed rather than stored: enough to correlate abuse,
 * not enough to be a record of who was browsing.
 */

export type InquiryKind = "general" | "private_event" | "group_booking" | "corporate" | "feedback";

export interface InquiryInput {
  kind: InquiryKind;
  name: string;
  phone: string;
  email?: string | null;
  subject?: string | null;
  message: string;
  eventDetails?: Record<string, unknown>;
  ip?: string | null;
}

export async function createInquiry(input: InquiryInput): Promise<{ reference: string }> {
  const phone = normalisePakistaniPhone(input.phone);
  const reference = generateBookingReference("MQ");

  await pool().query(
    `INSERT INTO inquiries (reference, kind, customer_name, customer_phone, customer_email,
                            subject, message, event_details, ip_hash)
     VALUES ($1,$2::inquiry_kind,$3,$4,$5,$6,$7,$8,$9)`,
    [
      reference,
      input.kind,
      input.name.trim(),
      phone.e164,
      input.email?.trim() || null,
      input.subject?.trim() || null,
      input.message.trim(),
      JSON.stringify(input.eventDetails ?? {}),
      input.ip ? createHash("sha256").update(input.ip).digest("hex").slice(0, 32) : null,
    ],
  );

  return { reference };
}

export async function listInquiries(options: { status?: string; limit?: number } = {}) {
  const { rows } = await pool().query(
    `SELECT id, reference, kind::text, status::text, customer_name, customer_phone,
            customer_email, subject, message, event_details, created_at, staff_note
       FROM inquiries
      WHERE ($1::text IS NULL OR status::text = $1)
      ORDER BY created_at DESC
      LIMIT $2`,
    [options.status ?? null, options.limit ?? 100],
  );
  return rows.map((row) => ({
    id: row.id as string,
    reference: row.reference as string,
    kind: row.kind as InquiryKind,
    status: row.status as string,
    customerName: row.customer_name as string,
    customerPhone: row.customer_phone as string,
    customerEmail: row.customer_email as string | null,
    subject: row.subject as string | null,
    message: row.message as string,
    eventDetails: row.event_details as Record<string, unknown>,
    createdAt: new Date(row.created_at),
    staffNote: row.staff_note as string | null,
  }));
}

export async function updateInquiryStatus(args: {
  inquiryId: string;
  status: "new" | "in_progress" | "answered" | "closed" | "spam";
  staffId: string;
  note?: string | null;
}): Promise<void> {
  await pool().query(
    `UPDATE inquiries
        SET status = $2::inquiry_status, handled_by = $3, handled_at = now(),
            staff_note = COALESCE($4, staff_note)
      WHERE id = $1`,
    [args.inquiryId, args.status, args.staffId, args.note ?? null],
  );
}
