import type { CowCalfRecord } from '../db/schema';

export function calfRowLabel(
  row: Pick<CowCalfRecord, 'calfId' | 'cowId' | 'openWithoutCalf'>,
): string {
  if (row.openWithoutCalf) return row.cowId || 'this open cow';
  return row.calfId || row.cowId || 'this calf row';
}

const EASE_BY_CODE: Record<string, string> = {
  '1': 'No difficulty - no assistance',
  '2': 'Minor difficulty - some assistance',
  '3': 'Major difficulty - mechanical assistance',
  '4': 'Cesarean section or other surgery',
  '5': 'Abnormal presentation',
};

export function animalEaseFromCode(code: string): string | undefined {
  return EASE_BY_CODE[code.trim()] || undefined;
}

export function codeFromAnimalEase(ease: string): string | undefined {
  const value = ease.trim();
  for (const [code, label] of Object.entries(EASE_BY_CODE)) {
    if (label === value) return code;
  }
  return undefined;
}
