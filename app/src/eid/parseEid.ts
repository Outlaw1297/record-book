/** ISO 11784/11785 electronic IDs as shown on Allflex discs and stick readers. */

const KNOWN_PREFIXES = new Set([
  '840', // United States
  '124', // Canada
  '826', // United Kingdom
  '036', // Australia
  '064', // New Zealand country
  '964', // New Zealand ICAR
  '982', // Allflex / Destron (US manufacturer)
  '985', // Allflex
  '978',
  '276',
  '250',
  '528',
  '056',
  '372',
  '208',
  '752',
  '578',
  '246',
  '032',
  '076',
  '484',
  '152',
  '170',
  '710',
]);

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function isPlausibleEid(digits: string): boolean {
  if (!/^\d{8,16}$/.test(digits)) return false;
  if (/^0+$/.test(digits)) return false;
  return true;
}

export function scoreEid(digits: string): number {
  if (!isPlausibleEid(digits)) return 0;
  let score = digits.length === 15 ? 8 : 2;
  if (digits.length === 15 && KNOWN_PREFIXES.has(digits.slice(0, 3))) score += 6;
  return score;
}

function rotations(digits: string): string[] {
  const out: string[] = [digits];
  for (let i = 1; i < digits.length; i += 1) {
    out.push(digits.slice(i) + digits.slice(0, i));
  }
  return out;
}

/** Photo OCR can start at the wrong place on the circle; pick the ISO-looking rotation. */
export function bestCircularEid(digits: string): string | undefined {
  const raw = digitsOnly(digits);
  if (raw.length < 8) return undefined;
  const pool = raw.length === 15 ? [...rotations(raw), ...rotations(raw.split('').reverse().join(''))] : [raw];
  let best: string | undefined;
  let bestScore = 0;
  for (const candidate of pool) {
    const score = scoreEid(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : undefined;
}

/**
 * Pull an EID out of wand text (HID keystrokes, BLE serial) or OCR.
 * Handles Decimal (`982 003 123 456 789`), Decimal2, and ISO wrappers.
 */
export function extractEid(raw: string, opts: { complete?: boolean } = {}): string | undefined {
  const upper = raw.toUpperCase();
  const digits = digitsOnly(upper);
  if (digits.length >= 15) {
    let best: string | undefined;
    let bestScore = 0;
    for (let i = 0; i + 15 <= digits.length; i += 1) {
      const slice = digits.slice(i, i + 15);
      const score = scoreEid(slice);
      if (score > bestScore) {
        best = slice;
        bestScore = score;
      }
    }
    if (best && bestScore >= 8) return best;
    const circular = bestCircularEid(digits.slice(-15));
    if (circular) return circular;
  }
  if (opts.complete && isPlausibleEid(digits) && digits.length >= 8) return digits;
  return undefined;
}

export function formatEidGroups(eid: string): string {
  const digits = digitsOnly(eid);
  if (digits.length !== 15) return digits;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9, 12)} ${digits.slice(12, 15)}`;
}
