# Docker / Portainer ranch database

The phone app still keeps cattle on the device (IndexedDB) and still uses Google Drive or Dropbox as the shared book when you are offline. This stack is an **extra** Postgres copy of that herd so a future project can read and write it over HTTP.

```text
Phone / office PWA  ──► Drive or Dropbox   (existing private book)
                    └──► Ranch API ──► Postgres   (this stack)

Future project      ──► Ranch API ──► Postgres
```

Three containers:

| Service | Image | Port | Role |
|---------|-------|------|------|
| `web` | `record-book-web:local` | 80 | PWA (nginx). `/api/` is proxied to the API |
| `api` | `record-book-api:local` | 8080 | REST API (`0.0.0.0:$PORT`) |
| `postgres` | `postgres:16-alpine` | 5432 | Durable herd database (`recordbook_pg` volume) |

## Secrets

Copy [`.env.example`](../.env.example) to `.env` and replace the placeholders:

```bash
cp .env.example .env
openssl rand -hex 24   # POSTGRES_PASSWORD
openssl rand -hex 24   # API_KEY
```

Do not commit `.env`. The PWA stores a copy of `API_KEY` in **this browser only**. It is never written to Drive, Dropbox, or the JSON backup.

## Docker Compose (CLI)

From the repo root, on the machine that will keep the database (NAS, home server, Portainer host):

```bash
docker compose up --build -d
```

Then:

- PWA: `http://YOUR-HOST/`
- API: `http://YOUR-HOST:8080/health` (no key) and `http://YOUR-HOST:8080/v1/` (needs `API_KEY`)
- Postgres: `YOUR-HOST:5432` (prefer the API for other apps)

First boot runs `api/sql/001_init.sql`. Data lives in the `recordbook_pg` volume, not the container filesystem.

## Portainer stack

1. In Portainer: **Stacks → Add stack**.
2. **Repository** (preferred): this git repo, compose path `docker-compose.yml`, enable **Build**. Or **Web editor**: paste `docker-compose.yml`.
3. **Environment variables**: paste `.env.example` and set real `POSTGRES_PASSWORD` and `API_KEY`.
4. Deploy. Wait until `postgres`, `api`, and `web` are healthy.

If Portainer cannot build from git, build on a machine with Docker and load the images:

```bash
docker compose build
docker save record-book-api:local record-book-web:local | gzip > record-book-images.tar.gz
```

Then in Portainer: Images → Import, then deploy the stack with `image:` already set (`record-book-api:local`, `record-book-web:local`). `postgres:16-alpine` is pulled from Docker Hub.

## Point the PWA at the database

On each device that should copy the herd into Postgres:

1. Open Settings → **Ranch database (Docker)**.
2. URL:
   - `/api` if you opened the PWA from the `web` container (nginx proxies it).
   - `http://YOUR-HOST:8080` if the PWA is running elsewhere (Vite, phone PWA, another origin).
3. API key: the same `API_KEY` as the stack.
4. **Test connection**, then **Sync now**.

Drive/Dropbox can stay connected. Sync then updates the cloud folder **and** copies a snapshot into Postgres.

## Future project

Call the API with `Authorization: Bearer <API_KEY>`. See [API reference](api.md). Keep `CORS_ORIGIN` to that app’s origin if it is not `*`.

Other containers on the same Portainer network can use:

- `http://api:8080` (API)
- `postgres://recordbook:<password>@postgres:5432/recordbook` (direct SQL, same Docker network)

Publishing `5432` on the host is optional. The API is the supported way for a separate project.
