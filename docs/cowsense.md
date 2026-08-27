# Cow Sense import and export

Record Book can pull this ranch’s herd out of Cow Sense and send updates back. Each ranch’s cattle stay on that ranch. `Nygaaard.csh` on your Dropbox is **this** ranch’s Cow Sense herd file.

## What a `.csh` file is

Cow Sense NxGen stores the herd in a private `.csh` database (`File > Open`, usually under Documents → Cow Sense). That format is not a spreadsheet. Cow Sense’s own Import Tool only reads **CSV, TXT, or XLS**, and it requires:

- **Sex** as `Heifer`, `Cow`, `Bull`, or `Steer` (not `H` / `B`)
- **Type** and **Status** on every new animal

So Record Book:

1. Tries to read `.csh` / CSV / TXT / JSON you drop on **Cow Sense** (`/import`)
2. If the `.csh` is not a spreadsheet, export from Cow Sense **Manage → List → Export** and drop that CSV here
3. Exports CSV that Cow Sense **Tools → Import** can map (Sex / Type / Status already in Cow Sense words)

## Pull the herd in

1. Open Record Book → **Cow Sense** (Home card, Herd, Account, or Settings)
2. Drop `Nygaaard.csh` if it is readable, or the List CSV
3. Check the preview (Visual ID, Type, Status, dam)
4. **Merge** into this ranch (default) or **Replace herd**
5. Open **Herd** to edit Identity / Traits / Performance / Notes / Treatments

Unknown extra columns are kept on the animal so a later export can send them back.

## Send information back

1. On **Cow Sense**, download **animals CSV** (and calving / breeding / treatments / sales if you use those)
2. In Cow Sense: **Tools → Backup**, then **Tools → Import**
3. Map source columns to Cow Sense fields. Names do not have to match; values must (Heifer not H)
4. Type and Status must be filled to create animals

Writing a new `.csh` binary is not supported. Cow Sense has to own that file. CSV through Import Tool is the supported round-trip.

## Fields on each animal

Identity: Visual ID, EID, name, sex, type, status, birth date/year, location, group, sire, dam, registration, tattoo, brand.

Traits: color, breed, horned/polled, twin code, calving ease, service type, chute score, body condition.

Performance: birth / weaning / yearling weights and dates.

Treatments: date, product, dose, notes.

If a calf has a dam and birth date, a cow–calf row is created for the pocket book.
