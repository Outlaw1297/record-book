import { RANCH_LAN_API_PLACEHOLDER } from '../platform';
import { buildSnapshot, mergeSnapshot } from './snapshot';
import type { CloudProvider, HerdSnapshot } from './types';
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

function ranchHeaders(method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET'): Record<string, string> {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  };
  if (method !== 'GET') headers['Content-Type'] = 'application/json';
  const key = getRanchApiKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function ranchFetch(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: string) {
  return fetch(ranchUrl(path), ranchRequestInit(method, body));
}

export function ranchRequestInit(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: string,
): RequestInit {
  return {
    method,
    cache: 'no-store',
    headers: ranchHeaders(method),
    body,
  };
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
    treatments: Array.isArray(record.treatments) ? record.treatments : [],
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
    const response = await ranchFetch('/v1/export');
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
    const response = await ranchFetch('/v1/devices');
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
    const health = await ranchFetch('/health');
    if (!health.ok) {
      return { ok: false, detail: `Ranch API health check failed (${health.status}).` };
    }
    const catalog = await ranchFetch('/v1');
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
    const response = await ranchFetch(
      '/v1/sync/snapshot',
      'POST',
      JSON.stringify(snapshot),
    );
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
    await ranchFetch(
      `/v1/devices/${encodeURIComponent(settings.deviceId)}`,
      'PUT',
      JSON.stringify({
        deviceId: settings.deviceId,
        deviceName: settings.deviceName || 'Device',
        operatorName: settings.operatorName,
        kind: settings.deviceKind,
        lastSeenAt: new Date().toISOString(),
      }),
    ).catch(() => undefined);
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

export type NasCloudAccount = {
  provider: CloudProvider;
  accountEmail?: string;
  accountName?: string;
  lastBackupAt?: string;
  lastError?: string;
};

export async function listNasCloudBackup(): Promise<NasCloudAccount[]> {
  if (!hasRanchServer()) return [];
  try {
    const response = await ranchFetch('/v1/cloud-backup');
    if (!response.ok) return [];
    const body = (await response.json()) as { accounts?: NasCloudAccount[] };
    return Array.isArray(body.accounts) ? body.accounts : [];
  } catch {
    return [];
  }
}

export async function shareCloudLoginWithNas(input: {
  provider: CloudProvider;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  accountEmail?: string;
  accountName?: string;
  clientId: string;
}): Promise<{ ok: boolean; detail: string }> {
  if (!hasRanchServer()) {
    return { ok: false, detail: 'Ranch server not configured.' };
  }
  try {
    const response = await ranchFetch(
      `/v1/cloud-backup/${encodeURIComponent(input.provider)}`,
      'PUT',
      JSON.stringify({
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt,
        accountEmail: input.accountEmail,
        accountName: input.accountName,
        clientId: input.clientId,
      }),
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return { ok: false, detail: body.error || `Ranch API ${response.status}` };
    }
    return { ok: true, detail: 'This NAS will copy the herd to that account.' };
  } catch (error) {
    return {
      ok: false,
      detail: ranchUnreachableDetail(error, ranchUrl('/health')),
    };
  }
}

export async function removeNasCloudLogin(provider: CloudProvider): Promise<void> {
  if (!hasRanchServer()) return;
  await ranchFetch(
    `/v1/cloud-backup/${encodeURIComponent(provider)}`,
    'DELETE',
  ).catch(() => undefined);
}

export async function requestNasBackup(): Promise<{ ok: boolean; detail: string }> {
  if (!hasRanchServer()) {
    return { ok: false, detail: 'Ranch server not configured.' };
  }
  try {
    const response = await ranchFetch('/v1/cloud-backup/now', 'POST');
    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      detail?: string;
    };
    if (!response.ok) {
      if (response.status === 404) {
        return {
          ok: false,
          detail:
            'Redeploy the Portainer stack so this NAS can copy the herd to Dropbox or Drive.',
        };
      }
      return {
        ok: false,
        detail: body.detail || `Ranch API ${response.status}`,
      };
    }
    return { ok: true, detail: body.detail || 'NAS copied the herd to Dropbox or Drive.' };
  } catch (error) {
    return {
      ok: false,
      detail: ranchUnreachableDetail(error, ranchUrl('/health')),
    };
  }
}
