import type { Metadata } from "next";
import Image from "next/image";
import { ButtonLink } from "@/components/ui/button";
import { MediaPanel } from "@/components/ui/media-panel";
import { PageHero } from "@/components/ui/page-hero";
import { Reveal } from "@/components/ui/reveal";
import { Lead, Section, SectionHeading } from "@/components/ui/section";
import { SportCards } from "@/components/marketing/sport-cards";
import { getHoursLabel, getPublicSports } from "@/server/public-queries";
import { getSiteSettings } from "@/lib/content";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return {
    title: "The arena",
    description: `Padel and cricket courts at ${settings.brandName} in ${settings.city}, floodlit and open until 3am. Check availability and book online.`,
    alternates: { canonical: "/arena" },
  };
}

/**
 * /arena
 *
 * The overview page. Its main job beyond selling the courts is to explain the resource
 * model honestly: there are two physical courts, and one of them does more than one job.
 */
export default async function ArenaPage() {
  const [sports, hoursLabel] = await Promise.all([getPublicSports(), getHoursLabel()]);

  // Group by the physical court, because that is what actually constrains a booking.
  const sharedSports = sports.filter((sport) => sport.courtNote?.includes("shared with"));

  return (
    <>
      <PageHero
        eyebrow="The arena"
        title="Two courts."
        accent="Open till 3am."
        lead={`One dedicated padel court and one floodlit multipurpose court${hoursLabel ? `, running ${hoursLabel} every night` : ""}. Pick a game and get on it.`}
        artwork={
          <div className="relative mx-auto hidden aspect-square w-full max-w-lg lg:block" aria-hidden="true">
            <Image
              src="/images/arena/bat-and-padel.webp"
              alt=""
              fill
              preload
              sizes="(min-width: 1024px) 45vw, 384px"
              className="object-contain"
            />
          </div>
        }
      >
        <ButtonLink href="/book" size="lg">
          Check availability
        </ButtonLink>
      </PageHero>

      <Section surface="dark" index="01" eyebrow="What you can play">
        <SportCards sports={sports} />
      </Section>

      {/* The shared-court rule, given a section of its own because it is the single
          thing most likely to confuse someone booking. */}
      {sharedSports.length > 1 && (
        <Section surface="lime" index="02" eyebrow="How the courts work">
          <div className="shell grid gap-12 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <SectionHeading className="max-w-[18ch]">
                One court,
                <br />
                two games.
              </SectionHeading>
              <Lead className="mt-6 text-[var(--surface-muted)]">
                {sharedSports.map((sport) => sport.name).join(" and ")} are played on the same
                physical court. Book either one and that time comes off the board for the other —
                there is no way to double-book it, and no way to end up sharing it with another
                group.
              </Lead>
              <p className="mt-6 text-sm">
                The court also needs a short changeover between sports, so the booking system
                leaves a gap when the game before yours was a different one. That gap is why a
                time can show as unavailable even when nothing appears to be booked right then.
              </p>
            </Reveal>

            <Reveal delay={1} className="space-y-4">
              <CourtRow
                name="Padel Court"
                detail="Dedicated. Padel only."
                sports={sports.filter((sport) => !sport.courtNote?.includes("shared with")).map((s) => s.name)}
              />
              <CourtRow
                name="Multipurpose Court"
                detail="Shared. One booking at a time, whichever game it is."
                sports={sharedSports.map((sport) => sport.name)}
              />
            </Reveal>
          </div>
        </Section>
      )}

      <Section surface="dark" index="03" eyebrow="Under the lights">
        <div className="shell grid gap-4 sm:grid-cols-3">
          {(["padel", "pitch", "crowd"] as const).map((motif, index) => (
            <Reveal key={motif} delay={Math.min(index, 3) as 0 | 1 | 2 | 3}>
              <MediaPanel
                image={null}
                aspect={index === 1 ? "portrait" : "landscape"}
                motif={motif}
                sizes="(max-width: 640px) 100vw, 33vw"
                placeholderLabel={`arena — ${motif}`}
              />
            </Reveal>
          ))}
        </div>
      </Section>

      <Section surface="dark" spacing="loose" ariaLabel="Book a court">
        <div className="shell text-center">
          <SectionHeading className="mx-auto max-w-[18ch]">
            Pick a night. <span className="text-lime">Get a game in.</span>
          </SectionHeading>
          <div className="mt-10">
            <ButtonLink href="/book" size="lg">
              Book a court
            </ButtonLink>
          </div>
        </div>
      </Section>
    </>
  );
}

function CourtRow({
  name,
  detail,
  sports,
}: {
  name: string;
  detail: string;
  sports: string[];
}) {
  return (
    <div className="border-2 border-charcoal p-6">
      <h3 className="text-title">{name}</h3>
      <p className="mt-2 text-sm text-[var(--surface-muted)]">{detail}</p>
      {sports.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {sports.map((sport) => (
            <li key={sport} className="font-display bg-charcoal px-3 py-1 text-xs text-lime uppercase">
              {sport}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
