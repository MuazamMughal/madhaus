"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import {
  deleteMenuItemAction, saveMenuItemAction, toggleMenuAvailabilityAction, type ConfigState,
} from "@/app/admin/config-actions";
import { ActionFeedback } from "./action-feedback";
import { Button } from "@/components/ui/button";
import { formatPkr } from "@/lib/domain/money";
import type { MenuStatus } from "@/lib/domain/menu";
import type { MenuItemRow } from "@/server/venue-config-service";

const inputClass = "min-h-11 w-full border border-charcoal-line bg-transparent px-3 py-2 text-sm focus:border-lime";

export function MenuEditor({ items, categories }: { items: MenuItemRow[]; categories: string[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const byCategory = new Map<string, MenuItemRow[]>();
  for (const item of items) byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-title">{items.length} items</h2>
        {!adding && <Button size="sm" onClick={() => setAdding(true)}>+ Add an item</Button>}
      </div>
      {adding && <div className="border-2 border-lime p-5">
        <h3 className="font-display mb-4 text-sm uppercase">New item</h3>
        <ItemForm categories={categories} onDone={() => setAdding(false)} />
      </div>}
      {[...byCategory.entries()].map(([category, group]) => (
        <section key={category}>
          <h3 className="text-eyebrow font-display mb-3 uppercase">{category}</h3>
          <ul className="divide-y divide-charcoal-line border-y border-charcoal-line">
            {group.map(item => editing === item.id
              ? <li key={item.id} className="py-5"><ItemForm item={item} categories={categories} onDone={() => setEditing(null)} /></li>
              : <ItemRow key={item.id} item={item} onEdit={() => setEditing(item.id)} />)}
          </ul>
        </section>
      ))}
      {!items.length && <p className="border border-dashed border-charcoal-line p-8">Add an item, fill in its details and price, then publish it.</p>}
    </div>
  );
}

function ItemRow({ item, onEdit }: { item: MenuItemRow; onEdit: () => void }) {
  const [state, action, pending] = useActionState<ConfigState, FormData>(toggleMenuAvailabilityAction, {});
  return <li className="py-4">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {item.image && <Image src={item.image.url} alt={item.image.alt} width={64} height={64} className="size-16 object-cover" />}
        <div>
          <p className="font-medium">{item.name}</p>
          <p className="mt-1 text-xs text-grey-400">
            {item.publicationStatus} · {item.isAvailable ? "Available" : "Sold out"}
            {item.isFeatured && " · Featured"}
            {item.variantCount > 0 && ` · ${item.variantCount} sizes`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p>{item.basePriceMinor === null ? "Price needed" : formatPkr(item.basePriceMinor)}</p>
        {item.publicationStatus === "published" && <form action={action}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="isAvailable" value={item.isAvailable ? "false" : "true"} />
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>{item.isAvailable ? "Mark sold out" : "Back on"}</Button>
        </form>}
        <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
      </div>
    </div>
    {(state.error || state.message) && <ActionFeedback state={state} />}
  </li>;
}

function ItemForm({ item, categories, onDone }: { item?: MenuItemRow; categories: string[]; onDone: () => void }) {
  const [state, action, pending] = useActionState<ConfigState, FormData>(saveMenuItemAction, {});
  const [archiveState, archiveAction, archiving] = useActionState<ConfigState, FormData>(deleteMenuItemAction, {});
  const [status, setStatus] = useState<MenuStatus>(item?.publicationStatus ?? "draft");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [variants, setVariants] = useState(() => (item?.variants ?? []).map((v,index) => ({
    key: v.id ?? `size-${index}`, id: v.id ?? "", name: v.name, price: String(v.priceMinor / 100),
  })));
  const [nextKey, setNextKey] = useState(variants.length);
  const prefix = item?.id ?? "new-menu";
  if (state.ok || archiveState.ok) return <div className="space-y-3">
    <ActionFeedback state={state.ok ? state : archiveState} />
    <Button size="sm" variant="secondary" onClick={onDone}>Done</Button>
  </div>;
  return <div className="space-y-4">
    <ActionFeedback state={state.error ? state : archiveState} />
    <form action={action} className="space-y-5">
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" id={`${prefix}-name`}><input id={`${prefix}-name`} name="name" defaultValue={item?.name} required maxLength={120} className={inputClass} /></Field>
        <Field label="Category" id={`${prefix}-category`}><input id={`${prefix}-category`} name="category" list={`${prefix}-categories`} defaultValue={item?.category} required maxLength={60} className={inputClass} />
          <datalist id={`${prefix}-categories`}>{categories.map(c => <option key={c} value={c} />)}</datalist>
        </Field>
      </div>
      <Field label="Description" id={`${prefix}-description`}><textarea id={`${prefix}-description`} name="description" defaultValue={item?.description ?? ""} maxLength={1000} rows={3} className={inputClass} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Base price (Rs)" id={`${prefix}-price`}><input id={`${prefix}-price`} name="price" inputMode="decimal" defaultValue={item?.basePriceMinor == null ? "" : String(item.basePriceMinor / 100)} required={status === "published"} placeholder="950" className={inputClass} />
          <p className="mt-1 text-xs text-grey-400">A draft can have no price. Set it before publishing.</p>
        </Field>
        <Field label="Publication" id={`${prefix}-status`}><select id={`${prefix}-status`} name="publicationStatus" value={status} onChange={event => setStatus(event.target.value as MenuStatus)} className={inputClass}>
          <option value="draft">Draft — private</option><option value="published">Published — on the menu</option><option value="archived">Archived — hidden</option>
        </select></Field>
      </div>
      <fieldset className="space-y-3 border border-charcoal-line p-4">
        <legend className="px-2 text-sm">Sizes / variants</legend>
        <p className="text-xs text-grey-400">Optional. Enter the full price for each size.</p>
        {variants.map((v,index) => <div key={v.key} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="variantId" value={v.id} />
          <Field label="Size name" id={`${prefix}-variant-${v.key}`}><input id={`${prefix}-variant-${v.key}`} name="variantName" value={v.name} required maxLength={60} onChange={e => setVariants(rows => rows.map((row,i) => i === index ? {...row,name:e.target.value} : row))} className={inputClass} /></Field>
          <Field label="Price (Rs)" id={`${prefix}-variant-price-${v.key}`}><input id={`${prefix}-variant-price-${v.key}`} name="variantPrice" value={v.price} required inputMode="decimal" onChange={e => setVariants(rows => rows.map((row,i) => i === index ? {...row,price:e.target.value} : row))} className={inputClass} /></Field>
          <Button type="button" size="sm" variant="ghost" onClick={() => setVariants(rows => rows.filter((_,i) => i !== index))}>Remove size</Button>
        </div>)}
        <Button type="button" size="sm" variant="secondary" disabled={variants.length >= 20} onClick={() => {
          setVariants(rows => [...rows,{key:`new-size-${nextKey}`,id:"",name:"",price:""}]); setNextKey(nextKey+1);
        }}>Add size</Button>
      </fieldset>
      <fieldset className="space-y-3 border border-charcoal-line p-4">
        <legend className="px-2 text-sm">Photo</legend>
        {item?.image && <Image src={item.image.url} alt={item.image.alt} width={240} height={180} className="h-40 w-56 object-cover" />}
        <Field label={item?.image ? "Replace photo" : "Upload photo"} id={`${prefix}-photo`}><input id={`${prefix}-photo`} name="photo" type="file" accept="image/png,image/jpeg,image/webp" className={inputClass} /></Field>
        <p className="text-xs text-grey-400">PNG, JPEG or WebP, up to 2 MB.</p>
        <Field label="Photo description (alt text)" id={`${prefix}-alt`}><input id={`${prefix}-alt`} name="imageAlt" defaultValue={item?.image?.alt ?? ""} maxLength={160} className={inputClass} /></Field>
        {item?.image && <label className="flex items-center gap-3"><input type="checkbox" name="removeImage" className="size-5 accent-lime" />Remove photo</label>}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Dietary tags" id={`${prefix}-dietary`}><input id={`${prefix}-dietary`} name="dietaryTags" defaultValue={item?.dietaryTags.join(", ")} placeholder="Vegetarian, Spicy" maxLength={500} className={inputClass} /><p className="mt-1 text-xs text-grey-400">Separate with commas. Only use kitchen-confirmed information.</p></Field>
        <Field label="Allergen information" id={`${prefix}-allergens`}><textarea id={`${prefix}-allergens`} name="allergenNote" defaultValue={item?.allergenNote ?? ""} maxLength={1000} rows={2} className={inputClass} /></Field>
      </div>
      <Field label="Display order" id={`${prefix}-order`}><input id={`${prefix}-order`} name="sortOrder" type="number" min={0} max={999} defaultValue={item?.sortOrder ?? 0} className={inputClass} /></Field>
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-3"><input type="checkbox" name="isAvailable" defaultChecked={item ? item.isAvailable : true} className="size-5 accent-lime" />Available</label>
        <label className="flex items-center gap-3"><input type="checkbox" name="isFeatured" defaultChecked={item?.isFeatured ?? false} className="size-5 accent-lime" />Feature on homepage and café page</label>
      </div>
      <div className="flex gap-3 border-t border-charcoal-line pt-4">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : status === "published" ? "Save and publish" : "Save changes"}</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>Cancel</Button>
      </div>
    </form>
    {item && item.publicationStatus !== "archived" && <div className="border-t border-charcoal-line pt-4">
      {confirmArchive ? <form action={archiveAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="id" value={item.id} />
        <p className="text-sm">Archive {item.name}? It will be hidden from the website.</p>
        <Button type="submit" size="sm" variant="danger" disabled={archiving}>{archiving ? "Archiving…" : "Archive item"}</Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setConfirmArchive(false)}>Keep it</Button>
      </form> : <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmArchive(true)}>Archive item</Button>}
    </div>}
  </div>;
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div className="min-w-0 flex-1"><label htmlFor={id} className="text-eyebrow font-display mb-2 block uppercase">{label}</label>{children}</div>;
}
