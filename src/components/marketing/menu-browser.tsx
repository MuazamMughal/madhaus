"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { MenuItemContent } from "@/lib/content/types";
import { cn } from "@/lib/utils/cn";

/**
 * Menu browser.
 *
 * Progressive enhancement: the whole list is rendered by the server, and this adds a
 * search box and category filters on top. With JavaScript off the customer sees the
 * complete menu, which is the important part.
 *
 * The result count is announced politely so filtering is not silent for screen-reader
 * users.
 */
export function MenuBrowser({
  items,
  categories,
}: {
  items: MenuItemContent[];
  categories: string[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (category && item.category !== category) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.description?.toLowerCase().includes(needle) ||
        item.category.toLowerCase().includes(needle)
      );
    });
  }, [items, query, category]);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItemContent[]>();
    for (const item of filtered) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-[var(--surface-line)] pb-6">
        <div>
          <label htmlFor="menu-search" className="text-eyebrow font-display mb-2 block uppercase">
            Search the menu
          </label>
          <input
            id="menu-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Burger, coffee, wings…"
            className="min-h-12 w-full max-w-md border border-[var(--surface-line)] bg-transparent px-3 text-base focus:border-[var(--surface-accent)]"
          />
        </div>

        <div>
          <p className="text-eyebrow font-display mb-2 uppercase" id="menu-filter-label">
            Filter
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="menu-filter-label">
            <FilterChip active={category === null} onClick={() => setCategory(null)}>
              Everything
            </FilterChip>
            {categories.map((entry) => (
              <FilterChip
                key={entry}
                active={category === entry}
                onClick={() => setCategory(category === entry ? null : entry)}
              >
                {entry}
              </FilterChip>
            ))}
          </div>
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {filtered.length} of {items.length} items shown.
      </p>

      {filtered.length === 0 ? (
        <div className="hatch mt-10 border border-dashed border-[var(--surface-line)] p-10 text-center">
          <p className="font-display text-title">Nothing matches that</p>
          <p className="mt-3 text-sm text-[var(--surface-muted)]">
            Try a different word, or{" "}
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCategory(null);
              }}
              className="underline decoration-2 underline-offset-4"
            >
              clear the filters
            </button>
            .
          </p>
        </div>
      ) : (
        <div className="mt-12 space-y-14">
          {grouped.map(([group, groupItems]) => (
            <section key={group}>
              <h2 className="text-headline mb-6">{group}</h2>
              <ul className="divide-y divide-[var(--surface-line)] border-y border-[var(--surface-line)]">
                {groupItems.map((item) => (
                  <li
                    key={item.slug}
                    className={cn(
                      "flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 py-5",
                      !item.isAvailable && "opacity-60",
                    )}
                  >
                    {item.image && <Image src={item.image.url} alt={item.image.alt} width={120} height={90}
                      className="h-24 w-28 shrink-0 object-cover" />}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold">
                        {item.name}
                        {!item.isAvailable && (
                          // Text, not just dimming: "sold out" must survive a screen reader.
                          <span className="font-display ml-3 border border-current px-2 py-0.5 text-[10px] uppercase">
                            Sold out
                          </span>
                        )}
                      </h3>
                      {item.description && (
                        <p className="mt-1 text-sm text-[var(--surface-muted)]">{item.description}</p>
                      )}
                      {!!item.variants?.length && <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {item.variants.map(variant => <li key={variant.name}>{variant.name}: {variant.priceLabel}</li>)}
                      </ul>}
                      {item.allergenNote && <p className="mt-2 text-xs text-[var(--surface-muted)]">Allergens: {item.allergenNote}</p>}
                      {item.dietaryTags.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {item.dietaryTags.map((tag) => (
                            <li
                              key={tag}
                              className="font-display border border-[var(--surface-line)] px-2 py-0.5 text-[10px] uppercase"
                            >
                              {tag}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {item.priceLabel && (
                      <p className="shrink-0 font-medium" data-numeric="">
                        {item.priceLabel}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "font-display flex min-h-11 items-center border px-4 text-xs uppercase transition-colors",
        active
          ? "border-[var(--surface-accent)] bg-[var(--surface-accent)] text-[var(--surface-accent-fg)]"
          : "border-[var(--surface-line)] hover:border-[var(--surface-accent)]",
      )}
    >
      {children}
    </button>
  );
}
