-- Record Book shared Postgres schema.
-- The PWA still uses IndexedDB + Drive/Dropbox offline.
-- This database is the ranch copy for APIs and future apps.

CREATE TABLE IF NOT EXISTS ranch (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ranch_name TEXT NOT NULL DEFAULT 'Record Book',
  current_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER,
  -- Epoch so a real device snapshot always wins last-write-wins on first copy.
  updated_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z'
);

INSERT INTO ranch (id, ranch_name, current_year, updated_at)
VALUES (1, 'Record Book', EXTRACT(YEAR FROM NOW())::INTEGER, '1970-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS animals (
  id TEXT PRIMARY KEY,
  herd_id TEXT NOT NULL,
  tag_color TEXT,
  phenotype TEXT,
  name TEXT,
  sex TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  year_born INTEGER,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS animals_herd_id_idx ON animals (lower(herd_id));
CREATE INDEX IF NOT EXISTS animals_updated_at_idx ON animals (updated_at);

CREATE TABLE IF NOT EXISTS cow_calf (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  calf_id TEXT,
  cow_id TEXT NOT NULL,
  sire_id TEXT,
  sex TEXT NOT NULL DEFAULT '',
  calving_date TEXT,
  birth_weight TEXT,
  birth_codes TEXT,
  calving_ease TEXT,
  remarks TEXT,
  open_without_calf BOOLEAN NOT NULL DEFAULT FALSE,
  flagged BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS cow_calf_year_idx ON cow_calf (year);
CREATE INDEX IF NOT EXISTS cow_calf_cow_id_idx ON cow_calf (lower(cow_id));

CREATE TABLE IF NOT EXISTS breeding (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  cow_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  sire_id TEXT,
  service_date TEXT,
  flagged BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS breeding_year_idx ON breeding (year);
CREATE INDEX IF NOT EXISTS breeding_cow_id_idx ON breeding (lower(cow_id));

CREATE TABLE IF NOT EXISTS pastures (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  pasture_name TEXT NOT NULL,
  bull_in_date TEXT,
  bull_out_date TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pastures_year_idx ON pastures (year);

CREATE TABLE IF NOT EXISTS pasture_animals (
  id TEXT PRIMARY KEY,
  exposure_id TEXT NOT NULL,
  animal_herd_id TEXT NOT NULL,
  role TEXT NOT NULL,
  note TEXT,
  metric TEXT,
  flagged BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pasture_animals_exposure_idx ON pasture_animals (exposure_id);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  calf_id TEXT NOT NULL,
  sex TEXT NOT NULL DEFAULT '',
  buyer TEXT,
  sale_date TEXT,
  price TEXT,
  notes TEXT,
  list_mark TEXT,
  flagged BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sales_year_idx ON sales (year);

CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  operator_name TEXT,
  kind TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
