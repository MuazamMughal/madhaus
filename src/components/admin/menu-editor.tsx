"use client";

import { useActionState, useState } from "react";
import {
  deleteMenuItemAction,
  saveMenuItemAction,
  toggleMenuAvailabilityAction,
  type ConfigState,
} from "@/app/admin/config-actions";
import { ActionFeedback } from "./action-feedback";
import { Button } from "@/components/ui/button";
import { formatPkr } from "@/lib/domain/money";
import type { MenuItemRow } from "@/server/venue-config-service";

/**
 * The menu, grouped by category.
 *
 * Sold out is a single toggle on each row with no confirmation step — it happens mid-service
 * and is instantly reversible. Price and name changes open a form, because those are
 * deliberate decisions.
 */
export function MenuEditor({
  items,
  categories,
}: {
  items: MenuItemRow[];
  categories: string[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const byCategory = new Map<string, MenuItemRow[]>();
  for (const item of items) {
    byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-title">
          {items.length} item{items.length === 1 ? "" : "s"}
        </h2>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            + Add an item
          </Button>
        )}
      </div>

      {adding && (
        <div className="border-2 border-lime p-5">
          <h3 className="font-display mb-4 text-sm uppercase">New item</h3>
          <ItemForm categories={categories} onDone={() => setAdding(false)} />
        </div>
      )}

      {[...byCategory.entries()].map(([category, categoryItems]) => (
        <section key={category}>
          <h3 className="text-eyebrow font-display mb-3 uppercase">{category}</h3>
          <ul className="divide-y divide-charcoal-line border-y border-charcoal-line">
            {categoryItems.map((item) =>
              editing === item.id ? (
                <li key={item.id} className="py-5">
                  <ItemForm item={item} categories={categories} onDone={() => setEditing(null)} />
                </li>
              ) : (
                <ItemRow key={item.id} item={item} onEdit={() => setEditing(item.id)} />
              ),
            )}
          </ul>
        </section>
      ))}

      {items.length === 0 && (
        <div className="hatch border border-dashed border-charcoal-line p-10 text-center">
          <p className="font-display text-title">Nothing on the menu yet</p>
          <p className="mt-2 text-sm text-grey-400">
            Add your first item and it appears on the public menu straight away.
          </p>
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, onEdit }: { item: MenuItemRow; onEdit: () => void }) {
  const [state, toggleAction, pending] = useActionState<ConfigState, FormData>(
    toggleMenuAvailabilityAction,
    {},
  );

  return (
    <li className={`py-4 ${item.isAvailable ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">
            {item.name}
            {!item.isAvailable && (
              <span className="font-display ml-3 border border-pending px-2 py-0.5 text-[10px] text-pending uppercase">
                Sold out
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-grey-400">
            {item.variantCount > 0 && `${item.variantCount} size${item.variantCount === 1 ? "" : "s"} · `}
            <span className="font-mono">{item.slug}</span>
          </p>
        </div>

        <div className="flex items-center gap-4">
          <p className="font-display text-lg" data-numeric="">
            {formatPkr(item.basePriceMinor)}
          </p>

          {/* The change a kitchen makes mid-service: one tap, instantly reversible. */}
          <form action={toggleAction}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="isAvailable" value={item.isAvailable ? "false" : "true"} />
            <Button
              type="submit"
              size="sm"
              variant={item.isAvailable ? "secondary" : "primary"}
              disabled={pending}
            >
              {pending ? "…" : item.isAvailable ? "Mark sold out" : "Back on"}
            </Button>
          </form>

          <Button size="sm" variant="ghost" onClick={onEdit}>
            Edit
          </Button>
        </div>
      </div>

      {(state.error || state.message) && (
        <div className="mt-3">
          <ActionFeedback state={state} />
        </div>
      )}
    </li>
  );
}

function ItemForm({
  item,
  categories,
  onDone,
}: {
  item?: MenuItemRow;
  categories: string[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ConfigState, FormData>(
    saveMenuItemAction,
    {},
  );
  const [deleteState, deleteAction, deletePending] = useActionState<ConfigState, FormData>(
    deleteMenuItemAction,
    {},
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (state.ok || deleteState.ok) {
    return (
      <div className="space-y-3">
        <ActionFeedback state={state.ok ? state : deleteState} />
        <Button size="sm" variant="secondary" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ActionFeedback state={state.error ? state : deleteState} />

      <form action={formAction} className="space-y-4">
        {item && <input type="hidden" name="id" value={item.id} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="text-eyebrow font-display mb-2 block uppercase">
              Name
            </label>
            <input
              id="name"
              name="name"
              defaultValue={item?.name}
              required
              className="min-h-11 w-full border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
            />
          </div>
          <div>
            <label htmlFor="category" className="text-eyebrow font-display mb-2 block uppercase">
              Category
            </label>
            <input
              id="category"
              name="category"
              list="menu-categories"
              defaultValue={item?.category}
              required
              placeholder="Mains"
              className="min-h-11 w-full border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
            />
            <datalist id="menu-categories">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="price" className="text-eyebrow font-display mb-2 block uppercase">
              Price (Rs)
            </label>
            <input
              id="price"
              name="price"
              inputMode="decimal"
              defaultValue={item ? String(item.basePriceMinor / 100) : ""}
              placeholder="950"
              required
              className="min-h-11 w-full border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
            />
          </div>
          <div>
            <label htmlFor="sortOrder" className="text-eyebrow font-display mb-2 block uppercase">
              Order in its category
            </label>
            <input
              id="sortOrder"
              name="sortOrder"
              type="number"
              min={0}
              defaultValue={String(item?.sortOrder ?? 0)}
              className="min-h-11 w-full border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
            />
          </div>
        </div>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="isAvailable"
            defaultChecked={item ? item.isAvailable : true}
            className="size-5 accent-lime"
          />
          Available tonight
        </label>

        <div className="flex flex-wrap gap-3 border-t border-charcoal-line pt-4">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : item ? "Save changes" : "Add to menu"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>

      {item && (
        <div className="border-t border-charcoal-line pt-4">
          {confirmingDelete ? (
            <form action={deleteAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="id" value={item.id} />
              <p className="text-sm">Remove {item.name} from the menu for good?</p>
              <Button type="submit" size="sm" variant="danger" disabled={deletePending}>
                {deletePending ? "Removing…" : "Yes, remove it"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setConfirmingDelete(false)}
              >
                Keep it
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="text-xs text-grey-400 underline underline-offset-4 hover:text-negative"
            >
              Remove from the menu
            </button>
          )}
        </div>
      )}
    </div>
  );
}
