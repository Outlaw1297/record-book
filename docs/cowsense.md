# Cow Sense import and export

HerdLedger can pull this ranch’s herd out of Cow Sense and send updates back. Each ranch’s cattle stay on that ranch. `Nygaaard.csh` on Dropbox is **this** ranch’s Cow Sense herd file.

**Do not edit that Dropbox file from HerdLedger.** Import reads a copy. Export writes CSV for Cow Sense Tools → Import. Cow Sense owns the `.csh`.

## What a `.csh` file is

Cow Sense NxGen stores the herd in a Microsoft Access (Jet) database (`File > Open`, usually under Documents → Cow Sense). HerdLedger reads these tables from a copy you drop on **Cow Sense** (`/import`):

- `Animal_Identity` — Visual ID, sex, type, status, birth, EID, sire/dam links, registration, tattoo, brand
- `Anim_Traits` — color, breed, horn code, twin code, calving ease, EPDs
- `Anim_Measures` — birth / weaning / yearling / current weights
- `Anim_Breeding`, `Anim_Notes`, `Anim_Sales`
- `Treat_Header` / `Treat_Detail` / `Treat_Index` — chute treatments

This ranch’s file uses Cow Sense words:

- **Sex:** Heifer, Cow, Bull, Steer
- **Type:** Breeding Cow, Breeding Bull, Nursing Calf, Weaned Calf, Yearling, Multi Sire, Calving Failure, …
- **Status:** Active, Disposed, Reference
- **Disposal Type** on disposed cattle: Marketing, Culling, Death loss, Transfer

A 160 MB herd file needs a computer (or the office PWA). A phone WebView may run out of memory. CSV from Manage → List still works.

After import, this ranch’s NAS copies the herd into Postgres. That used to 504 (timeout) on ~10,000 animals. The PWA now sends the herd in pieces, and the API commits them in one database transaction. The status bar at the top of every page shows a progress bar (chunk 12/88, percent) and a **Details** log with each HTTP path, status, and error so a timeout is visible without opening DevTools.

## Pull the herd in

1. Copy `Nygaaard.csh` somewhere else if you are testing. Leave the Dropbox original alone.
2. Open HerdLedger → **Cow Sense**
3. Drop the **copy** of the `.csh` (or a List CSV)
4. Check the preview (Visual ID, Type, Status, dam)
5. **Merge** into this ranch (default) or **Replace herd**
6. Open **Herd** to edit Identity / Traits / Performance / Notes / Treatments

Unknown extra columns stay on the animal so a later export can send them back. Duplicate Visual IDs keep the live animal on the tag; older copies get a suffix so they are not merged.

## Send information back

1. On **Cow Sense**, download **animals CSV** (and calving / breeding / treatments / sales if you use those)
2. In Cow Sense: **Tools → Backup**, then **Tools → Import**
3. Map source columns to Cow Sense fields. Sex must be Heifer/Cow/Bull/Steer. Status on export is Active / Disposed / Reference, with Disposal Type for Marketing / Culling / Death loss
4. Type and Status must be filled to create animals

Writing a new `.csh` binary is not supported. Cow Sense has to own that file.

## Fields on each animal

Identity: Visual ID, EID, name, sex, type, status, birth date/year, location, group, sire, dam, registration, tattoo, brand.

Traits: color, breed, horned/polled, twin code, calving ease, service type, chute score, body condition.

Performance: birth / weaning / yearling weights and dates.

Treatments: date, product, dose, notes.

If a calf has a dam and birth date, a cow–calf row is created for the pocket book.
