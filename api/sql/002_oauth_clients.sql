-- Public PKCE client IDs for Drive/Dropbox (not passwords).
-- Phones hydrate GET /oauth-clients; Settings can PUT them once.

CREATE TABLE IF NOT EXISTS oauth_clients (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  google_client_id TEXT NOT NULL DEFAULT '',
  dropbox_app_key TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO oauth_clients (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
