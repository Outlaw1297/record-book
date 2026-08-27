#!/bin/sh
set -e
KEYS=${KEYS_DIR:-/keys}

if [ -f "$KEYS/pg_password" ]; then
  DATABASE_URL="postgres://recordbook:$(cat "$KEYS/pg_password")@postgres:5432/recordbook"
  export DATABASE_URL
fi
if [ -f "$KEYS/api_key" ]; then
  API_KEY=$(cat "$KEYS/api_key")
  export API_KEY
fi
if [ -f "$KEYS/google_client_id" ]; then
  GOOGLE_OAUTH_CLIENT_ID=$(tr -d '\n' < "$KEYS/google_client_id")
  export GOOGLE_OAUTH_CLIENT_ID
fi
if [ -f "$KEYS/dropbox_app_key" ]; then
  DROPBOX_APP_KEY=$(tr -d '\n' < "$KEYS/dropbox_app_key")
  export DROPBOX_APP_KEY
fi

exec "$@"
