-- Cow Sense identity / traits / performance fields on animals, plus treatments.

ALTER TABLE animals ADD COLUMN IF NOT EXISTS animal_type TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS birth_date TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS group_name TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS electronic_id TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS registration TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS tattoo TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS tattoo_loc TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS breed TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS horned TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS birth_type TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS calving_ease TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS service_type TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS disposition TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS body_condition TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS sire_id TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS dam_id TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS birth_weight TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS weaning_weight TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS weaning_date TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS yearling_weight TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS yearling_date TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS extra_json TEXT;

CREATE TABLE IF NOT EXISTS treatments (
  id TEXT PRIMARY KEY,
  animal_herd_id TEXT NOT NULL,
  date TEXT,
  product TEXT,
  dose TEXT,
  route TEXT,
  location TEXT,
  withdrawal TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS treatments_animal_idx ON treatments (lower(animal_herd_id));
CREATE INDEX IF NOT EXISTS treatments_updated_at_idx ON treatments (updated_at);
