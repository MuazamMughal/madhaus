import { SiteHeader } from "@/components/ui/site-header";
import { SiteFooter } from "@/components/ui/site-footer";
import { SampleContentBanner } from "@/components/ui/sample-content-banner";
import { MobileActionBar, MobileActionBarSpacer } from "@/components/ui/mobile-action-bar";
import { getNavigation, getSiteSettings } from "@/lib/content";

/**
 * The public website.
 *
 * Everything a visitor sees: the header, the footer, the phone action bar and the
 * sample-content banner. Staff routes sit outside this group, so the dashboard and the
 * Studio get a clean page instead of the marketing chrome.
 */
export default async function PublicLayout({ children }: LayoutProps<"/"> ) {
  const [settings, navigation] = await Promise.all([getSiteSettings(), getNavigation()]);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* First stop for a keyboard user, and it must become visible once focused. */}
      <a
        href="#main"
        className="font-display sr-only-focusable focus:bg-lime focus:text-charcoal fixed top-2 left-2 z-100 px-4 py-3 text-sm uppercase"
      >
        Skip to content
      </a>

      {settings.isSampleContent && <SampleContentBanner />}

      <SiteHeader brandName={settings.brandName} nav={navigation.primary} />

      {/*
        The header is sticky rather than fixed, so it occupies space in normal flow and
        nothing needs to compensate for its height. Full-bleed sections that want to sit
        UNDER it (the hero) pull themselves up instead.
      */}
      <main id="main" className="flex-1">
        {children}
      </main>

      <SiteFooter settings={settings} />

      {/* Phone-only shortcut bar, plus a spacer so it never covers the footer. */}
      <MobileActionBarSpacer />
      <MobileActionBar mapsUrl={settings.mapsUrl} />
    </div>
  );
}
