import type { Metadata } from "next";
import { MenuBrowser } from "@/components/marketing/menu-browser";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { getFeatureFlags, getMenuCategories, getMenuItems } from "@/server/public-queries";
import { getSiteSettings } from "@/lib/content";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return {
    title: "Menu",
    description: `Food and coffee at ${settings.brandName} in ${settings.city}, served until late.`,
    alternates: { canonical: "/menu" },
  };
}

/**
 * /menu
 *
 * Search and filtering run in the browser over a list rendered on the server, so the full
 * menu is in the HTML: it is readable, printable and indexable with JavaScript off, and
 * filtering is instant with it on.
 */
export default async function MenuPage() {
  const [items, categories, flags, settings] = await Promise.all([
    getMenuItems(),
    getMenuCategories(),
    getFeatureFlags(),
    getSiteSettings(),
  ]);

  return (
    <>
      <PageHero
        surface="ivory"
        eyebrow="The café"
        title="Eat well."
        accent="Stay late."
        lead="The kitchen runs as long as the courts do. Come off the court, or just come for the food."
      />

      <Section surface="ivory" spacing="tight">
        <div className="shell">
          {items.length === 0 ? (
            <div className="hatch border border-dashed border-[var(--surface-line)] p-10 text-center">
              <p className="font-display text-title">The menu is being finalised</p>
              <p className="mx-auto mt-3 max-w-md text-sm text-[var(--surface-muted)]">
                We are waiting on the venue&apos;s full menu. In the meantime, give them a call or
                drop in — the kitchen is open until 3am.
              </p>
            </div>
          ) : (
            <MenuBrowser items={items} categories={categories} />
          )}

          {/*
            Allergen information is a safety matter. Nothing is claimed here, and the page
            says plainly where to get a real answer.
          */}
          <div className="mt-14 border-t border-[var(--surface-line)] pt-8">
            <h2 className="text-eyebrow font-display mb-3 uppercase">Allergies and dietary needs</h2>
            <p className="max-w-2xl text-sm text-[var(--surface-muted)]">
              Allergen and dietary information has not been supplied for this menu yet, so none is
              shown. Please speak to the team{settings.phone ? ` or call ${settings.phone}` : ""}{" "}
              before ordering if you have an allergy or a dietary requirement.
            </p>
          </div>

          {flags["cafe.delivery"] !== true && (
            <p className="mt-6 max-w-2xl text-sm text-[var(--surface-muted)]">
              Dine-in and takeaway. Delivery is not available to order through this site.
            </p>
          )}
        </div>
      </Section>
    </>
  );
}
