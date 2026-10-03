"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createInquiry } from "@/server/inquiry-service";
import { InvalidPhoneNumberError } from "@/lib/domain/phone";
import { checkRateLimit } from "@/server/rate-limit";

const schema = z.object({
  kind: z.enum(["general", "private_event", "group_booking", "corporate", "feedback"]),
  name: z.string().trim().min(2, "Please tell us your name.").max(120),
  phone: z.string().trim().min(6, "We need a number to get back to you."),
  email: z.union([z.string().trim().email("That email address does not look right."), z.literal("")]),
  subject: z.string().trim().max(160).optional(),
  message: z.string().trim().min(10, "Tell us a little more.").max(2000),
  // Honeypot. A real person never fills this in; a bot usually does.
  website: z.string().max(0).optional(),
});

export interface ContactState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  reference?: string;
}

export async function submitInquiryAction(
  _previous: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for") ?? "unknown";
  const ip = forwarded.split(",")[0].trim();

  const limit = await checkRateLimit(`inquiry:${ip}`, { tokens: 5, windowSeconds: 900 });
  if (!limit.allowed) {
    return { ok: false, error: "Too many messages just now. Please wait a few minutes." };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }

  // Honeypot tripped. Report success so a bot learns nothing, but store nothing.
  if (parsed.data.website) {
    return { ok: true, reference: "—" };
  }

  try {
    const { reference } = await createInquiry({
      kind: parsed.data.kind,
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email === "" ? null : parsed.data.email,
      subject: parsed.data.subject ?? null,
      message: parsed.data.message,
      ip,
    });
    return { ok: true, reference };
  } catch (error) {
    if (error instanceof InvalidPhoneNumberError) {
      return { ok: false, error: "Please check the highlighted fields.", fieldErrors: { phone: error.message } };
    }
    console.error("[contact] inquiry failed:", error);
    return { ok: false, error: "We could not send that. Please try again." };
  }
}
