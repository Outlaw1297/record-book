# Ranch API

HTTP API in front of the Docker Postgres herd database. Auth is a shared `API_KEY`. Bind is `0.0.0.0:$PORT` (default 8080).

The PWA does **not** require this API. Drive/Dropbox still carry phones. This is the copy a future project should call.

## Auth

Send the stack `API_KEY` on every `/v1` request:

```http
Authorization: Bearer YOUR_API_KEY
```

`X-Api-Key: YOUR_API_KEY` is also accepted. `GET /health` has no auth.

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
curl -s http://YOUR-HOST:8080/health
```

List animals (future project):

```bash
curl -s -H "Authorization: Bearer $API_KEY" \
  http://YOUR-HOST:8080/v1/animals
```

Full herd:

```bash
curl -s -H "Authorization: Bearer $API_KEY" \
  http://YOUR-HOST:8080/v1/export
```

Create or replace an animal:

```bash
curl -s -X PUT http://YOUR-HOST:8080/v1/animals/cow-90bk \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"cow-90bk","herdId":"90bk","sex":"F","status":"active","updatedAt":"2026-08-26T00:00:00.000Z"}'
```

From another container on the same Docker / Portainer network, use `http://api:8080` instead of the published host port.

## CORS

`CORS_ORIGIN` defaults to `*`. For a browser app on another origin, set it to that origin (comma-separated if several).
