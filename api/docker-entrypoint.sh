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

exec "$@"
