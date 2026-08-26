# record-book

Offline-first digital **myHERD / AHA pocket calving book** for phone and desktop browsers. Data stays on the device (IndexedDB); phones share a private Google Drive or Dropbox folder. An optional **Docker / Portainer** stack keeps a Postgres copy of the same herd behind a REST API for a future project.

## Run locally

```bash
cd app
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Open the printed URL. Works offline in the browser after first load (data is stored locally).

```bash
cd app && npm run build   # production build
cd app && npm run lint    # oxlint
cd app && npm test        # last-write-wins / shared-book identity
```

## Docker / Portainer

Postgres + API + PWA. The field app still works without this stack.

```bash
cp .env.example .env   # set POSTGRES_PASSWORD and API_KEY
docker compose up --build -d
```

- PWA: `http://YOUR-HOST/`
- API: `http://YOUR-HOST:8080` (see [API reference](docs/api.md))
- Portainer steps: [Docker / Portainer](docs/docker-portainer.md)

## App sections (from your notebook)

| Section | What it captures |
|---------|------------------|
| **Home** | Field dashboard with Log calf as the primary action |
| **Herd** | Lifetime lookup by herd I.D. |
| **Cow–Calf** | Calf/cow/sire IDs, sex, calving date, birth weight/codes, calving ease, remarks, open cows |
| **Breeding** | AI 1st/2nd + pasture service + due date |
| **Pasture** | Pasture name, bull in/out, animal list with notes/metrics |
| **Sales** | Calf ID, sex, sold to, date, price, cull notes, circled / x marks |
| **Gestation** | Service date + 283 days = due date |
| **Account** | You on this device, other devices on the shared book |
| **Settings** | Ranch (shared), your name/device, Drive/Dropbox, device roster, overlap log |
| **Onboarding** | First-run ranch name and field vs desk |

Install as a **PWA** from the browser (Add to Home Screen). Works offline after first load.

## Sync model

- Local **IndexedDB** (Dexie) is the source of truth offline
- Every write goes to an **outbox**
- When online, pending rows upload as JSONL into a private **Google Drive** or **Dropbox** `RecordBook` folder that **every device/user on that account shares**
- Optional **ranch Postgres** (Docker / Portainer) is a second copy of the herd for other apps. It does not replace Drive
- Your name and device label stay on this device; ranch name, year, and cattle rows are the shared database
- Tokens and the ranch API key stay on the device; they are never written to the outbox or cloud snapshot
- **Download JSON backup** still works without cloud

Setup: [Drive / Dropbox OAuth](docs/sync-setup.md) · [Docker / Portainer](docs/docker-portainer.md) · [Ranch API](docs/api.md)

## Plan & references

- [Architecture plan](docs/plan/cattle-records-app-plan.md)
- [Notebook photos](docs/plan/reference-photos/)
- Canvas: `canvases/cattle-records-plan.canvas.tsx`
- UI skill: `.cursor/skills/ui-design-brain`

## Stack

Vite + React + TypeScript + Dexie + Tailwind. Installable as a PWA. Optional ranch API: Hono + Postgres 16, run with Docker Compose / Portainer.
