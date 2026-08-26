import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  ensureSettings,
  nowIso,
  queueChange,
} from '../db/schema';
import { exportHerdBackup, syncNow } from '../db/sync';
import {
  disconnectCloud,
  getSyncAuth,
  startOAuth,
} from '../sync/auth';
import {
  getDropboxAppKey,
  getGoogleClientId,
  hasEnvDropboxAppKey,
  hasEnvGoogleClientId,
  saveDropboxAppKey,
  saveGoogleClientId,
} from '../sync/credentials';
import type { CloudProvider } from '../sync/types';
import { Field } from '../ui/Field';
import { useToast } from '../ui/Toast';

export function SettingsPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const settings = useLiveQuery(() => ensureSettings());
  const pending = useLiveQuery(() =>
    db.outbox.filter((change) => !change.syncedAt).count(),
  );
  const conflicts = useLiveQuery(() =>
    db.syncConflicts.orderBy('createdAt').reverse().limit(12).toArray(),
  );
  const auth = useLiveQuery(() => getSyncAuth());

  const [ranchName, setRanchName] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [googleClientId, setGoogleClientId] = useState('');
  const [dropboxAppKey, setDropboxAppKey] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState<'google-drive' | 'dropbox' | 'sync' | 'off' | null>(
    null,
  );

  useEffect(() => {
    if (settings && !hydrated) {
      setRanchName(settings.ranchName);
      setOperatorName(settings.operatorName ?? '');
      setCurrentYear(settings.currentYear);
      setGoogleClientId(getGoogleClientId());
      setDropboxAppKey(getDropboxAppKey());
      setHydrated(true);
    }
  }, [settings, hydrated]);

  useEffect(() => {
    if (searchParams.get('sync') === 'connected') {
      toast('Cloud folder connected. Syncing when online.');
      setSearchParams(
        {},
        {
          replace: true,
        },
      );
      void syncNow().then((result) => toast(result.detail));
    }
  }, [searchParams, setSearchParams, toast]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    saveGoogleClientId(googleClientId);
    saveDropboxAppKey(dropboxAppKey);
    const next = {
      ...settings,
      ranchName: ranchName.trim() || 'Record Book',
      operatorName: operatorName.trim(),
      currentYear,
      updatedAt: nowIso(),
    };
    await db.settings.put(next);
    await queueChange('settings', '1', 'upsert', next);
    toast('Settings saved on this device');
  }

  async function connect(provider: CloudProvider) {
    saveGoogleClientId(googleClientId);
    saveDropboxAppKey(dropboxAppKey);
    setBusy(provider);
    try {
      await startOAuth(provider);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not start login.');
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy('off');
    await disconnectCloud();
    toast('Disconnected. Herd stays on this device.');
    setBusy(null);
  }

  async function runSync() {
    setBusy('sync');
    const result = await syncNow();
    toast(result.detail);
    setBusy(null);
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

  const connected = Boolean(auth?.accessToken);
  const providerName =
    auth?.provider === 'dropbox'
      ? 'Dropbox'
      : auth?.provider === 'google-drive'
        ? 'Google Drive'
        : null;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <p className="lede">
          Ranch year, operator, and a private Drive or Dropbox folder. The book
          stays on this device until you have signal.
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
        <div className="sticky-actions">
          <button type="button" className="btn secondary" onClick={downloadBackup}>
            Download backup
          </button>
          <button type="submit" className="btn primary">
            Save settings
          </button>
        </div>
      </form>

      <section className="sync-panel">
        <h2>Private cloud folder</h2>
        <p className="hint">
          Phone and office PC share one Google or Dropbox account. Files live in
          a <code>RecordBook</code> folder that only that account can see. No
          ranch server.
        </p>

        <div className="account-card" style={{ marginTop: '0.85rem' }}>
          <p className="due-kicker">{connected ? 'Connected' : 'Not connected'}</p>
          <p className="due-date" style={{ fontSize: '1.35rem' }}>
            {providerName ?? 'Choose a carrier'}
          </p>
          <p className="hint">
            {auth?.accountEmail ||
              'Connect once at the house. The field app keeps working offline.'}
          </p>
          <p className="hint">Pending changes: {pending ?? 0}</p>
        </div>

        <div className="provider-actions">
          <button
            type="button"
            className="btn primary"
            disabled={busy !== null}
            onClick={() => void connect('google-drive')}
          >
            {busy === 'google-drive' ? 'Opening Google…' : 'Connect Google Drive'}
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy !== null}
            onClick={() => void connect('dropbox')}
          >
            {busy === 'dropbox' ? 'Opening Dropbox…' : 'Connect Dropbox'}
          </button>
        </div>
        <div className="provider-actions">
          <button
            type="button"
            className="btn secondary"
            disabled={busy !== null || !connected}
            onClick={() => void runSync()}
          >
            {busy === 'sync' ? 'Syncing…' : 'Sync now'}
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={busy !== null || !connected}
            onClick={() => void disconnect()}
          >
            Disconnect
          </button>
        </div>

        <details className="sync-advanced form">
          <summary>App keys (once per ranch)</summary>
          <p className="hint">
            Create a Google OAuth client and/or Dropbox app, then paste the
            public IDs. Redirect URI must be this site plus{' '}
            <code>/oauth/callback</code>. See <code>docs/sync-setup.md</code>.
          </p>
          <Field
            label={
              hasEnvGoogleClientId()
                ? 'Google client ID (env already set; paste to override)'
                : 'Google client ID'
            }
          >
            <input
              value={googleClientId}
              onChange={(e) => setGoogleClientId(e.target.value)}
              placeholder="….apps.googleusercontent.com"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field
            label={
              hasEnvDropboxAppKey()
                ? 'Dropbox app key (env already set; paste to override)'
                : 'Dropbox app key'
            }
          >
            <input
              value={dropboxAppKey}
              onChange={(e) => setDropboxAppKey(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <p className="hint">
            Device ID: <code>{settings?.deviceId}</code>
          </p>
        </details>
      </section>

      {conflicts && conflicts.length > 0 ? (
        <section className="sync-panel">
          <h2>Overlap log</h2>
          <p className="hint">
            Same row was edited on two devices while offline. The newer
            <code> updatedAt </code> was kept.
          </p>
          <div className="card-list" style={{ marginTop: '0.75rem' }}>
            {conflicts.map((conflict) => (
              <div className="list-card" key={conflict.id}>
                <h2>
                  {conflict.entity} · {conflict.entityId.slice(0, 8)}
                </h2>
                <p>
                  Kept {conflict.kept}
                  {conflict.localUpdatedAt
                    ? ` · local ${conflict.localUpdatedAt.slice(0, 16)}`
                    : ''}
                  {` · cloud ${conflict.remoteUpdatedAt.slice(0, 16)}`}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
