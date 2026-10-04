-- Menu records have one owner: Admin/Postgres. Sanity only stores image assets.
ALTER TABLE menu_items
  ALTER COLUMN base_price_minor DROP NOT NULL,
  ADD COLUMN description text,
  ADD COLUMN dietary_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN allergen_note text,
  ADD COLUMN image jsonb,
  ADD COLUMN is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN publication_status text NOT NULL DEFAULT 'published',
  ADD COLUMN sanity_source_id text UNIQUE,
  ADD CONSTRAINT menu_publication_valid CHECK (publication_status IN ('draft', 'published', 'archived')),
  ADD CONSTRAINT menu_published_has_price CHECK (publication_status <> 'published' OR base_price_minor IS NOT NULL),
  ADD CONSTRAINT menu_dietary_array CHECK (jsonb_typeof(dietary_tags) = 'array');

-- Preserve the visibility and featured placement of existing items.
UPDATE menu_items SET is_featured = true
WHERE id IN (SELECT id FROM menu_items ORDER BY sort_order, name LIMIT 3);
ALTER TABLE menu_items ALTER COLUMN publication_status SET DEFAULT 'draft';
