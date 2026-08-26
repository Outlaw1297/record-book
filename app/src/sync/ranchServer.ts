import { buildSnapshot } from './snapshot';
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

function ranchHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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

export async function probeRanchServer(): Promise<{ ok: boolean; detail: string }> {
  if (!hasRanchServer()) {
    return { ok: false, detail: 'Enter the ranch API URL first.' };
  }
  try {
    const health = await fetch(`${ranchApiBase()}/health`);
    if (!health.ok) {
      return { ok: false, detail: `Ranch API health check failed (${health.status}).` };
    }
    const catalog = await fetch(`${ranchApiBase()}/v1/`, {
      headers: ranchHeaders(),
    });
    if (catalog.status === 401) {
      return { ok: false, detail: 'Ranch API key was rejected.' };
    }
    if (!catalog.ok) {
      return { ok: false, detail: `Ranch API ${catalog.status}` };
    }
    return {
      ok: true,
      detail: 'Ranch API is reachable. Sync now will copy this device’s herd into Postgres.',
    };
  } catch (error) {
    return {
      ok: false,
      detail:
        error instanceof Error
          ? error.message
          : 'Could not reach the ranch API. Check the URL and that Docker is running.',
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
    const response = await fetch(`${ranchApiBase()}/v1/sync/snapshot`, {
      method: 'POST',
      headers: ranchHeaders(),
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
    await fetch(`${ranchApiBase()}/v1/devices/${encodeURIComponent(settings.deviceId)}`, {
      method: 'PUT',
      headers: ranchHeaders(),
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
      detail:
        error instanceof Error ? error.message : 'Could not reach the ranch API.',
    };
  }
}
