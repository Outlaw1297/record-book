import { useEffect, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  ensureSettings,
  queueChange,
  type SyncProvider,
} from '../db/schema';
import { exportHerdBackup } from '../db/sync';

export function SettingsPage() {
  const settings = useLiveQuery(() => ensureSettings());
  const pending = useLiveQuery(() =>
    db.outbox.filter((c) => !c.syncedAt).count(),
  );

  const [ranchName, setRanchName] = useState('');
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [syncProvider, setSyncProvider] = useState<SyncProvider>('none');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (settings && !hydrated) {
      setRanchName(settings.ranchName);
      setCurrentYear(settings.currentYear);
      setSyncProvider(settings.syncProvider);
      setHydrated(true);
    }
  }, [settings, hydrated]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    const next = {
      ...settings,
      ranchName: ranchName.trim() || 'Record Book',
      currentYear,
      syncProvider,
    };
    await db.settings.put(next);
    await queueChange('settings', '1', 'upsert', next);
    alert('Settings saved on this device.');
  }

  async function downloadBackup() {
    const blob = await exportHerdBackup();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `record-book-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page narrow">
      <header className="page-header">
        <h1>Settings</h1>
        <p className="lede">
          Ranch year, sync provider, and local backup. Data stays on this device
          until cloud sync is connected.
        </p>
      </header>

      <form className="form" onSubmit={onSubmit}>
        <label>
          Ranch name
          <input
            value={ranchName}
            onChange={(e) => setRanchName(e.target.value)}
          />
        </label>
        <label>
          Working year
          <input
            type="number"
            value={currentYear}
            onChange={(e) => setCurrentYear(Number(e.target.value))}
          />
        </label>
        <label>
          Cloud sync backend
          <select
            value={syncProvider}
            onChange={(e) => setSyncProvider(e.target.value as SyncProvider)}
          >
            <option value="none">Not connected yet</option>
            <option value="google-drive">Google Drive</option>
            <option value="dropbox">Dropbox</option>
          </select>
        </label>
        <p className="hint">
          OAuth adapters for Drive/Dropbox come next. Choosing a provider
          prepares this device; Sync now currently marks the local outbox.
          Pending changes: {pending ?? 0}.
        </p>
        <p className="hint">
          Device ID: <code>{settings?.deviceId}</code>
        </p>
        <div className="form-actions">
          <button type="submit" className="btn primary">
            Save settings
          </button>
          <button type="button" className="btn secondary" onClick={downloadBackup}>
            Download JSON backup
          </button>
        </div>
      </form>
    </div>
  );
}
