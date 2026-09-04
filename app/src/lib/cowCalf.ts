import type { CowCalfRecord } from '../db/schema';

export function calfRowLabel(
  row: Pick<CowCalfRecord, 'calfId' | 'cowId' | 'openWithoutCalf'>,
): string {
  if (row.openWithoutCalf) return row.cowId || 'this open cow';
  return row.calfId || row.cowId || 'this calf row';
}
