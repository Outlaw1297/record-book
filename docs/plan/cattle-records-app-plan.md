# Cattle Record Book — Product & Architecture Plan

**Product:** Offline-first digital version of your **American Hereford Association / myHERD.org pocket calving book**, for phone (field) and desktop (office), syncing through Google Drive or Dropbox when cell service or Wi‑Fi is available.

**Status:** Plan updated from your notebook photos (cow–calf, pasture exposure, sale, breeding, cover). A few pages did not upload (size limit) — send compressed copies when you can and we will fold those sections in.

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

### 2.5 Book identity

- Brand: **myHERD.org** + **American Hereford Association**
- Optional later: export/import alignment with myHERD — **not required for v1**

---

## 3. Apps & UX (match paper workflows)

### Mobile (field)

- Home sections matching book tabs: **Cow–Calf · Breeding · Pasture · Sales**
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
Phone (SQLite + outbox) ──┐
                          ├──► Google Drive OR Dropbox /RecordBook/
Desktop (SQLite + outbox)─┘         changes/  snapshots/  media/
```

- **Local SQLite** is always the working database (works with no signal).
- Cloud folder stores **append-only change files**, periodic **snapshots**, and **photos**.
- Sync when cellular/Wi‑Fi is up; resume after drops.
- Conflict policy v1: last-write-wins + conflict log for same record edited on two devices offline.

Folder layout:

```
/RecordBook/
  config.json
  snapshots/herd-YYYY-MM-DD.sqlite
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
  animalId, sex, buyer, saleDate, price, year, notes
```

Herd IDs stay **free text** (your real tags are not pure numbers). Tag color and phenotype are first-class so search works (`w`, `org`, `BWF`).

---

## 6. Tech stack

| Layer | Choice |
|-------|--------|
| App | **Flutter** (iOS, Android, Windows, macOS) |
| Local DB | SQLite via Drift |
| Sync | Custom outbox + Google Drive / Dropbox APIs |
| Auth | OAuth; tokens in OS secure storage |

---

## 7. Delivery phases

| Phase | Deliverable |
|-------|-------------|
| **0** | Finish ingesting any missing book pages; lock field list |
| **1** | Offline MVP: Cow–Calf list/form + animal directory |
| **2** | Breeding + Pasture Exposure + Sales sections |
| **3** | Drive/Dropbox sync + conflict UI |
| **4** | Desktop grids, CSV/print, remark chips polish |

---

## 8. Missing photos / open questions

**Missing uploads:** you noted some pictures failed the size limit. Please re-send remaining pages as smaller JPEGs (or a few at a time). Useful if they exist in the book: weaning weights, treatments/health, herd inventory, bull inventory, or any other tab you use every year.

**Decisions still needed:**

1. Google Drive, Dropbox, or choose at setup?
2. Android / iPhone / both? Windows and/or Mac first?
3. One user, or phone + office PC editing the same year at once?
4. Should tag color (`y/w/pk/g/…`) be a separate picker, or stay inside the ID string as you write it today?

---

## 9. Next build step

After any remaining pages arrive (or you say “build with what we have”): scaffold Flutter + Phase 1 **Cow–Calf Record** matching these columns, then Breeding / Pasture / Sales, then sync.
