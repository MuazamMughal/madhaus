-- Protect edits made in the new Admin before the one-time CMS import is run.
ALTER TABLE menu_items ADD COLUMN admin_managed boolean NOT NULL DEFAULT false;
