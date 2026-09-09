/** Rank labels this ranch already uses, then common answers, without duplicates. */

export function rankedLabels(values: Array<string | undefined>): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const raw of values) {
    const label = raw?.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const current = counts.get(key);
    if (current) current.n += 1;
    else counts.set(key, { label, n: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, undefined, { numeric: true }))
    .map((row) => row.label);
}

export function mergeChoices(used: string[], common: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...used, ...common]) {
    const label = item.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export const COLOR_CHOICES = [
  'Red',
  'Red White Face',
  'Black',
  'Black White Face',
  'Yellow',
  'White',
  'Grey',
  'Roan',
  'Brokle',
];

export const BREED_CHOICES = [
  'Hereford',
  'Polled Hereford',
  'Horned Hereford',
  'Angus',
  'Black Baldy',
  'Red Angus',
  'Cross',
];

export const TAG_COLOR_CHOICES = [
  'Yellow',
  'White',
  'Orange',
  'Red',
  'Blue',
  'Green',
  'Pink',
];

export const TATTOO_LOC_CHOICES = ['LE', 'RE', 'LT', 'RT', 'LS', 'RS'];

export const CHUTE_SCORE_CHOICES = ['1', '2', '3', '4', '5', '6'];

export const BODY_CONDITION_CHOICES = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export const CALVING_EASE_CODE_CHOICES = [
  '1',
  '2',
  '3',
  '4',
  '5',
];

export const BIRTH_CODE_CHOICES = ['BB', 'RN', 'BEF', 'Twin', 'Pulled', 'Dead'];

export const CULL_NOTE_CHOICES = [
  'old',
  'open',
  'udder',
  'foot',
  'eye',
  'gimpy',
  'prolapse',
  'temper',
  'poor producer',
];

export const TREATMENT_PRODUCT_CHOICES = [
  '8-way',
  '7-way',
  'Bovi-Shield',
  'Pyramid',
  'Covexin 8',
  'Vision 8',
  'Ivomec',
  'Cydectin',
  'Dectomax',
  'Draxxin',
  'Nuflor',
  'Banamine',
  'Vitamin ADE',
  'Selenium',
];

export const TREATMENT_ROUTE_CHOICES = ['SQ', 'IM', 'IV', 'Pour-on', 'Oral'];
