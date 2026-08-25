# Cow Herd Record Book

Web app for the American Hereford Association **Cow Herd Breeding and Calving Record Book** (red spiral). It follows the paper forms and is seeded with the 2026 pages photographed for this project.

## Forms

- **Cow-Calf Record** — calf, cow, sire, sex, calving date, birth weight, calving ease, remarks
- **Breeding Record** — cow I.D., A.I. 1st/2nd service, pasture service
- **Pasture Exposure** — pasture, bull in/out, cow/bull/cull lists
- **Cull list** — sale-record grid used for cull reasons, circled IDs, leading ×
- **Sale Record** — calf I.D., sex, sold to, date, price
- **Gestation table** — due date = service date + **283 days** (28-day February, same as the printed table)

Animal IDs are number + tag color (`242y`, `528 pk`, `BLK 455org`). Records are stored in this browser (`localStorage`). Use **Download JSON** / **Import** to move the book between devices, and **Restore notebook pages** to reload the photographed 2026 entries.

## Run

```bash
npm install
npm test
npm run dev
```

Then open the printed URL (Vite binds `0.0.0.0:5173`).

```bash
npm run build
npm run preview
```
