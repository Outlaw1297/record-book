import { CapacitorHttp } from '@capacitor/core';
import { isNativeApp } from '../platform';

/** Chromium fetch of http:// from https://localhost can hang (mixed content). */
export const CHROMIUM_HTTP_BUDGET_MS = 8_000;
export const DEFAULT_FETCH_MS = 120_000;
export const RANCH_HEALTH_MS = 15_000;
export const RANCH_EXPORT_MS = 180_000;

export function isHttpUrl(url: string): boolean {
  return url.startsWith('http://');
}

export function isLanHttpUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === 'nas' ||
      host.endsWith('.local') ||
      host.endsWith('.lan') ||
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)
    );
  } catch {
    return true;
  }
}

/** Public http:// ranch URLs also serve TLS. HTTPS avoids mixed-content hangs. */
export function httpsTwinUrl(url: string): string | undefined {
  if (!isHttpUrl(url) || isLanHttpUrl(url)) return undefined;
  return `https://${url.slice('http://'.length)}`;
}

export function isDnsFailure(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  return /unable to resolve host|unknownhost|err_name_not_resolved|no address associated/i.test(
    raw,
  );
}

export function isAbortFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error ? String(error.name) : '';
  const raw = 'message' in error ? String(error.message) : '';
  return name === 'AbortError' || /aborted|timed out|the user aborted/i.test(raw);
}

export function isNetworkFailure(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  return (
    isDnsFailure(error) ||
    isAbortFailure(error) ||
    !raw.trim() ||
    /failed to fetch|networkerror|load failed|not fetched|err_cleartext|err_failed|err_connection|err_address_unreachable/i.test(
      raw,
    )
  );
}

function headersRecord(headers?: HeadersInit): Record<string, string> {
  const record: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function withTimeout(init: RequestInit, ms: number): { init: RequestInit; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const parent = init.signal;
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return { init: { ...init, signal: controller.signal }, cancel: () => clearTimeout(timer) };
}

async function chromiumFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const { init: next, cancel } = withTimeout(init, timeoutMs);
  try {
    return await fetch(url, next);
  } finally {
    cancel();
  }
}

/** Native OkHttp for remaining http:// LAN URLs when Chromium mixed content hangs. */
export async function nativeHttpFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_FETCH_MS,
): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const result = await CapacitorHttp.request({
    url,
    method,
    headers: headersRecord(init.headers),
    data: typeof init.body === 'string' ? init.body : undefined,
    responseType: 'text',
    connectTimeout: Math.min(20_000, timeoutMs),
    readTimeout: timeoutMs,
  });
  const body =
    typeof result.data === 'string'
      ? result.data
      : result.data == null
        ? ''
        : JSON.stringify(result.data);
  return new Response(body, {
    status: result.status,
    headers: result.headers as HeadersInit,
  });
}

async function firstOk(
  attempts: Array<() => Promise<Response>>,
): Promise<Response> {
  let last: unknown;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error('Could not reach the ranch.');
}

/**
 * Chromium first (same DNS as the phone browser). Public http:// ranch URLs
 * upgrade to https:// so the APK does not hang on mixed content. Native HTTP
 * is last-resort for LAN NAS addresses.
 */
export async function appFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_FETCH_MS,
): Promise<Response> {
  if (isNativeApp() && isHttpUrl(url)) {
    const https = httpsTwinUrl(url);
    const attempts: Array<() => Promise<Response>> = [];
    if (https) {
      attempts.push(() => chromiumFetch(https, init, timeoutMs));
    }
    if (isLanHttpUrl(url)) {
      attempts.push(() => nativeHttpFetch(url, init, timeoutMs));
    }
    attempts.push(() =>
      chromiumFetch(url, init, Math.min(timeoutMs, CHROMIUM_HTTP_BUDGET_MS)),
    );
    attempts.push(() => nativeHttpFetch(url, init, timeoutMs));
    return firstOk(attempts);
  }

  try {
    return await chromiumFetch(url, init, timeoutMs);
  } catch (error) {
    if (!isNativeApp() || !isHttpUrl(url) || !isNetworkFailure(error)) {
      throw error;
    }
    return nativeHttpFetch(url, init, timeoutMs);
  }
}
