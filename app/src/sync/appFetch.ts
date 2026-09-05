import { CapacitorHttp } from '@capacitor/core';
import { isNativeApp } from '../platform';

export function isHttpUrl(url: string): boolean {
  return url.startsWith('http://');
}

export function isDnsFailure(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  return /unable to resolve host|unknownhost|err_name_not_resolved|no address associated/i.test(
    raw,
  );
}

export function isNetworkFailure(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  return (
    isDnsFailure(error) ||
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

/** Native OkHttp for cleartext LAN URLs when Chromium blocks mixed content. */
export async function nativeHttpFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const result = await CapacitorHttp.request({
    url,
    method,
    headers: headersRecord(init.headers),
    data: typeof init.body === 'string' ? init.body : undefined,
    responseType: 'text',
    connectTimeout: 20_000,
    readTimeout: 120_000,
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

/**
 * Use Chromium’s stack first (same DNS as the phone browser). Only fall back
 * to native HTTP for http:// ranch URLs, where mixed content can still block.
 */
export async function appFetch(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (!isNativeApp() || !isHttpUrl(url) || !isNetworkFailure(error)) {
      throw error;
    }
    try {
      return await nativeHttpFetch(url, init);
    } catch {
      throw error;
    }
  }
}
