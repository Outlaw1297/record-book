import { emitSyncEvent } from './types';

export const SYNC_ACTIVITY_EVENT = 'record-book-sync-activity';

export type SyncLogLevel = 'info' | 'warn' | 'error';

export type SyncLogLine = {
  id: number;
  at: string;
  level: SyncLogLevel;
  message: string;
  detail?: string;
};

export type SyncProgress = {
  phase: string;
  current: number;
  total: number;
  label: string;
};

const MAX_LOG = 250;
const EMIT_MS = 200;

let seq = 0;
let logs: SyncLogLine[] = [];
let progress: SyncProgress | null = null;
let emitTimer: ReturnType<typeof setTimeout> | undefined;
let lastEmit = 0;

function fireActivity(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SYNC_ACTIVITY_EVENT));
}

function scheduleActivityEmit(options: { force?: boolean; status?: boolean } = {}): void {
  if (options.status) emitSyncEvent();
  if (typeof window === 'undefined') return;
  if (options.force) {
    if (emitTimer) clearTimeout(emitTimer);
    emitTimer = undefined;
    lastEmit = Date.now();
    fireActivity();
    return;
  }
  const wait = EMIT_MS - (Date.now() - lastEmit);
  if (wait <= 0) {
    lastEmit = Date.now();
    fireActivity();
    return;
  }
  if (emitTimer) return;
  emitTimer = setTimeout(() => {
    emitTimer = undefined;
    lastEmit = Date.now();
    fireActivity();
  }, wait);
}

export function getSyncProgress(): SyncProgress | null {
  return progress;
}

export function getSyncLogs(): SyncLogLine[] {
  return logs;
}

export function setSyncProgress(next: SyncProgress | null): void {
  progress = next;
  scheduleActivityEmit();
}

export function clearSyncProgress(): void {
  progress = null;
  scheduleActivityEmit({ force: true });
}

/** Keep the status bar moving while a ranch GET has no byte progress yet. */
export function startProgressClock(baseLabel: string): () => void {
  const started = Date.now();
  const id = setInterval(() => {
    if (!progress) return;
    const secs = Math.max(1, Math.round((Date.now() - started) / 1000));
    const nextLabel = `${baseLabel} · ${secs}s`;
    if (progress.label === nextLabel) return;
    progress = { ...progress, label: nextLabel };
    scheduleActivityEmit();
  }, 1000);
  return () => clearInterval(id);
}

function pushLog(level: SyncLogLevel, message: string, detail?: string): void {
  seq += 1;
  logs = [
    ...logs,
    {
      id: seq,
      at: new Date().toISOString(),
      level,
      message,
      detail: detail?.trim() ? detail : undefined,
    },
  ].slice(-MAX_LOG);
  scheduleActivityEmit({
    force: level === 'error',
    status: level === 'error',
  });
}

export function logSyncInfo(message: string, detail?: string): void {
  pushLog('info', message, detail);
}

export function logSyncWarn(message: string, detail?: string): void {
  pushLog('warn', message, detail);
}

export function logSyncError(message: string, detail?: string): void {
  pushLog('error', message, detail);
}

export function formatLogTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatSyncLog(lines: SyncLogLine[] = logs): string {
  return lines
    .map((line) => {
      const extra = line.detail ? `\n  ${line.detail}` : '';
      return `${line.at} [${line.level}] ${line.message}${extra}`;
    })
    .join('\n');
}

/** Test helper — keeps production log state isolated. */
export function resetSyncActivity(): void {
  seq = 0;
  logs = [];
  progress = null;
  if (emitTimer) clearTimeout(emitTimer);
  emitTimer = undefined;
  lastEmit = 0;
}
