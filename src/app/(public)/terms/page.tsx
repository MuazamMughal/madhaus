import type { Metadata } from "next";
import { PolicyPage, PolicySection } from "@/components/ui/policy-page";
import { loadBookingDefaults } from "@/server/booking-service";
import { getSiteSettings } from "@/lib/content";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms that apply when you book with MadHaus.",
  alternates: { canonical: "/terms" },
};

export default async function TermsPage() {
  const [settings, defaults] = await Promise.all([getSiteSettings(), loadBookingDefaults()]);

  return (
    <PolicyPage title="Terms" lead="The rules of booking with us." updated="1 October 2026">
      <PolicySection heading="Who you are contracting with">
        <p>
          Bookings made through this site are with {settings.brandName}, {settings.city}, Pakistan.{" "}
          <strong>The registered business name and details still need to be supplied by the
          venue.</strong>
        </p>
      </PolicySection>

      <PolicySection heading="Making a booking">
        <p>
          Choosing a slot puts a temporary hold on the court for{" "}
          <strong>{defaults.holdMinutes} minutes</strong> while you finish. A hold is not a
          booking: if you do not complete checkout in time, the slot goes back on the board and
          may be taken by someone else.
        </p>
        <p>
          Your booking is confirmed when the confirmation page says so. If your chosen payment
          method needs a member of staff to check something — a bank transfer receipt, for
          instance — you have a <em>request</em>, and it is not confirmed until the venue says so.
        </p>
        <p>
          Online bookings close {defaults.leadTimeMinutes} minutes before a session starts. Inside
          that window, call the venue.
        </p>
      </PolicySection>

      <PolicySection heading="Prices">
        <p>
          Prices are shown in Pakistani rupees and are worked out by the venue&apos;s system, not by
          your browser. The price you are shown before you confirm is the price that applies, and
          it is saved with your booking. If a rate changes while you are booking, you will be shown
          the new total and asked to accept it rather than charged quietly.
        </p>
      </PolicySection>

      <PolicySection heading="Sharing the courts">
        <p>
          The venue has one padel court and one multipurpose court. Football and cricket use the
          same multipurpose court, so only one of them can be booked at a time. The system enforces
          this — you will never be sold a slot that someone else already has.
        </p>
      </PolicySection>

      <PolicySection heading="Cancellations">
        <p>
          Covered in full by the <a href="/cancellation-policy">cancellation policy</a>, which forms
          part of these terms.
        </p>
      </PolicySection>

      <PolicySection heading="Using the venue">
        <p>
          Play sensibly and follow the instructions of the venue&apos;s staff. The venue may refuse
          entry or end a session for unsafe or abusive behaviour.{" "}
          <strong>Specific house rules, age limits, footwear requirements and liability terms
          still need to be supplied by the venue and are not set out here.</strong>
        </p>
      </PolicySection>

      <PolicySection heading="Changes">
        <p>
          These terms may change. The version that applies to your booking is the one that was in
          force when you made it, and the relevant terms are saved with the booking.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
