ALTER TABLE materials ADD COLUMN slug TEXT;
UPDATE materials SET slug = id WHERE slug IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_materials_slug ON materials(slug);
