import { useEffect, useState } from 'react';
import { getSyncStatus, syncNow, type SyncStatus } from '../db/sync';
import { SYNC_EVENT } from '../sync/types';
import { useToast } from '../ui/Toast';

export function SyncBanner() {
  const toast = useToast();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setStatus(await getSyncStatus());
  }

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener('online', onChange);
    window.addEventListener('offline', onChange);
    window.addEventListener(SYNC_EVENT, onChange);
    const id = window.setInterval(() => void refresh(), 8000);
    return () => {
      window.removeEventListener('online', onChange);
      window.removeEventListener('offline', onChange);
      window.removeEventListener(SYNC_EVENT, onChange);
      window.clearInterval(id);
    };
  }, []);

  if (!status) return null;

  return (
    <div
      className={`sync-banner ${status.online ? 'online' : 'offline'}${status.needsAuth ? ' needs-auth' : ''}`}
      role="status"
    >
      <span>{status.message}</span>
      {status.retryable ? (
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await syncNow();
            toast(result.detail);
            await refresh();
            setBusy(false);
          }}
        >
          {busy ? 'Syncing…' : 'Retry'}
        </button>
      ) : null}
    </div>
  );
}
