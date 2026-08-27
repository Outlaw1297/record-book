import type {
  Animal,
  BreedingService,
  CowCalfRecord,
  SaleRecord,
  TreatmentRecord,
} from '../db/schema';
import { toCsv } from './csv';
import { cowSenseSex, cowSenseStatus, cowSenseType } from './fields';

export const COW_SENSE_ANIMAL_HEADERS = [
  'Visual ID',
  'Electronic ID',
  'Name',
  'Sex',
  'Type',
  'Status',
  'Birth Date',
  'Birth Year',
  'Location',
  'Group',
  'Sire',
  'Dam',
  'Registration - Primary',
  'Tattoo 1',
  'Tattoo 1 Loc',
  'Brand',
  'Color',
  'Breed 1',
  'Horn Code',
  'Twin Code',
  'Calving Ease',
  'Service Type',
  'Chute Score',
  'Body Condition',
  'Birth Weight',
  'Weaning Weight',
  'Weaning Date',
  'Yearling Weight',
  'Yearling Date',
  'Notes',
] as const;

function extraOf(animal: Animal): Record<string, string> {
  if (!animal.extraJson) return {};
  try {
    const parsed = JSON.parse(animal.extraJson) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function exportCowSenseAnimalsCsv(animals: Animal[]): string {
  const extras = new Set<string>();
  for (const animal of animals) {
    for (const key of Object.keys(extraOf(animal))) extras.add(key);
  }
  const extraHeaders = [...extras].sort();
  const headers = [...COW_SENSE_ANIMAL_HEADERS, ...extraHeaders];
  const rows = animals
    .filter((animal) => !animal.deletedAt)
    .map((animal) => {
      const extra = extraOf(animal);
      return [
        animal.herdId,
        animal.electronicId,
        animal.name,
        cowSenseSex(animal.sex, animal.animalType),
        cowSenseType(animal.animalType, animal.sex),
        cowSenseStatus(animal.status),
        animal.birthDate,
        animal.yearBorn,
        animal.location,
        animal.groupName,
        animal.sireId,
        animal.damId,
        animal.registration,
        animal.tattoo,
        animal.tattooLoc,
        animal.brand,
        animal.color,
        animal.breed,
        animal.horned,
        animal.birthType,
        animal.calvingEase,
        animal.serviceType,
        animal.disposition,
        animal.bodyCondition,
        animal.birthWeight,
        animal.weaningWeight,
        animal.weaningDate,
        animal.yearlingWeight,
        animal.yearlingDate,
        animal.notes,
        ...extraHeaders.map((header) => extra[header] || ''),
      ];
    });
  return toCsv(headers, rows);
}

export function exportCowSenseCalvingCsv(rows: CowCalfRecord[]): string {
  return toCsv(
    ['Cow', 'Calf', 'Sire', 'Sex', 'Calving Date', 'Birth Weight', 'Calving Ease', 'Remarks'],
    rows
      .filter((row) => !row.deletedAt)
      .map((row) => [
        row.cowId,
        row.openWithoutCalf ? '' : row.calfId,
        row.sireId,
        row.sex === 'F' ? 'Heifer' : row.sex === 'M' ? 'Bull' : '',
        row.calvingDate,
        row.birthWeight,
        row.calvingEase,
        row.remarks,
      ]),
  );
}

export function exportCowSenseBreedingCsv(rows: BreedingService[]): string {
  return toCsv(
    ['Cow', 'Sire', 'Service Date', 'Service Type'],
    rows
      .filter((row) => !row.deletedAt)
      .map((row) => [
        row.cowId,
        row.sireId,
        row.serviceDate,
        row.kind === 'pasture' ? 'Natural' : 'AI',
      ]),
  );
}

export function exportCowSenseTreatmentsCsv(rows: TreatmentRecord[]): string {
  return toCsv(
    ['Visual ID', 'Date', 'Product', 'Dose', 'Route', 'Location', 'Withdrawal', 'Notes'],
    rows
      .filter((row) => !row.deletedAt)
      .map((row) => [
        row.animalHerdId,
        row.date,
        row.product,
        row.dose,
        row.route,
        row.location,
        row.withdrawal,
        row.notes,
      ]),
  );
}

export function exportCowSenseSalesCsv(rows: SaleRecord[]): string {
  return toCsv(
    ['Visual ID', 'Sex', 'Status', 'Sale Date', 'Buyer', 'Price', 'Notes'],
    rows
      .filter((row) => !row.deletedAt)
      .map((row) => [
        row.calfId,
        row.sex === 'F' ? 'Heifer' : row.sex === 'M' ? 'Steer' : '',
        'Sold',
        row.saleDate,
        row.buyer,
        row.price,
        row.notes,
      ]),
  );
}

export function downloadTextFile(fileName: string, text: string, type = 'text/csv'): void {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
