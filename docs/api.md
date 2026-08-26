# Ranch API

HTTP API in front of the Docker Postgres herd database. Bind is `0.0.0.0:8080` inside the stack. Portainer only publishes port **80**; the PWA and other apps should use `/api/` on that host.

The PWA does **not** require this API. Drive/Dropbox still carry phones.

## Auth

The stack generates an API key on first boot. Nginx on port 80 attaches it to `/api/` requests, so a browser or future app calling `http://YOUR-HOST/api/...` does not send a key.

`GET /health` has no auth. Direct calls to the `api` container still need `Authorization: Bearer` with the generated key (`cat /keys/api_key` in that container).

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/health` | Process up |
| GET | `/ready` | Postgres ping |
| GET | `/v1/` | Catalog |
| GET | `/v1/export` | Full snapshot JSON |
| POST | `/v1/sync/snapshot` | Upsert a PWA snapshot (last `updatedAt` wins) |
| POST | `/v1/sync/changes` | Apply outbox-style change lines |
| GET/PUT | `/v1/ranch` | Ranch name + working year |
| GET | `/v1/animals` | Query `includeDeleted=true` to include soft-deletes |
| GET/PUT/DELETE | `/v1/animals/:id` | DELETE is a soft-delete |
| GET | `/v1/cow-calf` | Query `year=` |
| GET/PUT/DELETE | `/v1/cow-calf/:id` | |
| GET | `/v1/breeding` | Query `year=` |
| GET/PUT/DELETE | `/v1/breeding/:id` | |
| GET | `/v1/pastures` | Query `year=` |
| GET/PUT/DELETE | `/v1/pastures/:id` | |
| GET | `/v1/pasture-animals` | Query `exposureId=` |
| GET/PUT/DELETE | `/v1/pasture-animals/:id` | |
| GET | `/v1/sales` | Query `year=` |
| GET/PUT/DELETE | `/v1/sales/:id` | |
| GET | `/v1/devices` | Device roster |
| PUT | `/v1/devices/:id` | |

JSON field names match the PWA (`herdId`, `cowId`, `updatedAt`, camelCase).

## Examples

Health:

```bash
curl -s http://YOUR-HOST/api/health
```

List animals (future project):

```bash
curl -s http://YOUR-HOST/api/v1/animals
```

Full herd:

```bash
curl -s http://YOUR-HOST/api/v1/export
```

Create or replace an animal:

```bash
curl -s -X PUT http://YOUR-HOST/api/v1/animals/cow-90bk \
  -H "Content-Type: application/json" \
  -d '{"id":"cow-90bk","herdId":"90bk","sex":"F","status":"active","updatedAt":"2026-08-26T00:00:00.000Z"}'
```

From another container on the same Docker network, use `http://api:8080` and send the generated key from `/keys/api_key`.
