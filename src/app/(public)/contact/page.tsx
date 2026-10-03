import type { Metadata } from "next";
import { ContactForm } from "@/components/marketing/contact-form";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { whatsappClickToChatUrl } from "@/lib/domain/phone";
import { getOpeningHoursTable } from "@/server/public-queries";
import { getSiteSettings } from "@/lib/content";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return {
    title: "Contact",
    description: `Get in touch with ${settings.brandName} in ${settings.city} — directions, opening hours and enquiries.`,
    alternates: { canonical: "/contact" },
  };
}

/**
 * /contact
 *
 * Every contact channel here is rendered only when the venue has actually supplied it. A
 * placeholder phone number somebody might ring is worse than no phone number at all.
 */
export default async function ContactPage() {
  const [settings, hours] = await Promise.all([getSiteSettings(), getOpeningHoursTable()]);

  const channels = [
    settings.phone && { label: "Phone", value: settings.phone, href: `tel:${settings.phone}` },
    settings.whatsappPhone && {
      label: "WhatsApp",
      value: settings.whatsappPhone,
      href: whatsappClickToChatUrl(settings.whatsappPhone),
    },
    settings.email && { label: "Email", value: settings.email, href: `mailto:${settings.email}` },
  ].filter((entry): entry is { label: string; value: string; href: string } => Boolean(entry));

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Say hello."
        lead={`We are in ${settings.city}. Drop a message and someone will come back to you.`}
      />

      <Section surface="dark" spacing="tight">
        <div className="shell grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <div className="space-y-10">
            <div>
              <h2 className="text-eyebrow font-display mb-4 uppercase">Where we are</h2>
              {settings.addressLines ? (
                <address className="text-lead not-italic">
                  {settings.addressLines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </address>
              ) : (
                <p className="border border-dashed border-charcoal-line p-4 text-sm text-grey-300">
                  The full street address has not been published yet. Send a message below and the
                  venue will send you directions.
                </p>
              )}
              {settings.mapsUrl && (
                <a
                  href={settings.mapsUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-display mt-4 inline-flex min-h-12 items-center border-2 border-ivory px-6 text-sm uppercase transition hover:bg-ivory hover:text-charcoal"
                >
                  Get directions
                </a>
              )}
            </div>

            {channels.length > 0 && (
              <div>
                <h2 className="text-eyebrow font-display mb-4 uppercase">Reach us</h2>
                <ul className="divide-y divide-charcoal-line border-y border-charcoal-line">
                  {channels.map((channel) => (
                    <li key={channel.label} className="flex justify-between gap-4 py-3">
                      <span className="text-grey-400">{channel.label}</span>
                      <a
                        href={channel.href}
                        {...(channel.label === "WhatsApp"
                          ? { target: "_blank", rel: "noreferrer noopener" }
                          : {})}
                        className="underline decoration-lime decoration-2 underline-offset-4"
                      >
                        {channel.value}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h2 className="text-eyebrow font-display mb-4 uppercase">Opening hours</h2>
              <dl className="divide-y divide-charcoal-line border-y border-charcoal-line">
                {hours.map((row) => (
                  <div key={row.day} className="flex justify-between gap-4 py-3 text-sm">
                    <dt>{row.day}</dt>
                    <dd className={row.isClosed ? "text-grey-400" : ""} data-numeric="">
                      {row.label}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="border border-charcoal-line p-6 sm:p-8">
            <h2 className="text-headline mb-6">Send a message</h2>
            <ContactForm />
          </div>
        </div>
      </Section>
    </>
  );
}
