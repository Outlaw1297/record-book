# record-book

Offline-first digital **myHERD / AHA pocket calving book** for phone and desktop browsers. Data stays on the device (IndexedDB); syncs later through Google Drive or Dropbox when you have cell service or Wi‑Fi.

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
```

## App sections (from your notebook)

| Section | What it captures |
|---------|------------------|
| **Cow–Calf** | Calf/cow/sire IDs, sex, calving date, birth weight/codes, calving ease, remarks, open cows |
| **Breeding** | AI 1st/2nd + pasture service |
| **Pasture** | Pasture name, bull in/out, animal list with notes/metrics |
| **Sales** | Calf ID, sex, sold to, date, price, cull notes, circled / x marks |
| **Gestation** | Service date + 283 days = due date (printed table) |
| **Settings** | Ranch name, year, Drive/Dropbox provider choice, JSON backup |

## Sync model

- Local **IndexedDB** (Dexie) is the source of truth offline
- Every write goes to an **outbox**
- Settings: choose **Google Drive** or **Dropbox** (OAuth adapters next)
- **Download JSON backup** works today without cloud

## Plan & references

- [Architecture plan](docs/plan/cattle-records-app-plan.md)
- [Notebook photos](docs/plan/reference-photos/)
- Canvas: `canvases/cattle-records-plan.canvas.tsx`
- UI skill: `.cursor/skills/ui-design-brain`

## Stack

Vite + React + TypeScript + Dexie. Installable later as a PWA / Capacitor wrap for app-store packaging if you want native shells.
