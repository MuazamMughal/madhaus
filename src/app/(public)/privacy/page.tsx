import type { Metadata } from "next";
import { PolicyPage, PolicySection } from "@/components/ui/policy-page";
import { getSiteSettings } from "@/lib/content";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What MadHaus collects when you book, and what happens to it.",
  alternates: { canonical: "/privacy" },
};

/**
 * Privacy notice.
 *
 * Written to describe what this application genuinely does -- the fields it stores, the
 * fact that passwords and tokens are only ever kept as hashes, that IP addresses on the
 * contact form are hashed, and that no analytics or advertising trackers are loaded.
 * Everything that depends on a business decision is flagged rather than invented.
 */
export default async function PrivacyPage() {
  const settings = await getSiteSettings();

  return (
    <PolicyPage
      title="Privacy"
      lead="What we collect when you book, and what we do with it."
      updated="1 October 2026"
    >
      <PolicySection heading="Who this is about">
        <p>
          This notice covers {settings.brandName} in {settings.city}, Pakistan, and this website.
          <strong> The registered legal entity and a contact for privacy questions still need to
          be supplied by the venue.</strong>
        </p>
      </PolicySection>

      <PolicySection heading="What we collect">
        <p>When you book a court we store:</p>
        <ul>
          <li>your name and mobile number, so the venue can confirm and contact you;</li>
          <li>your email address, if you give us one;</li>
          <li>the details of the booking itself, and what it cost;</li>
          <li>any notes you add.</li>
        </ul>
        <p>
          If you create an account we also store a password, as a one-way hash. The password
          itself is never stored and cannot be recovered from what we keep.
        </p>
        <p>
          When you send a message through the contact form we store the message and a{" "}
          <em>hash</em> of your IP address — enough to spot abuse, not enough to identify you or
          reconstruct where you were.
        </p>
      </PolicySection>

      <PolicySection heading="What we do not do">
        <ul>
          <li>No advertising trackers, no analytics scripts, and no third-party cookies.</li>
          <li>No social media embeds that would report your visit back to another company.</li>
          <li>We do not sell your details, and we do not share them for marketing.</li>
          <li>We never store card numbers. Payment details go straight to the payment provider.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="Cookies">
        <p>
          The only cookies this site sets are the ones that keep you signed in, if you sign in.
          They are strictly necessary, they contain a random token rather than anything about you,
          and there is no consent banner because there is nothing optional to consent to.
        </p>
      </PolicySection>

      <PolicySection heading="Messages we send you">
        <p>
          Messages about a booking — confirmations, changes, cancellations — are part of providing
          the service and are sent whether or not you have opted into anything. Marketing is
          separate, optional, and only sent if you ask for it.
        </p>
      </PolicySection>

      <PolicySection heading="How long we keep it">
        <p>
          Booking records are kept so the venue has an accurate history of what happened. The
          retention period is configurable in the system.{" "}
          <strong>The venue still needs to decide what that period should be, and it is to be
          stated here before launch.</strong>
        </p>
      </PolicySection>

      <PolicySection heading="Your rights">
        <p>
          You can ask for a copy of what we hold about you, ask us to correct it, or ask us to
          delete it, subject to records the venue has to keep. Contact the venue to do any of
          those. <strong>A named contact for these requests still needs to be supplied.</strong>
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
