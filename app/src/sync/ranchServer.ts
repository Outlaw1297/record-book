import { RANCH_LAN_API_PLACEHOLDER } from '../platform';
import { buildSnapshot, mergeSnapshot } from './snapshot';
import type { HerdSnapshot } from './types';
import { ensureSettings } from '../db/schema';

const URL_KEY = 'record-book.ranchApiUrl';
const API_KEY = 'record-book.ranchApiKey';

function fromEnv(name: 'VITE_RANCH_API_URL' | 'VITE_RANCH_API_KEY'): string {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

export function getRanchApiUrl(): string {
  if (typeof localStorage === 'undefined') return fromEnv('VITE_RANCH_API_URL');
  return (localStorage.getItem(URL_KEY) || fromEnv('VITE_RANCH_API_URL')).trim();
}

export function getRanchApiKey(): string {
  if (typeof localStorage === 'undefined') return fromEnv('VITE_RANCH_API_KEY');
  return (localStorage.getItem(API_KEY) || fromEnv('VITE_RANCH_API_KEY')).trim();
}

export function saveRanchApiUrl(value: string): void {
  const trimmed = value.trim();
  if (!trimmed) localStorage.removeItem(URL_KEY);
  else localStorage.setItem(URL_KEY, trimmed);
}

export function saveRanchApiKey(value: string): void {
  const trimmed = value.trim();
  if (!trimmed) localStorage.removeItem(API_KEY);
  else localStorage.setItem(API_KEY, trimmed);
}

export function hasEnvRanchApiUrl(): boolean {
  return Boolean(fromEnv('VITE_RANCH_API_URL'));
}

export function joinRanchApiBase(raw: string, origin: string): string {
  const trimmed = raw.trim().replace(/\/$/, '');
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) {
    return `${origin}${trimmed}`.replace(/\/$/, '');
  }
  return trimmed;
}

function ranchHeaders(method: 'GET' | 'POST' | 'PUT' = 'GET'): Record<string, string> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['Content-Type'] = 'application/json';
  const key = getRanchApiKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export function hasRanchServer(): boolean {
  return Boolean(getRanchApiUrl());
}

export function ranchApiBase(): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return joinRanchApiBase(getRanchApiUrl(), origin);
}

export function ranchUrl(path: string): string {
  const base = ranchApiBase();
  if (!base) return '';
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function ranchUnreachableDetail(error: unknown, healthUrl: string): string {
  const check = healthUrl || `${RANCH_LAN_API_PLACEHOLDER}/health`;
  const raw = error instanceof Error ? error.message.trim() : '';
  const blocked =
    !raw ||
    /failed to fetch|networkerror|load failed|not fetched|err_cleartext|err_failed|err_connection/i.test(
      raw,
    );
  if (blocked) {
    return `Could not reach the ranch. Stay on ranch Wi-Fi, then open ${check} in the phone browser. It should show {"ok":true}.`;
  }
  return raw;
}

function asHerdSnapshot(body: unknown): HerdSnapshot | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const format = record.format;
  if (
    typeof format === 'string' &&
    format !== 'record-book-snapshot' &&
    format !== 'record-book-backup'
  ) {
    return null;
  }
  const settings =
    record.settings && typeof record.settings === 'object'
      ? (record.settings as HerdSnapshot['settings'])
      : { ranchName: 'Record Book', currentYear: new Date().getFullYear() };
  return {
    format: 'record-book-snapshot',
    version: 1,
    exportedAt:
      typeof record.exportedAt === 'string'
        ? record.exportedAt
        : new Date().toISOString(),
    animals: Array.isArray(record.animals) ? record.animals : [],
    cowCalf: Array.isArray(record.cowCalf) ? record.cowCalf : [],
    breeding: Array.isArray(record.breeding) ? record.breeding : [],
    pastures: Array.isArray(record.pastures) ? record.pastures : [],
    pastureAnimals: Array.isArray(record.pastureAnimals) ? record.pastureAnimals : [],
    sales: Array.isArray(record.sales) ? record.sales : [],
    settings,
  };
}

export async function pullFromRanchServer(): Promise<{
  ok: boolean;
  applied: number;
  conflicts: number;
  detail: string;
}> {
  if (!hasRanchServer()) {
    return { ok: false, applied: 0, conflicts: 0, detail: 'Ranch server not configured.' };
  }
  try {
    const response = await fetch(ranchUrl('/v1/export'), {
      headers: ranchHeaders('GET'),
    });
    if (!response.ok) {
      return {
        ok: false,
        applied: 0,
        conflicts: 0,
        detail: `Ranch API ${response.status}`,
      };
    }
    const snapshot = asHerdSnapshot(await response.json().catch(() => null));
    if (!snapshot) {
      return { ok: true, applied: 0, conflicts: 0, detail: 'Ranch database is empty.' };
    }
    const merged = await mergeSnapshot(snapshot);
    return {
      ok: true,
      applied: merged.applied,
      conflicts: merged.conflicts,
      detail:
        merged.applied > 0
          ? `Pulled ${merged.applied} row(s) from the ranch database.`
          : 'Ranch database is up to date.',
    };
  } catch (error) {
    return {
      ok: false,
      applied: 0,
      conflicts: 0,
      detail: ranchUnreachableDetail(error, ranchUrl('/health')),
    };
  }
}

export type RanchDeviceRow = {
  deviceId: string;
  deviceName: string;
  operatorName?: string;
  kind?: string;
  lastSeenAt: string;
};

export async function loadRanchDevices(): Promise<RanchDeviceRow[]> {
  if (!hasRanchServer()) return [];
  try {
    const response = await fetch(ranchUrl('/v1/devices'), {
      headers: ranchHeaders('GET'),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as unknown;
    return Array.isArray(body) ? (body as RanchDeviceRow[]) : [];
  } catch {
    return [];
  }
}

export async function probeRanchServer(): Promise<{ ok: boolean; detail: string }> {
  if (!hasRanchServer()) {
    return { ok: false, detail: 'Enter the ranch API URL first.' };
  }
  try {
    const health = await fetch(ranchUrl('/health'));
    if (!health.ok) {
      return { ok: false, detail: `Ranch API health check failed (${health.status}).` };
    }
    const catalog = await fetch(ranchUrl('/v1'), {
      headers: ranchHeaders('GET'),
    });
    if (catalog.status === 401) {
      return { ok: false, detail: 'Ranch API key was rejected.' };
    }
    if (!catalog.ok) {
      return { ok: false, detail: `Ranch API ${catalog.status}` };
    }
    return {
      ok: true,
      detail: 'Ranch API is reachable. The herd copies here by itself when you have Wi-Fi.',
    };
  } catch (error) {
    return {
      ok: false,
      detail: ranchUnreachableDetail(error, ranchUrl('/health')),
    };
  }
}

export async function pushToRanchServer(): Promise<{
  ok: boolean;
  skipped: boolean;
  detail: string;
}> {
  if (!hasRanchServer()) {
    return { ok: false, skipped: true, detail: 'Ranch server not configured.' };
  }
  const settings = await ensureSettings();
  const snapshot = await buildSnapshot();
  try {
    const response = await fetch(ranchUrl('/v1/sync/snapshot'), {
      method: 'POST',
      headers: ranchHeaders('POST'),
      body: JSON.stringify(snapshot),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      applied?: number;
    };
    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        detail: body.error || `Ranch API ${response.status}`,
      };
    }
    await fetch(ranchUrl(`/v1/devices/${encodeURIComponent(settings.deviceId)}`), {
      method: 'PUT',
      headers: ranchHeaders('PUT'),
      body: JSON.stringify({
        deviceId: settings.deviceId,
        deviceName: settings.deviceName || 'Device',
        operatorName: settings.operatorName,
        kind: settings.deviceKind,
        lastSeenAt: new Date().toISOString(),
      }),
    }).catch(() => undefined);
    return {
      ok: true,
      skipped: false,
      detail: `Ranch database updated (${body.applied ?? 0} rows).`,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      detail: ranchUnreachableDetail(error, ranchUrl('/health')),
    };
  }
}
