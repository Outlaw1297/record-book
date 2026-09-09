import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { isNativeApp } from '../platform';

type PendingReturn = {
  resolve: (params: URLSearchParams) => void;
  reject: (error: Error) => void;
  timer: number;
};

export type NativeOAuthFinish = 'delivered' | 'completed' | 'failed';

let pending: PendingReturn | null = null;
let listening = false;
let launchUrlConsumed = false;
let handledKey: string | null = null;
let handledOutcome: NativeOAuthFinish | null = null;
let exchangeInFlight: Promise<NativeOAuthFinish> | null = null;

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

function returnKey(params: URLSearchParams): string {
  return params.get('code') || params.get('error') || params.toString();
}

function closeAuthBrowser(): void {
  void Browser.close().catch(() => undefined);
}

function rememberOutcome(params: URLSearchParams, outcome: NativeOAuthFinish): void {
  handledKey = returnKey(params);
  handledOutcome = outcome;
}

/** Hands the return to startOAuth if a native Dropbox wait is in flight. */
export function deliverNativeOAuthReturn(params: URLSearchParams): boolean {
  if (!pending) return false;
  const current = pending;
  clearPending();
  rememberOutcome(params, 'delivered');
  closeAuthBrowser();
  current.resolve(params);
  return true;
}

/**
 * Give the code to an in-flight native login, or exchange it using the
 * PKCE session in localStorage when the waiter died (WebView reload / process death).
 */
export async function finishNativeOAuthReturn(
  params: URLSearchParams,
): Promise<NativeOAuthFinish> {
  if (deliverNativeOAuthReturn(params)) return 'delivered';
  if (exchangeInFlight) return exchangeInFlight;
  if (handledKey === returnKey(params) && handledOutcome) return handledOutcome;

  exchangeInFlight = (async () => {
    try {
      const { completeOAuthCallback } = await import('./auth');
      const result = await completeOAuthCallback(params);
      const outcome: NativeOAuthFinish = result.ok ? 'completed' : 'failed';
      rememberOutcome(params, outcome);
      closeAuthBrowser();
      return outcome;
    } catch {
      rememberOutcome(params, 'failed');
      closeAuthBrowser();
      return 'failed';
    } finally {
      exchangeInFlight = null;
    }
  })();
  return exchangeInFlight;
}

async function handleNativeReturnUrl(url: string): Promise<void> {
  const params = parseOAuthReturnUrl(url);
  if (!params) return;
  const outcome = await finishNativeOAuthReturn(params);
  if (
    outcome !== 'completed' ||
    typeof window === 'undefined' ||
    isOAuthCallbackLocation(window.location.pathname, window.location.hostname)
  ) {
    return;
  }
  // Cold ACTION_VIEW start keeps the WebView on /; bounce never runs.
  if (!window.location.pathname.startsWith('/settings')) {
    window.location.replace('/settings?sync=connected');
  }
}

export function abortNativeOAuthReturn(error: Error): void {
  clearPending(error);
}

export async function prepareNativeOAuthReturn(): Promise<void> {
  if (!isNativeApp() || typeof window === 'undefined') return;
  if (!listening) {
    listening = true;
    try {
      await App.addListener('appUrlOpen', ({ url }) => {
        void handleNativeReturnUrl(url);
      });
    } catch {
      listening = false;
    }
  }
  if (launchUrlConsumed) return;
  launchUrlConsumed = true;
  try {
    const launch = await App.getLaunchUrl();
    if (launch?.url) await handleNativeReturnUrl(launch.url);
  } catch {
    /* Launch URL is only set for a cold ACTION_VIEW start. */
  }
}

/** Opens Dropbox in a Custom Tab so the Capacitor WebView stays on HerdLedger. */
export async function openExternalAuthUrl(url: string): Promise<void> {
  await Browser.open({ url });
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
