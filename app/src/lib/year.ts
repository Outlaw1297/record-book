/** Calendar year on a record, from its date. The book is not limited to one working year. */

export function yearFromIsoDate(value?: string): number | undefined {
  const match = value?.trim().match(/^(\d{4})-/);
  if (!match) return undefined;
  const year = Number(match[1]);
  return Number.isFinite(year) && year >= 1900 && year <= 2100 ? year : undefined;
}

export function recordYear(
  date: string | undefined,
  existing?: number,
): number {
  return yearFromIsoDate(date) ?? existing ?? new Date().getFullYear();
}

export function uniqueYears(values: Array<number | undefined>): number[] {
  const set = new Set<number>();
  for (const year of values) {
    if (typeof year === 'number' && Number.isFinite(year)) set.add(year);
  }
  return [...set].sort((a, b) => b - a);
}
