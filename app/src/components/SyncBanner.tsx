import { useEffect, useRef, useState } from 'react';
import { getSyncStatus, syncNow, type SyncStatus } from '../db/sync';
import {
  formatLogTime,
  formatSyncLog,
  getSyncLogs,
  getSyncProgress,
  SYNC_ACTIVITY_EVENT,
  type SyncLogLine,
  type SyncProgress,
} from '../sync/activity';
import { SYNC_EVENT } from '../sync/types';
import { useToast } from '../ui/Toast';

function readActivity(): { progress: SyncProgress | null; logs: SyncLogLine[] } {
  return { progress: getSyncProgress(), logs: getSyncLogs() };
}

export function SyncBanner() {
  const toast = useToast();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState(readActivity);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const logRef = useRef<HTMLOListElement>(null);

  function applyActivity() {
    setActivity(readActivity());
    requestAnimationFrame(() => {
      const el = logRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  async function refresh() {
    const next = await getSyncStatus();
    setStatus(next);
    applyActivity();
    if (next.error) setDetailsOpen(true);
  }

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    const onActivity = () => applyActivity();
    window.addEventListener('online', onChange);
    window.addEventListener('offline', onChange);
    window.addEventListener(SYNC_EVENT, onChange);
    window.addEventListener(SYNC_ACTIVITY_EVENT, onActivity);
    const id = window.setInterval(() => void refresh(), 8000);
    return () => {
      window.removeEventListener('online', onChange);
      window.removeEventListener('offline', onChange);
      window.removeEventListener(SYNC_EVENT, onChange);
      window.removeEventListener(SYNC_ACTIVITY_EVENT, onActivity);
      window.clearInterval(id);
    };
  }, []);

  if (!status) return null;

  const progress = activity.progress;
  const logs = activity.logs;
  const errorCount = logs.filter((line) => line.level === 'error').length;
  const hasError = Boolean(status.error);
  const knownTotal = Boolean(progress && progress.total > 0);
  const started = Boolean(progress && progress.current > 0);
  const percent =
    progress && knownTotal && started
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : null;
  const headline = progress ? progress.label : status.message;

  return (
    <div
      className={`sync-banner ${status.online ? 'online' : 'offline'}${status.needsAuth ? ' needs-auth' : ''}${hasError ? ' error' : ''}${progress ? ' busy' : ''}`}
      role="status"
    >
      <div className="sync-banner-main">
        <div className="sync-banner-copy">
          <span>{headline}</span>
          {progress ? (
            <span className="sync-banner-meta">
              {percent != null
                ? `${progress.current} / ${progress.total} · ${percent}%`
                : progress.total > 1
                  ? `${progress.current} / ${progress.total}`
                  : 'working'}
            </span>
          ) : null}
        </div>
        {status.retryable ? (
          <button
            type="button"
            className="btn ghost"
            disabled={busy || Boolean(progress)}
            onClick={async () => {
              setBusy(true);
              const result = await syncNow();
              toast(result.detail);
              await refresh();
              setBusy(false);
            }}
          >
            {busy || progress ? 'Syncing…' : 'Sync'}
          </button>
        ) : null}
      </div>
      {progress ? (
        <div
          className="sync-banner-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? 0}
          aria-label={progress.label}
        >
          <div
            className={`sync-banner-progress-bar${percent == null ? ' indeterminate' : ''}`}
            style={percent == null ? undefined : { width: `${percent}%` }}
          />
        </div>
      ) : null}
      {logs.length > 0 ? (
        <details
          className="sync-banner-details"
          open={detailsOpen}
          onToggle={(event) => {
            setDetailsOpen(event.currentTarget.open);
          }}
        >
          <summary>
            Details
            {errorCount > 0 ? ` · ${errorCount} error${errorCount === 1 ? '' : 's'}` : ''}
            {` · ${logs.length} log line${logs.length === 1 ? '' : 's'}`}
          </summary>
          <div className="sync-banner-log-tools">
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                const text = formatSyncLog(logs);
                void navigator.clipboard.writeText(text).then(
                  () => toast('Copied the sync log.'),
                  () => toast('Could not copy the log.'),
                );
              }}
            >
              Copy log
            </button>
          </div>
          <ol className="sync-banner-log" ref={logRef}>
            {logs.slice(-60).map((line) => (
              <li key={line.id} className={`sync-log-${line.level}`}>
                <time dateTime={line.at}>{formatLogTime(line.at)}</time>
                <span>{line.message}</span>
                {line.detail ? <pre>{line.detail}</pre> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
