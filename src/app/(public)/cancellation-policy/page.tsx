import type { Metadata } from "next";
import { PolicyPage, PolicySection } from "@/components/ui/policy-page";
import { loadBookingDefaults } from "@/server/booking-service";

export const metadata: Metadata = {
  title: "Cancellation policy",
  description: "How cancellations, reschedules and no-shows work at MadHaus.",
  alternates: { canonical: "/cancellation-policy" },
};

/**
 * The cancellation policy.
 *
 * The cutoff hours are read from the same settings the booking engine enforces, so the
 * published policy and the code can never drift apart.
 */
export default async function CancellationPolicyPage() {
  const defaults = await loadBookingDefaults();

  return (
    <PolicyPage
      title="Cancellations"
      lead="What happens if your plans change."
      updated="1 October 2026"
    >
      <PolicySection heading="Cancelling a court booking">
        <p>
          You can cancel a confirmed court booking yourself, online, up to{" "}
          <strong>{defaults.cancellationCutoffHours} hours</strong> before your session starts. Open
          your booking from the link we sent you and use the cancel button.
        </p>
        <p>
          Inside that window the online option closes, because the slot is unlikely to be
          rebooked at short notice. Call the venue — they can still cancel it for you and will
          decide what is fair.
        </p>
        <p>
          The cancellation terms that apply to your booking are the ones that were in force when
          you made it. They are saved with the booking, so a later change to this policy does not
          affect a booking you have already made.
        </p>
      </PolicySection>

      <PolicySection heading="Rescheduling">
        <p>
          Reschedules follow the same {defaults.rescheduleCutoffHours}-hour window. Moving a
          booking is subject to the new slot being free, and the price is recalculated for the new
          time — moving from an off-peak slot to a peak one costs the difference.
        </p>
      </PolicySection>

      <PolicySection heading="Refunds">
        <p>
          If you paid at the venue there is nothing to refund: you simply have not paid. If you
          paid in advance and cancelled within the window above, the venue will refund you through
          the method you paid with.
        </p>
        <p>
          <strong>Refund timescales have not been confirmed by the venue and are not stated
          here.</strong> They depend on the payment method and are to be filled in before this
          policy is published.
        </p>
      </PolicySection>

      <PolicySection heading="If we cancel">
        <p>
          Occasionally the venue has to cancel — weather, a fault with the court, or maintenance
          that cannot wait. If that happens you will be contacted directly, and anything you have
          paid is refunded in full.
        </p>
      </PolicySection>

      <PolicySection heading="No-shows">
        <p>
          If nobody arrives for a booked slot, the booking is marked as a no-show. What the venue
          does about repeated no-shows is at its discretion and has not been set as a rule here.
        </p>
      </PolicySection>

      <PolicySection heading="Requests that are not yet bookings">
        <p>
          Some things on this site are requests rather than bookings — a café table request, for
          example, or a booking paid by bank transfer that a member of staff has not yet verified.
          A request is not held until the venue confirms it, and there is nothing to cancel until
          then. Your booking page always states plainly which of the two you have.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
