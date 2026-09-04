import { DEFAULT_RANCH_NAME } from '../brand';
import { RANCH_LAN_API_PLACEHOLDER } from '../platform';
import { buildSnapshot, mergeSnapshot } from './snapshot';
import type { CloudProvider, HerdSnapshot } from './types';
import { ensureSettings } from '../db/schema';
import {
  clearSyncProgress,
  logSyncError,
  logSyncInfo,
  logSyncWarn,
  setSyncProgress,
} from './activity';

const URL_KEY = 'record-book.ranchApiUrl';
const API_KEY = 'record-book.ranchApiKey';
/** Rows per POST so nginx does not 504 a 35k-row Cow Sense import. */
export const RANCH_SNAPSHOT_CHUNK = 250;

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

export function ranchHttpDetail(status: number, bodyError?: string): string {
  if (status === 504 || status === 502) {
    return `Ranch API ${status}: the NAS timed out writing the herd. A Cow Sense import is a large copy. Wait, then tap Sync.`;
  }
  return bodyError || `Ranch API ${status}`;
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
      : { ranchName: DEFAULT_RANCH_NAME, currentYear: new Date().getFullYear() };
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
    logSyncInfo('GET /v1/export · reading ranch database');
    setSyncProgress({
      phase: 'ranch-pull',
      current: 0,
      total: 1,
      label: 'Reading ranch database',
    });
    const response = await ranchFetch('/v1/export');
    if (!response.ok) {
      const detail = ranchHttpDetail(response.status);
      logSyncError(`HTTP ${response.status} · GET /v1/export`, detail);
      return {
        ok: false,
        applied: 0,
        conflicts: 0,
        detail,
      };
    }
    const snapshot = asHerdSnapshot(await response.json().catch(() => null));
    if (!snapshot) {
      logSyncInfo('HTTP 200 · GET /v1/export · ranch database is empty');
      return { ok: true, applied: 0, conflicts: 0, detail: 'Ranch database is empty.' };
    }
    const merged = await mergeSnapshot(snapshot);
    const detail =
      merged.applied > 0
        ? `Pulled ${merged.applied} row(s) from the ranch database.`
        : 'Ranch database is up to date.';
    logSyncInfo(
      `HTTP 200 · GET /v1/export · applied ${merged.applied}` +
        (merged.conflicts ? ` · ${merged.conflicts} overlap(s)` : ''),
    );
    return {
      ok: true,
      applied: merged.applied,
      conflicts: merged.conflicts,
      detail,
    };
  } catch (error) {
    const detail = ranchUnreachableDetail(error, ranchUrl('/health'));
    logSyncError('GET /v1/export failed', detail);
    return {
      ok: false,
      applied: 0,
      conflicts: 0,
      detail,
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
      return { ok: false, detail: ranchHttpDetail(catalog.status) };
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

const SNAPSHOT_KEYS = [
  'animals',
  'cowCalf',
  'breeding',
  'pastures',
  'pastureAnimals',
  'sales',
  'treatments',
] as const;

export function chunkList<T>(rows: T[], size = RANCH_SNAPSHOT_CHUNK): T[][] {
  if (rows.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}

export function snapshotChunkLabel(body: Record<string, unknown>): string {
  for (const key of SNAPSHOT_KEYS) {
    const rows = body[key];
    if (Array.isArray(rows) && rows.length > 0) {
      return `${key} · ${rows.length} row${rows.length === 1 ? '' : 's'}`;
    }
  }
  if (body.settings) return 'settings';
  return 'snapshot';
}

export function snapshotPushBodies(snapshot: HerdSnapshot): Array<Record<string, unknown>> {
  const rows = SNAPSHOT_KEYS.reduce((sum, key) => sum + (snapshot[key]?.length ?? 0), 0);
  if (rows <= RANCH_SNAPSHOT_CHUNK) {
    return [
      {
        format: snapshot.format,
        version: snapshot.version,
        exportedAt: snapshot.exportedAt,
        settings: snapshot.settings,
        animals: snapshot.animals,
        cowCalf: snapshot.cowCalf,
        breeding: snapshot.breeding,
        pastures: snapshot.pastures,
        pastureAnimals: snapshot.pastureAnimals,
        sales: snapshot.sales,
        treatments: snapshot.treatments,
      },
    ];
  }
  const bodies: Array<Record<string, unknown>> = [
    {
      format: snapshot.format,
      version: snapshot.version,
      exportedAt: snapshot.exportedAt,
      settings: snapshot.settings,
    },
  ];
  for (const key of SNAPSHOT_KEYS) {
    for (const chunk of chunkList(snapshot[key] ?? [])) {
      bodies.push({
        format: snapshot.format,
        version: snapshot.version,
        exportedAt: snapshot.exportedAt,
        [key]: chunk,
      });
    }
  }
  return bodies;
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
  const bodies = snapshotPushBodies(snapshot);
  try {
    let applied = 0;
    logSyncInfo(
      `Writing ranch database · ${bodies.length} request${bodies.length === 1 ? '' : 's'}`,
    );
    for (let index = 0; index < bodies.length; index += 1) {
      const last = index === bodies.length - 1;
      const path = last ? '/v1/sync/snapshot' : '/v1/sync/snapshot?backup=0';
      const label = snapshotChunkLabel(bodies[index]);
      setSyncProgress({
        phase: 'ranch',
        current: index + 1,
        total: bodies.length,
        label: `Ranch database ${index + 1}/${bodies.length} · ${label}`,
      });
      logSyncInfo(`POST ${path} · chunk ${index + 1}/${bodies.length} · ${label}`);
      let response = await ranchFetch(path, 'POST', JSON.stringify(bodies[index]));
      if ((response.status === 504 || response.status === 502) && !last) {
        logSyncWarn(
          `HTTP ${response.status} on chunk ${index + 1}/${bodies.length}, retrying…`,
          ranchHttpDetail(response.status),
        );
        await new Promise((resolve) => setTimeout(resolve, 1500));
        response = await ranchFetch(path, 'POST', JSON.stringify(bodies[index]));
      }
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        applied?: number;
      };
      if (!response.ok) {
        const detail = ranchHttpDetail(response.status, body.error);
        logSyncError(
          `HTTP ${response.status} · chunk ${index + 1}/${bodies.length} · POST ${path}`,
          detail,
        );
        return {
          ok: false,
          skipped: false,
          detail,
        };
      }
      applied += body.applied ?? 0;
      logSyncInfo(
        `HTTP ${response.status} · chunk ${index + 1}/${bodies.length} applied ${body.applied ?? 0} (total ${applied})`,
      );
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
    const detail = `Ranch database updated (${applied} rows).`;
    logSyncInfo(detail);
    return {
      ok: true,
      skipped: false,
      detail,
    };
  } catch (error) {
    const detail = ranchUnreachableDetail(error, ranchUrl('/health'));
    logSyncError('Ranch snapshot POST failed', detail);
    return {
      ok: false,
      skipped: false,
      detail,
    };
  } finally {
    clearSyncProgress();
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
        const detail =
          'Redeploy the Portainer stack so this NAS can copy the herd to Dropbox or Drive.';
        logSyncError(`HTTP 404 · POST /v1/cloud-backup/now`, detail);
        return {
          ok: false,
          detail,
        };
      }
      const detail = body.detail || `Ranch API ${response.status}`;
      logSyncError(`HTTP ${response.status} · POST /v1/cloud-backup/now`, detail);
      return {
        ok: false,
        detail,
      };
    }
    const detail = body.detail || 'NAS copied the herd to Dropbox or Drive.';
    logSyncInfo(`HTTP ${response.status} · POST /v1/cloud-backup/now · ${detail}`);
    return { ok: true, detail };
  } catch (error) {
    const detail = ranchUnreachableDetail(error, ranchUrl('/health'));
    logSyncError('POST /v1/cloud-backup/now failed', detail);
    return {
      ok: false,
      detail,
    };
  }
}
