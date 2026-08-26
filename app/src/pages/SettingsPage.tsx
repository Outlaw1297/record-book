import { useEffect, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  ensureSettings,
  queueChange,
  type SyncProvider,
} from '../db/schema';
import { exportHerdBackup } from '../db/sync';
import { Field } from '../ui/Field';
import { useToast } from '../ui/Toast';

export function SettingsPage() {
  const toast = useToast();
  const settings = useLiveQuery(() => ensureSettings());
  const pending = useLiveQuery(() =>
    db.outbox.filter((c) => !c.syncedAt).count(),
  );

  const [ranchName, setRanchName] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [syncProvider, setSyncProvider] = useState<SyncProvider>('none');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (settings && !hydrated) {
      setRanchName(settings.ranchName);
      setOperatorName(settings.operatorName ?? '');
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
      operatorName: operatorName.trim(),
      currentYear,
      syncProvider,
    };
    await db.settings.put(next);
    await queueChange('settings', '1', 'upsert', next);
    toast('Settings saved on this device');
  }

  async function downloadBackup() {
    const blob = await exportHerdBackup();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `record-book-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded');
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <p className="lede">
          Ranch year, operator, and sync. Data stays here until cloud is connected.
        </p>
      </header>

      <form className="form" onSubmit={onSubmit} style={{ marginTop: '1rem' }}>
        <Field label="Ranch name">
          <input
            value={ranchName}
            onChange={(e) => setRanchName(e.target.value)}
            autoComplete="organization"
          />
        </Field>
        <Field label="Your name">
          <input
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            autoComplete="name"
          />
        </Field>
        <Field label="Working year">
          <input
            type="number"
            inputMode="numeric"
            value={currentYear}
            onChange={(e) => setCurrentYear(Number(e.target.value))}
          />
        </Field>
        <Field label="Cloud sync">
          <select
            value={syncProvider}
            onChange={(e) => setSyncProvider(e.target.value as SyncProvider)}
          >
            <option value="none">Not connected yet</option>
            <option value="google-drive">Google Drive</option>
            <option value="dropbox">Dropbox</option>
          </select>
        </Field>
        <p className="hint">
          Drive / Dropbox login is next. Pending changes: {pending ?? 0}.
        </p>
        <p className="hint">
          Device ID: <code>{settings?.deviceId}</code>
        </p>
        <div className="sticky-actions">
          <button type="button" className="btn secondary" onClick={downloadBackup}>
            Download backup
          </button>
          <button type="submit" className="btn primary">
            Save settings
          </button>
        </div>
      </form>
    </div>
  );
}
