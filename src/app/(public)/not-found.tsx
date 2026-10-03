import { ButtonLink } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/ui/section";

export default function NotFound() {
  return (
    <Section surface="dark" spacing="loose">
      <div className="shell shell-content text-center">
        <p className="text-eyebrow font-display mb-6 text-lime uppercase">404</p>
        <SectionHeading className="mx-auto max-w-[18ch]">
          Nothing on this <span className="text-lime">court.</span>
        </SectionHeading>
        <p className="text-lead mx-auto mt-6 max-w-lg text-grey-300">
          That page does not exist. If you were looking for a booking, check the link we sent you —
          the full link, including the part after the question mark, is what opens it.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink href="/" size="lg">
            Back to the start
          </ButtonLink>
          <ButtonLink href="/book" size="lg" variant="secondary">
            Book a court
          </ButtonLink>
        </div>
      </div>
    </Section>
  );
}
