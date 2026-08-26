# Docker / Portainer ranch database

The phone app still keeps cattle on the device and still uses Drive or Dropbox offline. This stack is an extra Postgres copy of the herd so a future project can call an API.

No environment variables. On first boot the stack writes random keys into a Docker volume and nginx attaches the API key for you.

Portainer does **not** build from this repo (that is what caused `path "/data/compose/.../api" not found`). It pulls ready-made images from `ghcr.io`.

GHCR packages default to private. GitHub has no API to flip that, so after the first **Docker images** workflow run, open each package and set visibility to **Public** (Package settings → Danger Zone → Change visibility). That is a one-time UI step; Portainer has no registry login.

## Portainer

1. Stacks → Add stack → Repository
2. URL: `https://github.com/Outlaw1297/record-book`
3. Branch: `main`
4. Compose path: `docker-compose.yml`
5. Leave **Build** **off**
6. Deploy. Do not add env vars.

Wait until `web` is healthy, then open `http://YOUR-HOST/`.

Settings → Ranch database is already set to `/api`. Use **Copy herd to ranch database** when you have signal.

If a previous deploy failed, remove that stack and create it again so it picks up this compose file.

## Compose CLI

```bash
docker compose up -d
```

Same result: PWA on port 80, API under `/api`, Postgres only on the internal network.

## Future project

Call the same host. Nginx sends the generated key; you do not paste one.

```bash
curl -s http://YOUR-HOST/api/v1/animals
curl -s http://YOUR-HOST/api/v1/export
```

See [API reference](api.md). Keys live in the `keys` volume (`/keys/api_key`, `/keys/pg_password`). Data lives in the `pg` volume.
