import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { pgSslOptions } from "@/lib/db/ssl";
import { prepareMenuImport } from "@/lib/domain/menu-import";
import { validateMenuPhoto, validateMenuPrice } from "@/lib/domain/menu";

// Session-local copies of the migrated tables. All writes roll back; venue data is untouched.
const state = vi.hoisted(() => ({ client: undefined as unknown as Client }));
vi.mock("@/lib/db/client", () => ({
  pool: () => state.client,
  withTransaction: async (work: (client: Client) => Promise<unknown>) => {
    await state.client.query("SAVEPOINT menu_write");
    try {
      const result = await work(state.client);
      await state.client.query("RELEASE SAVEPOINT menu_write");
      return result;
    } catch (error) {
      await state.client.query("ROLLBACK TO SAVEPOINT menu_write");
      await state.client.query("RELEASE SAVEPOINT menu_write");
      throw error;
    }
  },
}));
vi.mock("@/server/booking-service", () => ({ audit: vi.fn() }));
import { deleteMenuItem, listMenuItemsForAdmin, saveMenuItem } from "@/server/venue-config-service";
import { importLegacyMenu } from "@/server/menu-import-service";
import { getMenuItems } from "@/server/public-queries";

const base = { name: "Test dish", category: "Mains", basePriceMinor: 95000,
  isAvailable: true, sortOrder: 0, staffId: "00000000-0000-0000-0000-000000000001" };

describe("unified menu lifecycle (isolated PostgreSQL tables)", () => {
  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL!;
    state.client = new Client({ connectionString, ...pgSslOptions(connectionString) });
    await state.client.connect();
    await state.client.query("BEGIN");
    await state.client.query("CREATE TEMP TABLE audit_log (actor_type text,action text,entity_type text,entity_id text,diff jsonb) ON COMMIT DROP");
    await state.client.query("CREATE TEMP TABLE menu_items (LIKE public.menu_items INCLUDING ALL) ON COMMIT DROP");
    await state.client.query("CREATE TEMP TABLE menu_item_variants (LIKE public.menu_item_variants INCLUDING ALL) ON COMMIT DROP");
  });
  beforeEach(async () => { await state.client.query("TRUNCATE menu_item_variants,menu_items"); });
  afterAll(async () => { await state.client.query("ROLLBACK"); await state.client.end(); });

  it("keeps an unpriced draft private, publishes its full content, then archives without deleting", async () => {
    const { id } = await saveMenuItem({ ...base, basePriceMinor: null, publicationStatus: "draft", description: "Kitchen description" });
    expect(await getMenuItems()).toEqual([]);
    await expect(saveMenuItem({ ...base, id, basePriceMinor: null, publicationStatus: "published" })).rejects.toThrow("Set a price");
    await saveMenuItem({ ...base, id, publicationStatus: "published", description: "Freshly cooked",
      dietaryTags: ["Vegetarian"], allergenNote: "Contains dairy", isFeatured: true });
    expect(await getMenuItems({ featuredOnly: true })).toEqual([expect.objectContaining({
      name: "Test dish", description: "Freshly cooked", dietaryTags: ["Vegetarian"],
      allergenNote: "Contains dairy", priceLabel: "Rs 950", isFeatured: true,
    })]);
    await deleteMenuItem(id, base.staffId);
    expect(await getMenuItems()).toEqual([]);
    expect(await listMenuItemsForAdmin()).toEqual([expect.objectContaining({id, publicationStatus:"archived"})]);
  });

  it("features only published selected items and keeps sold-out items visible", async () => {
    await saveMenuItem({ ...base, isFeatured: false, publicationStatus: "published" });
    await saveMenuItem({ ...base, name: "Featured dish", isFeatured: true, isAvailable: false, publicationStatus: "published" });
    await saveMenuItem({ ...base, name: "Private special", isFeatured: true, publicationStatus: "draft" });
    expect(await getMenuItems({featuredOnly:true,limit:1})).toEqual([expect.objectContaining({name:"Featured dish",isAvailable:false})]);
    expect(await getMenuItems()).toHaveLength(2);
  });

  it("uses size prices for the minimum quote and retains variant identity across edits", async () => {
    const {id} = await saveMenuItem({...base,variants:[{name:"Small",priceMinor:75000},{name:"Large",priceMinor:115000}]});
    const original = (await listMenuItemsForAdmin())[0];
    expect((await getMenuItems())[0]).toMatchObject({priceLabel:"From Rs 750",variants:[
      {name:"Small",priceLabel:"Rs 750"},{name:"Large",priceLabel:"Rs 1,150"},
    ]});
    await saveMenuItem({...base,id,variants:original.variants.map(v => ({...v,priceMinor:v.priceMinor+1000}))});
    expect((await listMenuItemsForAdmin())[0].variants.map(v=>v.id)).toEqual(original.variants.map(v=>v.id));
    expect((await getMenuItems())[0].priceLabel).toBe("From Rs 760");
  });

  it("rolls back an edit trying to attach another item's size", async () => {
    const {id} = await saveMenuItem({...base});
    await saveMenuItem({...base,name:"Another dish",variants:[{name:"Large",priceMinor:120000}]});
    const other = (await listMenuItemsForAdmin()).find(item=>item.name==="Another dish")!;
    await expect(saveMenuItem({...base,id,name:"Wrong edit",variants:other.variants})).rejects.toThrow("does not belong");
    expect((await listMenuItemsForAdmin()).find(item=>item.id===id)?.name).toBe("Test dish");
  });

  it("imports matching details once while preserving prices, and keeps CMS-only products private", async () => {
    const {id} = await saveMenuItem({...base,isAvailable:false});
    // Simulate a record created by the legacy Admin before this transition.
    await state.client.query("UPDATE menu_items SET admin_managed=false WHERE id=$1",[id]);
    const items = prepareMenuImport([
      {_id:"cms-existing",slug:"test-dish",title:"Imported dish",category:"Other category",description:"CMS description"},
      {_id:"cms-new",slug:"new-dish",title:"New dish",category:"Mains",description:"New CMS dish"},
    ]);
    expect((await importLegacyMenu(items,state.client,false)).imported).toBe(0);
    expect(await listMenuItemsForAdmin()).toHaveLength(1);
    expect((await importLegacyMenu(items,state.client,true)).imported).toBe(2);
    const rows = await listMenuItemsForAdmin();
    expect(rows.find(row=>row.id===id)).toMatchObject({name:"Imported dish",basePriceMinor:95000,isAvailable:false,category:"Mains"});
    expect(rows.find(row=>row.slug==="new-dish")).toMatchObject({basePriceMinor:null,publicationStatus:"draft",isAvailable:false});
    expect(await getMenuItems()).toHaveLength(1);
    await saveMenuItem({...base,id,name:"Staff edit",description:"Staff description"});
    expect((await importLegacyMenu(items,state.client,true)).imported).toBe(0);
    expect((await listMenuItemsForAdmin()).find(row=>row.id===id)).toMatchObject({name:"Staff edit",description:"Staff description"});
  });

  it("protects an Admin edit made before the first CMS import", async () => {
    const {id} = await saveMenuItem({...base,description:"Already edited by staff"});
    const items = prepareMenuImport([{_id:"cms-other",slug:"test-dish",title:"Old CMS title",category:"Mains",description:"Old CMS text"}]);
    expect((await importLegacyMenu(items,state.client,true)).imported).toBe(0);
    expect((await listMenuItemsForAdmin()).find(row=>row.id===id)).toMatchObject({name:"Test dish",description:"Already edited by staff"});
  });

  it("preserves the photo reference on ordinary edits and removes it only explicitly", async () => {
    const image = {assetId:"image-test",url:"https://cdn.sanity.io/images/test/production/test.jpg",alt:"Dish on a plate"};
    const {id} = await saveMenuItem({...base,image});
    await saveMenuItem({...base,id,description:"New text"});
    expect((await listMenuItemsForAdmin())[0].image).toEqual(image);
    await saveMenuItem({...base,id,image:null});
    expect((await listMenuItemsForAdmin())[0].image).toBeNull();
  });
});

describe("menu import and photo validation", () => {
  it("preserves imported editorial content and Sanity image assets without inventing prices", () => {
    const [item] = prepareMenuImport([{_id:"legacy-id",slug:"sandwich",title:"Club sandwich",category:"Mains",
      description:"Kitchen text",dietaryTags:["Spicy"],image:{alt:"Club sandwich",asset:{_id:"image-123",url:"https://cdn.sanity.io/images/project/production/123.jpg"}}}]);
    expect(item).toMatchObject({sourceId:"legacy-id",slug:"sandwich",description:"Kitchen text",image:{assetId:"image-123"}});
    expect(item).not.toHaveProperty("basePriceMinor");
  });
  it("rejects duplicate slugs instead of silently combining two dishes", () => {
    const item = {_id:"a",slug:"dish",title:"Dish",category:"Mains"};
    expect(()=>prepareMenuImport([item,{...item,_id:"b"}])).toThrow("Multiple Sanity items");
  });
  it("requires complete published import records", () => {
    expect(()=>prepareMenuImport([{_id:"a",title:"New dish",slug:"new-dish"}])).toThrow("category");
  });
  it("allows an unpriced draft but rejects unsafe and fractional money", () => {
    expect(()=>validateMenuPrice(null,"draft")).not.toThrow();
    for (const amount of [-1,0.5,NaN,Infinity,2147483648]) expect(()=>validateMenuPrice(amount,"published")).toThrow();
    expect(()=>validateMenuPrice(null,"published")).toThrow();
  });
  it("rejects spoofed file types, empty files and oversized photos", () => {
    expect(()=>validateMenuPhoto(new TextEncoder().encode('<svg></svg>'),"image/png")).toThrow();
    expect(()=>validateMenuPhoto(new Uint8Array(),"image/jpeg")).toThrow();
    expect(()=>validateMenuPhoto(new Uint8Array(2*1024*1024+1),"image/png")).toThrow();
    expect(()=>validateMenuPhoto(new Uint8Array([255,216,255,0]),"image/jpeg")).not.toThrow();
  });
});
