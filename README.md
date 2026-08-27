# record-book

Offline-first digital **myHERD / AHA pocket calving book** for phone and desktop. Data stays on the device (IndexedDB). The **Android APK** is the field app (no website required). Phones sign in with Google or Dropbox on the device when there is no ranch server. This ranch can also run an optional **Docker / Portainer** stack so Postgres is the shared book on the NAS.

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

Postgres + API + PWA. No env file and no secrets to paste. First boot generates the keys.

```bash
docker compose up -d
```

Portainer: git repo `https://github.com/Outlaw1297/record-book`, branch `main`, compose `docker-compose.yml`. Leave **Build** off. Images come from `ghcr.io`.

- PWA: `http://YOUR-HOST:8180/`
- API: `http://YOUR-HOST:8180/api/` (see [API reference](docs/api.md))
- Setup: [Docker / Portainer](docs/docker-portainer.md)
- Field phone: [Android APK](docs/android.md) (bundled app, works with the NAS off)

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

Install the **Android APK** for pasture use ([install](docs/android.md)). The Portainer PWA is for the office browser.

## Sync model

- Local **IndexedDB** (Dexie) is the working store offline
- Every write goes to an **outbox**
- **If this install has a ranch Docker server** and the phone can reach it, Postgres is the shared book
- **If there is no ranch server**, sign in with **Google Drive** or **Dropbox** on the device; that folder is the shared book
- Native login does not call the ranch API. Client IDs are baked at APK/web build time
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

Vite + React + TypeScript + Dexie + Tailwind. Field app: Capacitor Android APK. Office: Docker PWA. Optional ranch API: Hono + Postgres 16.
