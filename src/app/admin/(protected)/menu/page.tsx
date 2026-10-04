import type { Metadata } from "next";
import { MenuEditor } from "@/components/admin/menu-editor";
import { requirePermission } from "@/lib/auth/permissions";
import { listMenuCategories, listMenuItemsForAdmin } from "@/server/venue-config-service";

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

  const [items, categories] = await Promise.all([
    listMenuItemsForAdmin(),
    listMenuCategories(),
  ]);

  const soldOut = items.filter((item) => !item.isAvailable);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-headline">Menu</h1>
        <p className="mt-2 max-w-2xl text-sm text-grey-400">
          Your complete menu, from photos and descriptions to prices and availability.
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

      <p className="border-l-4 border-lime bg-charcoal-raised p-4 text-sm text-grey-200">
        Manage names, details, photos and prices here. Drafts stay private; published items
        appear on the website. Archive items to hide them while keeping your records.
      </p>

      <MenuEditor items={items} categories={categories} />
    </div>
  );
}
