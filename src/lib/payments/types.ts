/**
 * Payment adapter contract.
 *
 * Deliberately thin, because the one thing known for certain about the eventual gateway
 * is that it is not known yet. No provider has been confirmed to support this merchant,
 * PKR, or the flow the venue needs, so nothing here assumes a particular API shape.
 *
 * Rules every adapter obeys:
 *   - The amount comes from the server's own `payment_intents` row. An adapter never
 *     takes an amount from the browser.
 *   - A browser redirect back from a provider is NOT proof of payment. Only a verified
 *     webhook, or a human at the venue, moves a payment to `paid`.
 *   - Every webhook is signature-checked and recorded before it is acted on, keyed on the
 *     provider's own event id, so a replay cannot confirm a booking twice.
 */

export type PaymentProviderId = "pay_at_venue" | "bank_transfer" | "simulator" | (string & {});

export interface PaymentSubject {
  kind: "booking" | "cafe_order" | "event_registration";
  id: string;
  reference: string;
  /** Server-decided. The single source of truth for what is owed. */
  amountMinor: number;
  currency: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  description: string;
}

export interface InitiateResult {
  intentId: string;
  /**
   * What the customer does next.
   *  - `none`: nothing to do online; the booking is confirmed and paid at the venue.
   *  - `instructions`: show them something to act on (bank details to transfer to).
   *  - `redirect`: send them to the provider.
   */
  action: "none" | "instructions" | "redirect";
  redirectUrl?: string;
  instructions?: PaymentInstructions;
  /**
   * Does this method confirm the booking straight away?
   * False for anything a human still has to check.
   */
  confirmsImmediately: boolean;
  /** Payment status the booking should take on right now. */
  paymentStatus: "unpaid" | "pending_verification" | "paid";
}

export interface PaymentInstructions {
  heading: string;
  body: string;
  details: Array<{ label: string; value: string }>;
  /** What the customer must do for this to complete. */
  nextStep: string;
}

export interface WebhookVerification {
  ok: boolean;
  reason?: string;
  providerEventId?: string;
  eventType?: string;
  payload?: unknown;
}

export interface PaymentAdapter {
  id: PaymentProviderId;
  /** Shown on the checkout page. */
  label: string;
  description: string;
  /** False when credentials or configuration are missing; the option is then hidden. */
  isEnabled(): boolean;
  /**
   * Production-readiness. An adapter can be enabled for development and still not be
   * something that may take real money -- the simulator, for instance.
   */
  isProductionSafe(): boolean;
  initiate(subject: PaymentSubject, intentId: string): Promise<InitiateResult>;
  /**
   * Verify an inbound webhook's signature. Adapters with no webhook return ok: false, so
   * a forged callback to an unused endpoint cannot do anything.
   */
  verifyWebhook?(request: { rawBody: string; headers: Headers }): Promise<WebhookVerification>;
  /** Only implemented where the provider actually supports programmatic refunds. */
  refund?(intent: { providerReference: string; amountMinor: number }): Promise<{
    ok: boolean;
    providerReference?: string;
    reason?: string;
  }>;
}
