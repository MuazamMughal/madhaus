import type { Metadata } from "next";
import { MenuEditor } from "@/components/admin/menu-editor";
import { requirePermission } from "@/lib/auth/permissions";
import { listMenuCategories, listMenuItemsForAdmin } from "@/server/venue-config-service";
import { isSanityConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Menu", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /admin/menu
 *
 * Prices and availability for every item. Marking something sold out is one click,
 * because it is what a kitchen does most often and usually mid-service.
 */
export default async function MenuAdminPage() {
  await requirePermission("menu.manage");

  const [items, categories, sanityReady] = await Promise.all([
    listMenuItemsForAdmin(),
    listMenuCategories(),
    Promise.resolve(isSanityConfigured()),
  ]);

  const soldOut = items.filter((item) => !item.isAvailable);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-headline">Menu</h1>
        <p className="mt-2 max-w-2xl text-sm text-grey-400">
          Prices and what is on tonight. The price here is the price charged — the public
          menu reads it from this list.
        </p>
      </header>

      {soldOut.length > 0 && (
        <p className="border-l-4 border-pending bg-charcoal-raised p-4 text-sm">
          <strong className="text-pending">
            {soldOut.length} item{soldOut.length === 1 ? "" : "s"} marked sold out:
          </strong>{" "}
          <span className="text-grey-200">{soldOut.map((item) => item.name).join(", ")}</span>
        </p>
      )}

      {/*
        Where the split sits. Worth stating, because an editor who changes the description
        in Sanity and expects the price to follow will otherwise be confused.
      */}
      <p className="border-l-4 border-lime bg-charcoal-raised p-4 text-sm text-grey-200">
        <strong>Prices and availability live here.</strong>{" "}
        {sanityReady
          ? "Descriptions and photos live in the Studio, matched to each item by its slug."
          : "Descriptions and photos will live in the Studio once Sanity is connected."}{" "}
        That split is deliberate: the price on the website has to be the price the till
        charges.
      </p>

      <MenuEditor items={items} categories={categories} />
    </div>
  );
}
