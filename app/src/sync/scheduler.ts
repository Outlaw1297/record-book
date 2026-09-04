import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { syncNow } from './engine';
import { emitSyncEvent, OUTBOX_EVENT } from './types';

let pauseCount = 0;
let timer: number | undefined;
let started = false;
let nativeListeners = false;

export function pauseSyncScheduler(): void {
  pauseCount += 1;
  if (typeof window !== 'undefined' && timer) {
    window.clearTimeout(timer);
    timer = undefined;
  }
}

export function resumeSyncScheduler(): void {
  pauseCount = Math.max(0, pauseCount - 1);
}

export function isSyncSchedulerPaused(): boolean {
  return pauseCount > 0;
}

/** Debounce so a burst of calf saves becomes one copy. */
export function scheduleSync(delayMs = 400): void {
  if (typeof window === 'undefined' || pauseCount > 0) return;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = undefined;
    if (pauseCount > 0) return;
    void syncNow().catch(() => emitSyncEvent());
  }, delayMs);
}

function onForeground(): void {
  scheduleSync(200);
}

export function startSyncScheduler(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  window.addEventListener('online', onForeground);
  window.addEventListener('focus', onForeground);
  window.addEventListener('pageshow', onForeground);
  window.addEventListener('offline', () => emitSyncEvent());
  window.addEventListener(OUTBOX_EVENT, () => scheduleSync(300));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onForeground();
  });
  window.setInterval(() => scheduleSync(0), 8_000);
  scheduleSync(800);

  if (Capacitor.isNativePlatform() && !nativeListeners) {
    nativeListeners = true;
    void App.addListener('resume', onForeground);
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) onForeground();
    });
  }
}
