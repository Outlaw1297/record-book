export function iso(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

export function newer(remote: string | undefined, local: Date | string | null): boolean {
  if (!remote) return false;
  if (!local) return true;
  const left = new Date(remote).toISOString();
  const right = local instanceof Date ? local.toISOString() : new Date(String(local)).toISOString();
  return left >= right;
}

export function asBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function asText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value);
  return text.length ? text : null;
}

export function asInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
