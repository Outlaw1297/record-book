import { hasUsableSession } from './auth';
import { syncNow } from './engine';
import { hasRanchServer } from './ranchServer';
import { emitSyncEvent, OUTBOX_EVENT } from './types';

let timer: number | undefined;
let started = false;

export function scheduleSync(delayMs = 2500): void {
  if (typeof window === 'undefined') return;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    void (async () => {
      if (!navigator.onLine && !hasRanchServer()) {
        emitSyncEvent();
        return;
      }
      const connected = await hasUsableSession();
      if (!connected && !hasRanchServer()) {
        emitSyncEvent();
        return;
      }
      await syncNow();
    })();
  }, delayMs);
}

export function startSyncScheduler(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  const onOnline = () => scheduleSync(400);
  const onVisible = () => {
    if (document.visibilityState === 'visible') scheduleSync(800);
  };

  window.addEventListener('online', onOnline);
  window.addEventListener('offline', () => emitSyncEvent());
  window.addEventListener(OUTBOX_EVENT, () => scheduleSync(600));
  document.addEventListener('visibilitychange', onVisible);
  window.setInterval(() => scheduleSync(0), 30_000);
  scheduleSync(1500);
}
