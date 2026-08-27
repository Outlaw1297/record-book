# Docker / Portainer ranch database

The phone app still keeps cattle on the device. This stack is **this ranch’s** book: Postgres on **this ranch’s** network. The same Docker image on another ranch is a different empty database. There is no product server.

Sign in with Google or Dropbox **on the phone** so that herd also copies to YOUR Drive or Dropbox. That spare copy is what you use if this NAS is off. Do not expect Google login to work in the Portainer website (`http://NAS` is blocked).

No environment variables. On first boot **this** stack writes random keys into a Docker volume and nginx attaches the API key for you.

Portainer does **not** build from this repo (that is what caused `path "/data/compose/.../api" not found`). It pulls ready-made images from `ghcr.io`.

## Portainer

1. Stacks → Add stack → Repository
2. URL: `https://github.com/Outlaw1297/record-book`
3. Branch: `main`
4. Compose path: `docker-compose.yml`
5. Leave **Build** **off**
6. Deploy. Do not add env vars.

Wait until `web` is healthy, then open `http://YOUR-HOST:8180/` (ports 80 and 8080 are left for the host). To confirm the API from a browser, open `http://YOUR-HOST:8180/api/health` — it should show `{"ok":true}`. `/api` by itself is not the app.

Settings → Ranch server is already set to `/api` on this Portainer site. That Postgres database is **this ranch’s** book. Phones on **this** ranch type **this** host’s API in Settings, then **Sign in with Google** or **Dropbox** on the phone so a spare copy lands in that account. Another ranch who pulls the same image deploys on **their** NAS and types **their** address.

Pasture logging should use the [Android APK](android.md), not this site. The APK keeps the book on the phone with the NAS off, using the spare Drive/Dropbox copy if you signed in. If **you** run Docker, set the ranch API in Settings to `http://YOUR-HOST:8180/api`.

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
