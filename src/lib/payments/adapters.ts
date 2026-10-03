import { serverEnv, isPaymentProviderEnabled } from "@/lib/env";
import type { PaymentAdapter, PaymentSubject } from "./types";

/**
 * The two ways to pay at MadHaus.
 *
 * There is no card gateway and no bank-transfer flow, by design. The venue takes money in
 * exactly two ways: cash or card at the desk, or a manual JazzCash transfer that a member
 * of staff checks against the account before the booking is confirmed.
 *
 * Nothing here ever confirms a booking on its own. JazzCash in particular is a *claim*
 * until a person has looked at the statement -- see `submitPaymentProof` and
 * `reviewPaymentProof` in server/payment-service.ts.
 */

/** Cash or card at the desk. Confirms the booking; money is collected on arrival. */
const payAtVenue: PaymentAdapter = {
  id: "pay_at_venue",
  label: "Pay at the venue",
  description: "Pay by cash or card when you arrive. Nothing to do now.",
  isEnabled: () => isPaymentProviderEnabled("pay_at_venue"),
  isProductionSafe: () => true,
  async initiate(_subject, intentId) {
    return {
      intentId,
      action: "none",
      // The court is genuinely reserved. It is simply not paid for yet, and the two
      // statuses are separate for exactly this reason.
      confirmsImmediately: true,
      paymentStatus: "unpaid",
    };
  },
};

/**
 * JazzCash, paid by hand.
 *
 * The customer is shown the venue's account details and transfers the amount themselves,
 * then submits the transaction reference. No API, no merchant integration, no webhook --
 * which is the point: it needs nothing from JazzCash beyond an account the venue already
 * has.
 *
 * It confirms nothing. The booking stays pending until a member of staff matches the
 * reference against the account.
 */
const jazzCash: PaymentAdapter = {
  id: "jazzcash",
  label: "JazzCash",
  description:
    "Transfer to the venue's JazzCash account, then send us the transaction ID. We confirm once it lands.",
  isEnabled: () => isPaymentProviderEnabled("jazzcash"),
  isProductionSafe: () => true,
  async initiate(subject: PaymentSubject, intentId) {
    const env = serverEnv();
    return {
      intentId,
      action: "instructions",
      // Deliberately false. A transfer the venue has not seen is not a payment.
      confirmsImmediately: false,
      paymentStatus: "unpaid",
      instructions: {
        heading: "Pay by JazzCash",
        body: `Send ${subject.currency} ${(subject.amountMinor / 100).toLocaleString("en-PK")} to the account below, then tell us the transaction ID.`,
        details: [
          { label: "Account title", value: env.JAZZCASH_ACCOUNT_TITLE ?? "—" },
          { label: "JazzCash number", value: env.JAZZCASH_ACCOUNT_NUMBER ?? "—" },
          { label: "Amount", value: `${subject.currency} ${(subject.amountMinor / 100).toLocaleString("en-PK")}` },
          { label: "Reference", value: subject.reference },
        ],
        nextStep:
          "Once you have transferred, enter the transaction ID on this page. Your court is held while we check it, and you will hear from us either way.",
      },
    };
  },
};

/**
 * Development simulator.
 *
 * Exists so the booking flow can be exercised end to end with no merchant account. It
 * refuses to load in production (`serverEnv` throws if it is listed there), because a
 * simulated success screen shown to a real customer would be a lie.
 */
const simulator: PaymentAdapter = {
  id: "simulator",
  label: "Simulated payment (development only)",
  description: "Not a real payment. Marks the booking paid so the flow can be tested.",
  isEnabled: () => serverEnv().NODE_ENV !== "production" && isPaymentProviderEnabled("simulator"),
  isProductionSafe: () => false,
  async initiate(_subject, intentId) {
    return {
      intentId,
      action: "none",
      confirmsImmediately: true,
      paymentStatus: "paid",
    };
  },
};

const ALL_ADAPTERS: PaymentAdapter[] = [payAtVenue, jazzCash, simulator];

/** Adapters offered to a customer, in the configured order. */
export function enabledAdapters(): PaymentAdapter[] {
  const order = serverEnv().PAYMENT_PROVIDERS;
  return ALL_ADAPTERS.filter((adapter) => adapter.isEnabled()).sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
  );
}

export function getAdapter(id: string): PaymentAdapter | null {
  const adapter = ALL_ADAPTERS.find((candidate) => candidate.id === id);
  return adapter && adapter.isEnabled() ? adapter : null;
}

/** Listed on the staff dashboard so it is obvious what is real and what is not. */
export function adapterReadiness(): Array<{
  id: string;
  label: string;
  enabled: boolean;
  productionSafe: boolean;
}> {
  return ALL_ADAPTERS.map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
    enabled: adapter.isEnabled(),
    productionSafe: adapter.isProductionSafe(),
  }));
}
