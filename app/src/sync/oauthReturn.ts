import { App } from '@capacitor/app';
import { isNativeApp } from '../platform';

type PendingReturn = {
  resolve: (params: URLSearchParams) => void;
  reject: (error: Error) => void;
  timer: number;
};

let pending: PendingReturn | null = null;
let listening = false;
let lastHandledKey: string | null = null;

function oauthReturnKey(params: URLSearchParams): string {
  return `${params.get('code') ?? ''}|${params.get('state') ?? ''}|${params.get('error') ?? ''}|${params.get('error_description') ?? ''}`;
}

function hasOAuthResult(params: URLSearchParams): boolean {
  return Boolean(
    params.get('code') || params.get('error') || params.get('error_description'),
  );
}

/** Path used by the PWA, and by the APK if the WebView follows the redirect. */
export function isOAuthCallbackPath(pathname: string): boolean {
  const path = pathname.split('?')[0]?.replace(/\/+$/, '') || '';
  return path === '/oauth/callback' || path === '/callback';
}

export function isOAuthCallbackLocation(
  pathname: string,
  hostname = typeof window !== 'undefined' ? window.location.hostname : '',
): boolean {
  if (pathname.split('?')[0]?.replace(/\/+$/, '') === '/oauth/callback') return true;
  return hostname === 'oauth' && isOAuthCallbackPath(pathname);
}

/**
 * Query params from a Google/Dropbox return, whether the WebView kept
 * https://localhost/oauth/callback or Android delivered the custom scheme.
 */
export function parseOAuthReturnUrl(url: string): URLSearchParams | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const withoutHash = trimmed.split('#')[0] ?? trimmed;
  const pathPart = withoutHash.split('?')[0] ?? '';
  const isCallback =
    /oauth\/callback\/?$/i.test(pathPart) ||
    /:\/\/oauth\/callback\/?$/i.test(pathPart);
  if (!isCallback) return null;
  const query = withoutHash.includes('?') ? withoutHash.slice(withoutHash.indexOf('?') + 1) : '';
  return new URLSearchParams(query);
}

function startTimer(timeoutMs: number, onFire: () => void): number {
  const assign = typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout : undefined;
  if (!assign) {
    throw new Error('Sign-in wait requires a timer.');
  }
  return assign(onFire, timeoutMs) as unknown as number;
}

function stopTimer(id: number): void {
  if (typeof globalThis.clearTimeout === 'function') {
    globalThis.clearTimeout(id);
  }
}

function clearPending(error?: Error): void {
  if (!pending) return;
  stopTimer(pending.timer);
  const current = pending;
  pending = null;
  if (error) current.reject(error);
}

/** Hands the return to startOAuth if a native Dropbox wait is in flight. */
export function deliverNativeOAuthReturn(params: URLSearchParams): boolean {
  if (!pending) return false;
  const current = pending;
  clearPending();
  current.resolve(params);
  return true;
}

/**
 * Consumes a native OAuth return once.
 * `waiter` — startOAuth is still running and will exchange the code.
 * `orphan` — the PKCE session is in localStorage; caller must completeOAuthCallback.
 * `none` — already handled, or not an OAuth result.
 */
export function takeNativeOAuthReturn(
  params: URLSearchParams,
): 'waiter' | 'orphan' | 'none' {
  if (!hasOAuthResult(params)) return 'none';
  const key = oauthReturnKey(params);
  if (lastHandledKey === key) return 'none';
  if (deliverNativeOAuthReturn(params)) {
    lastHandledKey = key;
    return 'waiter';
  }
  lastHandledKey = key;
  return 'orphan';
}

async function completeOrphanedNativeOAuth(params: URLSearchParams): Promise<void> {
  try {
    const { completeOAuthCallback } = await import('./auth');
    const result = await completeOAuthCallback(params);
    if (result.ok && typeof window !== 'undefined') {
      window.location.replace('/settings?sync=connected');
    }
  } catch {
    /* Settings can start sign-in again. */
  }
}

function receiveNativeOAuthReturn(params: URLSearchParams): void {
  if (takeNativeOAuthReturn(params) === 'orphan') {
    void completeOrphanedNativeOAuth(params);
  }
}

export async function prepareNativeOAuthReturn(): Promise<void> {
  if (!isNativeApp() || listening || typeof window === 'undefined') return;
  listening = true;
  try {
    await App.addListener('appUrlOpen', ({ url }) => {
      const params = parseOAuthReturnUrl(url);
      if (params) receiveNativeOAuthReturn(params);
    });
  } catch {
    listening = false;
    return;
  }
  try {
    const launch = await App.getLaunchUrl();
    if (launch?.url) {
      const params = parseOAuthReturnUrl(launch.url);
      if (params) receiveNativeOAuthReturn(params);
    }
  } catch {
    /* Launch URL is best-effort; the listener still receives later returns. */
  }
}

export function openExternalAuthUrl(url: string): void {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    window.location.assign(url);
  }
}

export async function waitForNativeOAuthReturn(
  timeoutMs = 180_000,
): Promise<URLSearchParams> {
  if (pending) {
    clearPending(new Error('Another sign-in is already waiting.'));
  }
  const ready = new Promise<URLSearchParams>((resolve, reject) => {
    pending = {
      resolve,
      reject,
      timer: startTimer(timeoutMs, () => {
        pending = null;
        reject(
          new Error(
            'Sign-in did not finish after returning to HerdLedger. Close Google or Dropbox and try again.',
          ),
        );
      }),
    };
  });
  await prepareNativeOAuthReturn();
  return ready;
}
