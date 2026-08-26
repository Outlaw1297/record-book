#!/bin/sh
set -e
TEMPLATE=/etc/nginx/record-book.conf
CONF=/etc/nginx/conf.d/default.conf
KEY_FILE=/keys/api_key

i=0
while [ ! -s "$KEY_FILE" ] && [ "$i" -lt 30 ]; do
  i=$((i + 1))
  sleep 1
done

if [ -s "$KEY_FILE" ]; then
  # tr -d strips a trailing newline so nginx config stays on one line
  KEY=$(tr -d '\n' < "$KEY_FILE")
  sed "s|__API_KEY__|$KEY|g" "$TEMPLATE" > "$CONF"
else
  cp "$TEMPLATE" "$CONF"
fi
