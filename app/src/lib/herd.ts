import {
  db,
  type Animal,
  type BreedingService,
  type CowCalfRecord,
  type PastureExposure,
  type PastureExposureAnimal,
  type SaleRecord,
  type TreatmentRecord,
} from '../db/schema';

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function remember(map: Map<string, string>, raw?: string) {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'open') return;
  const key = norm(trimmed);
  if (!map.has(key)) map.set(key, trimmed);
}

export async function listHerdIds(): Promise<string[]> {
  const labels = new Map<string, string>();
  const [animals, cowCalf, breeding, pastureAnimals, sales, treatments] = await Promise.all([
    db.animals.filter((row) => !row.deletedAt).toArray(),
    db.cowCalf.filter((row) => !row.deletedAt).toArray(),
    db.breeding.filter((row) => !row.deletedAt).toArray(),
    db.pastureAnimals.filter((row) => !row.deletedAt).toArray(),
    db.sales.filter((row) => !row.deletedAt).toArray(),
    db.treatments.filter((row) => !row.deletedAt).toArray(),
  ]);

  for (const animal of animals) remember(labels, animal.herdId);
  for (const row of cowCalf) {
    remember(labels, row.cowId);
    remember(labels, row.calfId);
    remember(labels, row.sireId);
  }
  for (const row of breeding) {
    remember(labels, row.cowId);
    remember(labels, row.sireId);
  }
  for (const row of pastureAnimals) remember(labels, row.animalHerdId);
  for (const row of sales) remember(labels, row.calfId);
  for (const row of treatments) remember(labels, row.animalHerdId);

  return [...labels.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
  );
}

export async function searchHerdIds(query: string): Promise<string[]> {
  const ids = await listHerdIds();
  const needle = norm(query);
  if (!needle) return ids;
  return ids.filter((id) => norm(id).includes(needle));
}

export type LifetimeEvent = {
  id: string;
  date?: string;
  kind: 'calving' | 'dam' | 'breeding' | 'pasture' | 'sale' | 'treatment';
  title: string;
  detail: string;
  href: string;
};

export type LifetimeRecord = {
  herdId: string;
  animal?: Animal;
  events: LifetimeEvent[];
  cowCalfAsCalf: CowCalfRecord[];
  cowCalfAsDam: CowCalfRecord[];
  breeding: BreedingService[];
  sales: SaleRecord[];
  treatments: TreatmentRecord[];
  pastures: Array<PastureExposureAnimal & { pasture?: PastureExposure }>;
};

export async function getLifetime(herdId: string): Promise<LifetimeRecord> {
  const key = norm(herdId);
  const match = (value?: string) => !!value && norm(value) === key;

  const [cowCalf, breeding, pastureAnimals, sales, pastures, treatments, animals] = await Promise.all([
    db.cowCalf.filter((row) => !row.deletedAt).toArray(),
    db.breeding.filter((row) => !row.deletedAt).toArray(),
    db.pastureAnimals.filter((row) => !row.deletedAt).toArray(),
    db.sales.filter((row) => !row.deletedAt).toArray(),
    db.pastures.filter((row) => !row.deletedAt).toArray(),
    db.treatments.filter((row) => !row.deletedAt).toArray(),
    db.animals.filter((row) => !row.deletedAt).toArray(),
  ]);

  const cowCalfAsCalf = cowCalf.filter((row) => match(row.calfId));
  const cowCalfAsDam = cowCalf.filter((row) => match(row.cowId));
  const breedingRows = breeding.filter(
    (row) => match(row.cowId) || match(row.sireId),
  );
  const saleRows = sales.filter((row) => match(row.calfId));
  const treatmentRows = treatments.filter((row) => match(row.animalHerdId));
  const pastureRows = pastureAnimals
    .filter((row) => match(row.animalHerdId))
    .map((row) => ({
      ...row,
      pasture: pastures.find((pasture) => pasture.id === row.exposureId),
    }));

  const events: LifetimeEvent[] = [];

  for (const row of cowCalfAsCalf) {
    events.push({
      id: `calf-${row.id}`,
      date: row.calvingDate,
      kind: 'calving',
      title: `Born to ${row.cowId}`,
      detail: [row.sex, row.birthWeight, row.birthCodes, row.remarks]
        .filter(Boolean)
        .join(' · '),
      href: `/cow-calf/${row.id}`,
    });
  }
  for (const row of cowCalfAsDam) {
    events.push({
      id: `dam-${row.id}`,
      date: row.calvingDate,
      kind: 'dam',
      title: row.openWithoutCalf
        ? 'Open this season'
        : `Calf ${row.calfId || 'unidentified'}`,
      detail: [row.sireId, row.sex, row.remarks].filter(Boolean).join(' · '),
      href: `/cow-calf/${row.id}`,
    });
  }
  for (const row of breedingRows) {
    events.push({
      id: `br-${row.id}`,
      date: row.serviceDate,
      kind: 'breeding',
      title: match(row.cowId) ? `${row.kind} service` : `Sire on ${row.cowId}`,
      detail: [row.sireId, row.serviceDate].filter(Boolean).join(' · '),
      href: `/breeding/${row.id}`,
    });
  }
  for (const row of pastureRows) {
    events.push({
      id: `pa-${row.id}`,
      date: row.pasture?.bullInDate,
      kind: 'pasture',
      title: row.pasture?.pastureName || 'Pasture',
      detail: [row.role, row.metric, row.note].filter(Boolean).join(' · '),
      href: `/pasture/${row.exposureId}`,
    });
  }
  for (const row of saleRows) {
    events.push({
      id: `sa-${row.id}`,
      date: row.saleDate,
      kind: 'sale',
      title: row.buyer ? `Sold to ${row.buyer}` : 'Sale / cull',
      detail: [row.notes, row.price, row.listMark].filter(Boolean).join(' · '),
      href: `/sales/${row.id}`,
    });
  }
  for (const row of treatmentRows) {
    events.push({
      id: `tx-${row.id}`,
      date: row.date,
      kind: 'treatment',
      title: row.product || 'Treatment',
      detail: [row.dose, row.route, row.notes].filter(Boolean).join(' · '),
      href: `/herd/${encodeURIComponent(herdId)}`,
    });
  }

  events.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return {
    herdId,
    animal: animals.find((row) => match(row.herdId)),
    events,
    cowCalfAsCalf,
    cowCalfAsDam,
    breeding: breedingRows,
    sales: saleRows,
    treatments: treatmentRows,
    pastures: pastureRows,
  };
}
