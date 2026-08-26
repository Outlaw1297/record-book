# Cattle Record Book — Product & Architecture Plan

**Product:** Offline-first digital version of your **American Hereford Association / myHERD.org pocket calving book**, for phone (field) and desktop (office), syncing through Google Drive or Dropbox when cell service or Wi‑Fi is available.

**Status:** All 11 photos from `book.zip` are in [`docs/plan/reference-photos/`](reference-photos/). MVP covers cow–calf, breeding (with due dates), pasture (including cull lists), sales/culls, gestation table, and cover identity.

**UI skill:** [ui-design-brain](../../.cursor/skills/ui-design-brain/SKILL.md)

**Reference photos:** [`docs/plan/reference-photos/`](reference-photos/)

---

## 1. Goals

| Goal | Detail |
|------|--------|
| Mirror the paper book | Same section names and columns you already write |
| Work without internet | Full entry/search on device in the pasture |
| Work with spotty cell | Queue changes; sync when service returns |
| Phone + desktop | Field quick-entry + office tables/exports |
| No custom server | Google Drive or Dropbox is the shared backend |

---

## 2. What your book actually records (from photos)

Source: spiral **myHERD.org / American Hereford Association** pocket book.

### 2.1 Cow – Calf Record

Printed title: **LIST ALL COWS BY HERD I.D. NUMBER** / footer **COW – CALF RECORD**.

| Column | How you use it | App field |
|--------|----------------|-----------|
| CALF I.D. NO. | Alphanumeric + tag color letter (`67y`, `247w`, `919g`) | `calfId` (text) |
| COW I.D. NO. | Tag, name, or both (`Helen`, `90bk`, `654 Heal`) | `cowId` (text, link to animal) |
| BRED BY SIRE I.D. NO. | Bull ID, date-like codes (`5/5`), name (`Diablo`), or **`open`** | `sireId` / status `open` |
| SEX | `F` / `M` | `sex` enum |
| CALVING DATE MTH/DAY/YEAR | Split date (`7 / 1 / 26`) | single `calvingDate` |
| BIRTH WEIGHT | Weight and/or phenotype codes (`BB`, `RN`, `BEF`, `40`) | `birthWeight` + `birthCodes` |
| CALV EZ | Ease score (`1`, `1/1`) | `calvingEase` |
| REMARKS | Grades, poll, notes (`GAGM`, `FAGM`, `poll`, `preme pull`) | `remarks` + quick tags |

**Open cows:** row can be cow-only with sire/calf marked `open` — app must allow calving rows without a calf.

### 2.2 Breeding Record — Year ____

| Column group | Fields | App model |
|--------------|--------|-----------|
| COW I.D. | Color/type + tag (`BLK 455org`, `BWF 40pk`, `BBF 419w`) | cow + phenotype + tag color |
| A.I. 1st Service | Sire + Date | `services[]` type=`ai`, sequence=1 |
| A.I. 2nd Service | Sire + Date | `services[]` type=`ai`, sequence=2 |
| Pasture Service | Sire + Date | `services[]` type=`pasture` |

Circled rows in ink → **flag / highlight** on the record.

### 2.3 Pasture Exposure

Header: **PASTURE**, **BULL IN**, **BULL OUT** dates.

| Piece | Example | App field |
|-------|---------|-----------|
| Pasture name | `OLD COWS` | `pastureName` |
| Bull in / out | `7-19-26`, blank out | `bullInDate`, `bullOutDate` |
| Animal lists | Columns retitled (e.g. COWS → **BULLS**) | flexible columns: role + animal refs |
| Per-animal notes | `241w +3.3`, `652g BLK`, `20 Jenkins`, `BHFD`, `Red` | ID + free note / EPD-like `+n.n` |
| Counts | circled `13 BULLS` | derived count |
| Flagged animal | circled `500 Jensen +2.4` | `flagged` |

### 2.4 Sale Record

| Column | App field |
|--------|-----------|
| CALF I.D. | `animalId` |
| SEX | `sex` |
| SOLD TO | `buyer` |
| DATE | `saleDate` |
| PRICE | `price` |

Companion list usage (same year): calf ID + status notes (`old`, `gimp`, `udder`, `big bag`), `x`-prefix and circles as **status / sold / flagged** markers. Tag color embedded in ID (`y`, `w`, `pk`, `g`, `teal`, `purple`, `org`).

Page **111** is titled **2026 CULL LIST** on a printed **SALE RECORD** grid. Page **110** is a blank sale sheet for the same year. App model: one Sale Record row with optional `listMark` (`x` | `circled`) and notes for cull reason.

### 2.5 Gestation Table

Printed lookup: **Find Date of Service in Upper Line. Second Line Represents Date Due.** App uses **service + 283 days**. Breeding rows show the computed due date next to the service date.

### 2.6 Pasture used as a cull list

Page **83** is a Pasture Exposure sheet named **2+3's** with heading **List of Culls** (IDs plus reasons: old, gimpy, udder, death date). Same pasture model; animals carry notes.

### 2.7 Book identity

- Brand: **myHERD.org** + **American Hereford Association**
- Optional later: export/import alignment with myHERD — **not required for v1**

---

## 3. Apps & UX (match paper workflows)

### Mobile (field)

- Home sections matching book tabs: **Cow–Calf · Breeding · Pasture · Sales/Culls · Gestation**
- One-row-at-a-time entry with defaults (year, calving ease `1`)
- Fast animal picker by herd ID / tag color
- Quick remark chips: `poll`, `GAGM`, `FAGM`, `open`, `gimp`, etc.
- Offline banner + last synced time
- Large touch targets (glove-friendly)

### Desktop (office)

- Spreadsheet-like grids per section (same columns as the book pages)
- Filters by year, pasture, sex, open/bred, flagged
- CSV / print for sale sheets and inventory
- Conflict review after multi-device sync

Design direction via ui-design-brain: information-dense tables on desktop; large-touch field forms on mobile; earth/neutral ranch palette (not purple SaaS defaults).

---

## 4. Architecture (offline-first + Drive/Dropbox)

```
Phone (IndexedDB + outbox) ──┐
Tablet / second user         ├──► Google Drive OR Dropbox /RecordBook/
Office PC (IndexedDB + outbox)─┘     config, devices.json, changes/, snapshots/
```

- **Local IndexedDB** is always the working database (works with no signal).
- Cloud folder is the **shared book** for every device signed into that account.
- Each device keeps its own operator name; ranch name, year, and cattle rows sync.
- Same cow/calf logged on two devices merges by herd I.D. (last `updatedAt` wins).
- OAuth tokens live only in the local `syncAuth` table. They are never queued or uploaded.

Folder layout:

```
/RecordBook/
  config.json
  devices.json
  snapshots/herd-latest.json
  changes/<deviceId>/<seq>.jsonl
  media/<animalId>/…
```

---

## 5. Suggested data schema (v1)

```text
Animal
  id, herdId, tagColor, phenotype (BLK/BWF/BBF/RWF/…),
  name, sex, status (active|open|sold|dead|flagged),
  notes, yearBorn

CowCalfRecord          # one row ≈ paper book row
  year, calfId → Animal?, cowId → Animal, sireId,
  sex, calvingDate, birthWeight, birthCodes, calvingEase,
  remarks, flagged, openWithoutCalf

BreedingService
  year, cowId → Animal, kind (ai1|ai2|pasture),
  sireId, serviceDate, flagged

PastureExposure
  pastureName, bullInDate, bullOutDate, year, notes

PastureExposureAnimal
  exposureId, animalId, role (bull|cow), note, metric (+3.3), flagged

SaleRecord
  animalId, sex, buyer, saleDate, price, year, notes,
  listMark (x|circled)
```

Herd IDs stay **free text** (your real tags are not pure numbers). Tag color and phenotype are first-class so search works (`w`, `org`, `BWF`).

---

## 6. Tech stack

| Layer | Choice |
|-------|--------|
| App | **Vite + React PWA** (phone + desktop browsers); native shell later if needed |
| Local DB | IndexedDB via Dexie |
| Sync | Outbox + Google Drive / Dropbox JSONL and snapshots |
| Auth | PKCE OAuth; tokens only on the device |

---

## 7. Delivery phases

| Phase | Deliverable |
|-------|-------------|
| **0** | Finish ingesting any missing book pages; lock field list |
| **1** | Offline MVP: Cow–Calf list/form + animal directory |
| **2** | Breeding + Pasture Exposure + Sales sections |
| **3** | Drive/Dropbox sync + conflict log |
| **4** | Desktop grids, CSV/print, remark chips polish |

---

## 8. Open questions

**Photos received:** front/back covers, cow–calf p16–17, breeding p70–71, pasture p81 and p83 (culls), sale/cull p110–111, gestation table. If the book has other yearly tabs (weaning weights, treatments/health, herd or bull inventory), those can still be added later.

**Decisions still needed:**

1. Google Drive **or** Dropbox — chosen in Settings; one private account for phone + office PC.
2. Android / iPhone / both? Windows and/or Mac first? (PWA covers browsers on all of these today.)
3. One user, or phone + office PC editing the same year at once? (Supported: last `updatedAt` wins.)
4. Should tag color (`y/w/pk/g/…`) be a separate picker, or stay inside the ID string as you write it today?

---

## 9. Next build step

CSV/print for sale sheets, then a native Flutter/Capacitor shell if you want app-store packaging. Drive/Dropbox setup: [`docs/sync-setup.md`](../sync-setup.md).
