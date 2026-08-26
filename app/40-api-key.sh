#!/bin/sh
set -e
TEMPLATE=/etc/nginx/record-book.conf
CONF=/etc/nginx/conf.d/default.conf
KEY_FILE=/keys/api_key

if [ -f "$KEY_FILE" ]; then
  sed "s|__API_KEY__|$(cat "$KEY_FILE")|g" "$TEMPLATE" > "$CONF"
else
  cp "$TEMPLATE" "$CONF"
fi
