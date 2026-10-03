/**
 * Notification adapters.
 *
 * Every channel is optional and off by default. The invariant that matters: a booking is
 * never rolled back because a message failed to send. Messages are rows in an outbox,
 * written in the same transaction as the booking, and delivered afterwards with retries.
 */

export type Channel = "email" | "sms" | "whatsapp";

export interface RenderedMessage {
  subject: string;
  /** Plain text. Every channel can carry this; only email uses the HTML version. */
  text: string;
  html?: string;
  /**
   * Files to attach. Used for the calendar invite on a confirmation, so the customer gets
   * the booking in their calendar without having to come back to the site for it.
   */
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

export interface DeliveryResult {
  ok: boolean;
  /** Provider's id for the message, when there is one. */
  providerReference?: string;
  /** Set when the failure is permanent and retrying would be pointless. */
  permanent?: boolean;
  reason?: string;
}

export interface NotificationAdapter {
  channel: Channel;
  /** Venue-addressed messages resolve their recipient at send time, not at queue time. */
  resolveRecipient?(recipient: string, audience: "customer" | "venue"): string | null;
  /** False when credentials are missing. A disabled adapter is skipped, not failed. */
  isEnabled(): boolean;
  send(args: { recipient: string; message: RenderedMessage }): Promise<DeliveryResult>;
}
