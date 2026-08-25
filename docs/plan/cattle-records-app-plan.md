# Cattle Record Book — Product & Architecture Plan

**Product:** Offline-first cattle record book for phone (field) and desktop (office), with optional sync through Google Drive or Dropbox when cellular/Wi‑Fi is available.

**Status:** Planning draft. Reference photos of the paper book were not available in this agent session; the data model below uses standard ranch record-keeping fields and should be adjusted to match your pages once photos are shared.

**UI skill:** [ui-design-brain](../../.cursor/skills/ui-design-brain/SKILL.md) installed for production-grade UI generation.

---

## 1. Goals

| Goal | Detail |
|------|--------|
| Work without internet | Full create / edit / search of animals and events on device |
| Work with intermittent cell service | Sync when online; queue changes when offline |
| Phone + desktop | Same data, ranch-friendly UX on each form factor |
| No custom server required | Google Drive or Dropbox is the shared “backend” |
| Feel like the paper book | Screens and fields mirror how you already keep records |

Non-goals for v1: multi-ranch SaaS, public APIs, real-time collaborative editing, AI vision of ear tags (nice later).

---

## 2. Recommended product shape

### Mobile (phone / tablet)

Primary use: standing in a pen or pasture with spotty service.

- Large touch targets, glove-friendly
- Fast animal lookup by tag / tattoo / name
- Quick-add: calf, treatment, weight, breeding, move, note + photo
- Offline banner + last-synced time
- Camera for animal photos and paper-page capture (optional import later)

### Desktop (Windows / macOS)

Primary use: office batch entry, reports, breeding lists, inventory.

- Dense tables, keyboard shortcuts, multi-column filters
- Print / CSV export for bank, vet, or sale sheets
- Same sync folder as the phone
- Optional dual-pane: animal list + detail history

### Shared design direction (ui-design-brain)

- **Enterprise / information-dense** for desktop tables
- **Modern SaaS + large touch** for mobile field flows
- Neutral ranch palette (earth / fence-post tones), one accent — not purple SaaS defaults
- Empty states that say “no cattle yet” with a clear Add animal CTA

---

## 3. Architecture (offline-first)

```
┌─────────────────────┐     ┌─────────────────────┐
│  Mobile app         │     │  Desktop app        │
│  local SQLite       │     │  local SQLite       │
│  outbox of changes  │     │  outbox of changes  │
└─────────┬───────────┘     └─────────┬───────────┘
          │  sync when online         │
          └────────────┬──────────────┘
                       ▼
          ┌────────────────────────────┐
          │  Google Drive  OR  Dropbox │
          │  /RecordBook/              │
          │    herd.sqlite.snapshot    │
          │    changes/*.jsonl         │
          │    media/<animalId>/…      │
          └────────────────────────────┘
```

**Important:** Drive/Dropbox are **file sync backends**, not a live SQL server. Each device always reads/writes **local SQLite**. When online, a sync engine pushes/pulls change files and media into a shared folder.

### Why this works on ranch cell service

1. All UI and queries hit local SQLite — zero latency, works in airplane mode.
2. Every write also appends to a local **outbox**.
3. When connectivity appears, the app uploads outbox files and downloads peers’ files.
4. Sync can resume after drops; uploads are small JSON change records, not the whole DB every time.
5. Periodic full snapshots provide recovery if change logs get messy.

### Sync protocol (v1)

| Piece | Purpose |
|-------|---------|
| Device ID | Stable UUID per install |
| Change record | `{ id, deviceId, entity, entityId, op, payload, updatedAt, vectorClock }` |
| Outbox upload | Append-only JSONL files under `changes/<deviceId>/<seq>.jsonl` |
| Apply remote | Merge into local SQLite by `entityId` + last-write-wins on `updatedAt` (with conflict log) |
| Snapshot | Weekly (or manual) upload of compacted SQLite for new-device bootstrap |
| Media | Photos stored as files; DB holds paths + checksums; upload separately |

**Conflict policy (v1):** last-write-wins on the same animal field, with a visible “Conflict” note if two devices edited the same record while both offline. Ranch ops rarely need CRDTs; keep it simple and reviewable.

**Auth:** OAuth for Google Drive or Dropbox on each device; tokens stored in OS secure storage. User picks one provider at setup (“Use Google Drive” / “Use Dropbox”).

---

## 4. Suggested tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Cross-platform UI | **Flutter** | One codebase → iOS, Android, Windows, macOS; strong offline story |
| Local DB | **SQLite** via Drift | Reliable, queryable, shippable offline |
| Sync | Custom sync service + Drive/Dropbox SDKs | Fits “cloud folder as backend” without running a server |
| Auth | Google / Dropbox OAuth | Native to the chosen store |
| Photos | Local filesystem + cloud media folder | Survives offline; syncs when service returns |

Alternatives if you prefer web tech: **React Native (mobile) + Tauri (desktop)** sharing a TypeScript sync + SQLite (sql.js / better-sqlite3) core. Flutter remains the simpler single-team path for ranch phone + PC.

---

## 5. Domain model (match to your paper book)

Adjust field names/sections after reviewing your photos.

### Core entities

**Animal**

- Visual / ear tag ID, secondary ID (tattoo, brand, EID/RFID)
- Name (optional)
- Sex, breed, color / markings
- Birth date, birth weight, birth type (single/twin)
- Status: active, sold, dead, culled, missing
- Current pasture / pen
- Dam / sire links (other animals)
- Notes, photo(s)

**Breeding / calving**

- Breeding date, bull / AI straw, method
- Expected calving date
- Actual calving: date, calf ID, ease score, complications
- Weaning date / weight

**Health & treatments**

- Date, product, dose, route, withdrawal date
- Condition / diagnosis
- Vet visit flag
- Cost (optional)

**Weights & performance**

- Date, weight, method (scale / tape)
- Gain calculations derived in UI

**Moves / inventory**

- From / to location, date, reason
- Purchase / sale: counterparty, price, weight, date

**Herd / ranch settings**

- Ranch name, default pastures, tag formats, units (lb/kg)

### Screen map

| Mobile | Desktop |
|--------|---------|
| Home: search + quick actions | Dashboard: herd counts, due calvings, withdrawals |
| Animal detail + timeline | Animal table + filters + detail drawer |
| Add/edit forms (wizard-style) | Same forms, denser |
| Sync status | Sync status + conflict review |
| Settings (provider, ranch) | Settings + export/print |

---

## 6. Sync folder layout (provider-agnostic)

```
/RecordBook/
  config.json                 # schema version, ranch id
  snapshots/
    herd-2026-08-25.sqlite
  changes/
    <deviceId>/
      000001.jsonl
      000002.jsonl
  media/
    <animalId>/
      photo-….jpg
  locks/                      # soft advisory only; never block offline use
```

Both Google Drive and Dropbox expose “app folder” or user-picked folder APIs. Abstract behind:

```text
CloudStore { list, upload, download, delete, watch? }
GoogleDriveStore | DropboxStore
```

---

## 7. Connectivity behavior

| State | App behavior |
|-------|----------------|
| Offline | Full CRUD; queue outbox; show “Offline — changes saved on device” |
| Online weak | Prefer small change uploads; defer large photo sync; retry with backoff |
| Online | Upload outbox → download peers → apply → optional snapshot |
| First install | Sign in → pick/create folder → download latest snapshot → catch up changes |

Manual **Sync now** button always available. Auto-sync on app resume when network is reachable.

---

## 8. Security & privacy

- Data stays in the user’s Drive/Dropbox account (no third-party cattle SaaS required for v1)
- OAuth scopes limited to app folder when possible
- Optional at-rest encryption of change payloads with a ranch passphrase (v1.1)
- Local DB protected by device lock / OS app sandbox
- Soft-delete animals; hard-delete only after sync tombstones propagate

---

## 9. Delivery phases

### Phase 0 — Align with paper book

- Review photos/scans of current pages
- Finalize field list and naming to match your book
- Wireframe mobile animal card + desktop table

### Phase 1 — Offline MVP (single device)

- Flutter shell: animal list, detail, add/edit
- Local SQLite schema + seed empty ranch
- No cloud yet — proves field usability

### Phase 2 — Cloud sync

- Google Drive adapter (primary) + Dropbox adapter
- Outbox / inbox change sync + snapshot bootstrap
- Sync status UI + conflict list

### Phase 3 — Desktop polish & exports

- Desktop layouts, keyboard nav, CSV/PDF sale & inventory sheets
- Breeding calendar / due list
- Photo gallery per animal

### Phase 4 — Nice-to-haves

- RFID/BLE wand if you use EIDs
- Paper-page photo OCR assist
- Multi-user roles (owner / hand) with same sync folder

---

## 10. Open decisions (need your input)

1. **Provider preference:** Google Drive, Dropbox, or let user choose at setup?
2. **Platforms first:** Android only, iPhone only, or both? Windows and/or Mac desktop?
3. **Paper book pages:** please re-share photos so we mirror exact columns (tags, calving, health, etc.).
4. **Who uses it:** one person, or phone in the field + someone else on the office PC at the same time?
5. **Must-have reports** for v1 (e.g. active inventory, calves this year, treatments with withdrawal).

---

## 11. Immediate next build step

After photos are available and decisions above are answered: scaffold Flutter project in this repo, implement Phase 1 offline animal CRUD matching your book’s fields, then add Drive/Dropbox sync in Phase 2.
