import type { PoolClient } from "pg";
import type { prepareMenuImport } from "@/lib/domain/menu-import";

/** Caller wraps this in a transaction, including preview rollbacks. */
export async function importLegacyMenu(
  items: ReturnType<typeof prepareMenuImport>,
  db: Pick<PoolClient, "query">,
  apply: boolean,
) {
  const outcomes: Array<{ name: string; outcome: "preserved" | "merged" | "draft" }> = [];
  // One importer at a time. All documents either migrate together or roll back.
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('sanity-menu-import', 1))");
  const existing = (await db.query('SELECT id,slug,sanity_source_id,admin_managed FROM menu_items FOR UPDATE')).rows;
  let imported = 0;
  for (const item of items) {
    if (existing.some(row => row.sanity_source_id === item.sourceId)) {
      outcomes.push({ name: item.name, outcome: "preserved" });
      continue;
    }
    const match = existing.find(row => row.slug === item.slug);
    if (match?.admin_managed) {
      outcomes.push({ name: item.name, outcome: "preserved" });
      continue;
    }
    if (match?.sanity_source_id) throw new Error(`Slug ${item.slug} is already linked to another Sanity document.`);
    outcomes.push({ name: item.name, outcome: match ? "merged" : "draft" });
    if (!apply) continue;
    const content = [item.name,item.description,JSON.stringify(item.dietaryTags),item.allergenNote,
      item.image ? JSON.stringify(item.image) : null,item.isFeatured,item.sourceId];
    let id: string;
    if (match) {
      // A matching DB item retains its category, price, variants, status and availability.
      await db.query(`UPDATE menu_items SET name=$1,description=$2,dietary_tags=$3::jsonb,
        allergen_note=$4,image=$5::jsonb,is_featured=$6,sanity_source_id=$7,admin_managed=true WHERE id=$8`, [...content,match.id]);
      id = match.id;
    } else {
      const created = await db.query(`INSERT INTO menu_items
        (name,description,dietary_tags,allergen_note,image,is_featured,sanity_source_id,slug,category,
          base_price_minor,publication_status,is_available,is_orderable,admin_managed)
        VALUES ($1,$2,$3::jsonb,$4,$5::jsonb,$6,$7,$8,$9,NULL,'draft',false,true,true) RETURNING id`,
        [...content,item.slug,item.category]);
      id = created.rows[0].id;
    }
    await db.query(`INSERT INTO audit_log (actor_type,action,entity_type,entity_id,diff)
      VALUES ('system','menu.imported','menu_item',$1,$2::jsonb)`, [id,JSON.stringify({sourceId:item.sourceId,slug:item.slug,created:!match})]);
    existing.push({ id,slug:item.slug,sanity_source_id:item.sourceId });
    imported++;
  }
  return { imported, outcomes };
}
