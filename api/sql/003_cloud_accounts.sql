CREATE TABLE IF NOT EXISTS cloud_accounts (
  provider TEXT PRIMARY KEY CHECK (provider IN ('google-drive', 'dropbox')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  account_email TEXT,
  account_name TEXT,
  client_id TEXT NOT NULL DEFAULT '',
  last_backup_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
