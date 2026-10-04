-- Retain the existing sport ID, slug, prices and shared resource. This makes the
-- third sport visible without creating another court or changing reservations.
UPDATE sports
SET name = 'Futsal', is_active = true
WHERE slug = 'football';
