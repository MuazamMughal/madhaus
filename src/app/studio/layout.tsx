import { requirePermission } from "@/lib/auth/permissions";
import { isSanityConfigured } from "@/lib/env";

/**
 * Studio shell.
 *
 * The authorisation check lives HERE rather than in the page, for two reasons:
 *
 *   1. The page has to be a Client Component. Importing `sanity.config` from a Server
 *      Component pulls the whole Studio into the RSC module graph, where `swr` resolves
 *      through the `react-server` export condition and has no default export — the build
 *      fails outright. Keeping the config on the client side of the boundary avoids that.
 *   2. A layout is the right place for it anyway: it covers every route under /studio,
 *      including ones the Studio adds for itself.
 *
 * `proxy.ts` turns away anyone with no session cookie before this renders; this is the
 * check that actually decides, because reception staff have a valid session and no
 * business editing the site.
 */
export default async function StudioLayout({ children }: LayoutProps<"/studio">) {
  await requirePermission("content.edit");

  if (!isSanityConfigured()) {
    return (
      <div data-surface="dark" className="surface min-h-screen px-6 py-20">
        <div className="mx-auto max-w-xl">
          <h1 className="text-headline">Sanity is not configured</h1>
          <p className="mt-6 text-grey-300">
            The Studio needs a Sanity project before it can load. Create one at sanity.io/manage,
            then set these in your environment:
          </p>
          <pre className="mt-6 overflow-x-auto border border-charcoal-line p-4 text-sm">
            {`NEXT_PUBLIC_SANITY_PROJECT_ID=...
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_READ_TOKEN=...      # for draft previews
SANITY_REVALIDATE_SECRET=...   # for the publish webhook`}
          </pre>
          <p className="mt-6 text-sm text-grey-400">
            Until then the site runs on the labelled sample content in{" "}
            <code>src/lib/content/sample.ts</code>, and every page shows the placeholder banner.
          </p>
        </div>
      </div>
    );
  }

  // The Studio renders its own full-page application, so it takes the viewport whole —
  // no site header, footer or styles competing with it.
  return <div className="min-h-screen">{children}</div>;
}
