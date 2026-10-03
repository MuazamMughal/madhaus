import { Resend } from "resend";
import {
  isEmailConfigured,
  isWhatsAppConfigured,
  serverEnv,
  venueEmail,
} from "@/lib/env";
import type { DeliveryResult, NotificationAdapter } from "./types";

/**
 * Delivery adapters.
 *
 * Email is the one that matters here: the whole booking flow runs on it — the venue is
 * alerted to a request, the customer is sent a payment link, the confirmation carries the
 * calendar invite. Without it the system still records everything correctly, but nobody
 * finds out.
 *
 * WhatsApp and SMS remain unimplemented and say so, rather than silently doing nothing.
 */

let resendClient: Resend | null = null;

function resend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(serverEnv().RESEND_API_KEY);
  }
  return resendClient;
}

/**
 * Development sink. Writes the rendered message where it can be read in the server log
 * rather than sending anything, so the whole flow is exercisable with no credentials.
 */
const logAdapter: NotificationAdapter = {
  channel: "email",
  isEnabled: () => serverEnv().NOTIFICATION_CHANNELS.includes("log"),
  resolveRecipient: (recipient, audience) =>
    audience === "venue" ? (venueEmail() ?? "venue@localhost") : recipient,
  async send({ recipient, message }): Promise<DeliveryResult> {
    const attachmentNote = message.attachments?.length
      ? `\n  attachments: ${message.attachments.map((a) => a.filename).join(", ")}`
      : "";
    console.info(
      `[notifications:log] would send to ${redact(recipient)}\n  subject: ${message.subject}${attachmentNote}\n  ${message.text.replace(/\n/g, "\n  ")}`,
    );
    return { ok: true, providerReference: "dev-log" };
  },
};

/**
 * Email via Resend.
 *
 * Venue-addressed messages are resolved to `VENUE_NOTIFICATION_EMAIL` at send time rather
 * than when queued, so changing the venue's inbox does not strand rows already in the
 * outbox.
 */
const emailAdapter: NotificationAdapter = {
  channel: "email",
  isEnabled: () => isEmailConfigured(),
  resolveRecipient(recipient, audience) {
    if (audience === "venue") return venueEmail() ?? null;
    return recipient.includes("@") ? recipient : null;
  },
  async send({ recipient, message }): Promise<DeliveryResult> {
    const env = serverEnv();
    try {
      const { data, error } = await resend().emails.send({
        from: env.EMAIL_FROM!,
        to: recipient,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.attachments?.length
          ? {
              attachments: message.attachments.map((attachment) => ({
                filename: attachment.filename,
                content: attachment.content.toString("base64"),
                contentType: attachment.contentType,
              })),
            }
          : {}),
      });

      if (error) {
        // Resend reports a rejected address or an invalid payload as a 4xx. Retrying those
        // will fail identically, so they are marked permanent and parked for a human.
        const permanent = /invalid|not_found|validation|unprocessable/i.test(
          `${error.name} ${error.message}`,
        );
        return { ok: false, permanent, reason: `${error.name}: ${error.message}` };
      }

      return { ok: true, providerReference: data?.id };
    } catch (error) {
      // Network or timeout: worth retrying.
      return {
        ok: false,
        permanent: false,
        reason: error instanceof Error ? error.message : "Unknown error sending email",
      };
    }
  },
};

/**
 * WhatsApp Business.
 *
 * A wa.me click-to-chat link is NOT this. That opens a draft for the customer to send; it
 * delivers nothing and reports nothing back. Real delivery needs an approved Business API
 * account and templates approved by Meta, neither of which the venue has.
 */
const whatsappAdapter: NotificationAdapter = {
  channel: "whatsapp",
  isEnabled: () => isWhatsAppConfigured(),
  async send(): Promise<DeliveryResult> {
    return {
      ok: false,
      permanent: true,
      reason:
        "The WhatsApp adapter is not implemented. It requires an approved WhatsApp Business API account and approved message templates. See docs/INTEGRATIONS.md.",
    };
  },
};

const smsAdapter: NotificationAdapter = {
  channel: "sms",
  isEnabled: () => serverEnv().NOTIFICATION_CHANNELS.includes("sms"),
  async send(): Promise<DeliveryResult> {
    return {
      ok: false,
      permanent: true,
      reason: "No SMS provider is configured. See docs/INTEGRATIONS.md.",
    };
  },
};

/**
 * Pick the adapter for a channel, falling back to the log sink in development so the flow
 * is exercisable. In production an unconfigured channel returns null and the message is
 * parked rather than silently dropped.
 */
export function adapterForChannel(
  channel: "email" | "sms" | "whatsapp",
): NotificationAdapter | null {
  const real = { email: emailAdapter, sms: smsAdapter, whatsapp: whatsappAdapter }[channel];
  if (real.isEnabled()) return real;
  if (logAdapter.isEnabled()) return { ...logAdapter, channel };
  return null;
}

export function notificationReadiness(): Array<{
  channel: string;
  configured: boolean;
  note: string;
}> {
  const env = serverEnv();
  return [
    {
      channel: "email (Resend)",
      configured: isEmailConfigured(),
      note: isEmailConfigured()
        ? venueEmail()
          ? "Sending. Venue alerts are being delivered."
          : "Sending to customers, but VENUE_NOTIFICATION_EMAIL is not set — the venue will not be told about new requests."
        : "Not configured — set RESEND_API_KEY and EMAIL_FROM. Nothing is being sent.",
    },
    {
      channel: "whatsapp",
      configured: isWhatsAppConfigured(),
      note: "Adapter not implemented. Needs an approved WhatsApp Business API account.",
    },
    {
      channel: "sms",
      configured: env.NOTIFICATION_CHANNELS.includes("sms"),
      note: "No provider chosen.",
    },
  ];
}

/** Never log a full phone number or email address. */
function redact(recipient: string): string {
  if (recipient.includes("@")) {
    const [local, domain] = recipient.split("@");
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return `${recipient.slice(0, 5)}***${recipient.slice(-2)}`;
}
