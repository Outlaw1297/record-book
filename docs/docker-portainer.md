# Docker / Portainer ranch database

The phone app still keeps cattle on the device and still uses Drive or Dropbox offline. This stack is an extra Postgres copy of the herd so a future project can call an API.

No environment variables. On first boot the stack writes random keys into a Docker volume and nginx attaches the API key for you.

Portainer does **not** build from this repo (that is what caused `path "/data/compose/.../api" not found`). It pulls ready-made images from `ghcr.io`.

## Portainer

1. Stacks → Add stack → Repository
2. URL: `https://github.com/Outlaw1297/record-book`
3. Branch: `main`
4. Compose path: `docker-compose.yml`
5. Leave **Build** **off**
6. Deploy. Do not add env vars.

Wait until `web` is healthy, then open `http://YOUR-HOST:8180/` (ports 80 and 8080 are left for the host). To confirm the API from a browser, open `http://YOUR-HOST:8180/api/health` — it should show `{"ok":true}`. `/api` by itself is not the app.

Settings → Ranch database is already set to `/api`. The herd copies into Docker Postgres on ranch Wi-Fi even before Drive or Dropbox is connected. Use **Copy to ranch** in Settings to push once.

Pasture logging should use the [Android APK](android.md), not this site. The APK keeps the book on the phone with the NAS off. On ranch Wi-Fi it copies to `http://YOUR-HOST:8180/api` by itself.

If a previous deploy failed, remove that stack and create it again so it picks up this compose file.

## Compose CLI

```bash
docker compose up -d
```

Same result: PWA on host port **8180**, API under `/api`, Postgres only on the internal network. Change the left-hand `8180` in `docker-compose.yml` if that port is taken too.

## Future project

Call the same host. Nginx sends the generated key; you do not paste one.

```bash
curl -s http://YOUR-HOST:8180/api/v1/animals
curl -s http://YOUR-HOST:8180/api/v1/export
```

See [API reference](api.md). Keys live in the `keys` volume (`/keys/api_key`, `/keys/pg_password`). Data lives in the `pg` volume.
