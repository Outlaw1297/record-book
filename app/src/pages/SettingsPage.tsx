import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  getSettings,
  nowIso,
  queueChange,
} from '../db/schema';
import {
  exportHerdBackup,
  replaceThisDeviceFromCloud,
  syncNow,
} from '../db/sync';
import {
  disconnectCloud,
  getSyncAuth,
  startOAuth,
} from '../sync/auth';
import { defaultDeviceName } from '../sync/identity';
import { RANCH_LAN_API_PLACEHOLDER, isNativeApp } from '../platform';
import {
  getRanchApiKey,
  getRanchApiUrl,
  hasEnvRanchApiUrl,
  hasRanchServer,
  probeRanchServer,
  saveRanchApiKey,
  saveRanchApiUrl,
} from '../sync/ranchServer';
import type { CloudProvider } from '../sync/types';
import { Field } from '../ui/Field';
import { useToast } from '../ui/Toast';

export function SettingsPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const settings = useLiveQuery(() => getSettings());
  const pending = useLiveQuery(() =>
    db.outbox.filter((change) => !change.syncedAt).count(),
  );
  const conflicts = useLiveQuery(() =>
    db.syncConflicts.orderBy('createdAt').reverse().limit(12).toArray(),
  );
  const devices = useLiveQuery(async () => {
    const rows = await db.syncDevices.toArray();
    return rows.sort((a, b) => a.deviceName.localeCompare(b.deviceName));
  });
  const auth = useLiveQuery(() => getSyncAuth());

  const [ranchName, setRanchName] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [ranchApiUrl, setRanchApiUrl] = useState('');
  const [ranchApiKey, setRanchApiKey] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState<
    'google-drive' | 'dropbox' | 'off' | 'replace' | 'ranch' | null
  >(null);

  useEffect(() => {
    if (settings && !hydrated) {
      setRanchName(settings.ranchName);
      setOperatorName(settings.operatorName ?? '');
      setDeviceName(
        settings.deviceName ||
          defaultDeviceName(settings.deviceKind, settings.operatorName),
      );
      setCurrentYear(settings.currentYear);
      setRanchApiUrl(getRanchApiUrl());
      setRanchApiKey(getRanchApiKey());
      setHydrated(true);
    }
  }, [settings, hydrated]);

  useEffect(() => {
    if (searchParams.get('sync') === 'connected') {
      toast('Cloud folder connected. Syncing the shared book…');
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
    saveRanchApiUrl(ranchApiUrl);
    saveRanchApiKey(ranchApiKey);
    const nextRanch = ranchName.trim() || 'Record Book';
    const nextYear = currentYear;
    const ranchChanged =
      nextRanch !== settings.ranchName || nextYear !== settings.currentYear;
    const next = {
      ...settings,
      ranchName: nextRanch,
      operatorName: operatorName.trim(),
      deviceName: deviceName.trim() || defaultDeviceName(settings.deviceKind, operatorName),
      currentYear: nextYear,
      updatedAt: ranchChanged ? nowIso() : settings.updatedAt,
    };
    await db.settings.put(next);
    if (ranchChanged) await queueChange('settings', '1', 'upsert', next);
    toast(
      ranchChanged
        ? 'Ranch saved. It will sync to other devices when you have signal.'
        : 'This device’s name and operator stay on this phone.',
    );
  }

  async function connect(provider: CloudProvider) {
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

  async function replaceFromCloud() {
    const ok = window.confirm(
      'Replace the herd on THIS device with the shared Drive/Dropbox book? Unsynced rows on this device will be dropped. Other devices are not changed.',
    );
    if (!ok) return;
    setBusy('replace');
    const result = await replaceThisDeviceFromCloud();
    toast(result.detail);
    setBusy(null);
  }

  async function saveRanchApi() {
    saveRanchApiUrl(ranchApiUrl);
    saveRanchApiKey(ranchApiKey);
    toast(
      ranchApiUrl.trim()
        ? 'Ranch API saved on this device. It is not written to Drive or Dropbox.'
        : 'Ranch API cleared on this device.',
    );
  }

  async function testRanchApi() {
    saveRanchApiUrl(ranchApiUrl);
    saveRanchApiKey(ranchApiKey);
    setBusy('ranch');
    const result = await probeRanchServer();
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
  const native = isNativeApp();
  const ranchReady = Boolean(ranchApiUrl.trim()) || hasRanchServer();
  const providerName =
    auth?.provider === 'dropbox'
      ? 'Dropbox'
      : auth?.provider === 'google-drive'
        ? 'Google Drive'
        : null;
  const others = (devices ?? []).filter((device) => !device.isThisDevice);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <p className="lede">
          {native
            ? 'This phone keeps the book. Sign in with Google or Dropbox once; the RecordBook folder is created for you and syncs by itself when you have signal.'
            : 'Sign in with Google or Dropbox. The shared RecordBook folder is created for you. Sync runs in the background.'}
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
        <Field label="Your name on this device">
          <input
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            autoComplete="name"
          />
        </Field>
        <Field label="Device name">
          <input
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="Dalton's phone"
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
        <p className="hint">
          Ranch name and year are shared. Your name and this device label stay
          with you so two people can use the same book.
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

      <section className="sync-panel">
        <h2>Shared cloud folder</h2>
        <p className="hint">
          Sign this device and every other device into the <strong>same</strong>{' '}
          Google or Dropbox account. The app creates a private{' '}
          <code>RecordBook</code> folder and keeps it up to date. No keys to
          paste.
        </p>

        <div className="account-card" style={{ marginTop: '0.85rem' }}>
          <p className="due-kicker">{connected ? 'Connected' : 'Not connected'}</p>
          <p className="due-date" style={{ fontSize: '1.35rem' }}>
            {providerName ?? 'Choose a carrier'}
          </p>
          <p className="hint">
            {auth?.accountEmail ||
              'Connect once at the house. Changes sync by themselves when you have signal.'}
          </p>
          <p className="hint">
            Pending changes: {pending ?? 0}
            {settings?.bookId ? ` · Book ${settings.bookId.slice(0, 8)}` : ''}
          </p>
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
            className="btn ghost"
            disabled={busy !== null || !connected}
            onClick={() => void disconnect()}
          >
            Disconnect
          </button>
        </div>
        <button
          type="button"
          className="btn ghost block"
          style={{ marginTop: '0.55rem' }}
          disabled={busy !== null || !connected}
          onClick={() => void replaceFromCloud()}
        >
          {busy === 'replace' ? 'Replacing…' : 'Replace this device from the shared book'}
        </button>

        <p className="hint" style={{ marginTop: '0.55rem' }}>
          This device ID: <code>{settings?.deviceId}</code>
        </p>
      </section>

      <section className="sync-panel form">
        <h2>Ranch database (Docker)</h2>
        <p className="hint">
          Optional Postgres copy of this herd for a future app. On ranch Wi-Fi
          it copies by itself. Drive and Dropbox stay the phone-to-phone book.
        </p>
        <p className="due-kicker" style={{ marginBottom: '0.5rem' }}>
          {ranchReady ? 'Copies on Wi-Fi' : 'Not configured'}
        </p>
        <Field
          label={
            native
              ? 'Ranch API URL'
              : hasEnvRanchApiUrl()
                ? 'Ranch API URL (this Portainer app already uses /api)'
                : 'Ranch API URL'
          }
        >
          <input
            value={ranchApiUrl}
            onChange={(e) => setRanchApiUrl(e.target.value)}
            placeholder={native ? RANCH_LAN_API_PLACEHOLDER : '/api'}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <p className="hint">
          {native ? (
            <>
              Default is <code>{RANCH_LAN_API_PLACEHOLDER}</code> so this phone
              can reach the NAS. You should not need to tap copy.
            </>
          ) : (
            <>
              Opened from Portainer at <code>http://YOUR-HOST:8180/</code>, leave
              this as <code>/api</code>.
            </>
          )}
        </p>
        <div className="provider-actions">
          <button
            type="button"
            className="btn secondary"
            disabled={busy !== null}
            onClick={() => void saveRanchApi()}
          >
            Save ranch API
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={busy !== null || !ranchReady}
            onClick={() => void testRanchApi()}
          >
            {busy === 'ranch' ? 'Checking…' : 'Test connection'}
          </button>
        </div>
      </section>

      <section className="sync-panel">
        <h2>Devices on this book</h2>
        <p className="hint">
          Each browser or phone is a device. Users keep their own names; the
          cattle rows are the same database.
        </p>
        <div className="card-list" style={{ marginTop: '0.75rem' }}>
          {(devices ?? []).length === 0 ? (
            <div className="list-card">
              <h2>Only this device so far</h2>
              <p>
                {deviceName || 'This device'}. After the next successful sync,
                other phones and office PCs show up here.
              </p>
            </div>
          ) : (
            (devices ?? []).map((device) => (
              <div className="list-card" key={device.deviceId}>
                <h2>
                  {device.deviceName}
                  {device.isThisDevice ? ' · this device' : ''}
                </h2>
                <p>
                  {device.operatorName || 'No operator name'}
                  {device.lastSeenAt
                    ? ` · last seen ${new Date(device.lastSeenAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}`
                    : ''}
                </p>
              </div>
            ))
          )}
        </div>
        {others.length === 0 && (devices ?? []).length > 0 ? (
          <p className="hint" style={{ marginTop: '0.6rem' }}>
            Connect the office PC or another phone with the same Drive or
            Dropbox account to share this book.
          </p>
        ) : null}
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
                  {conflict.deviceName ? ` · ${conflict.deviceName}` : ''}
                  {conflict.operatorName ? ` · ${conflict.operatorName}` : ''}
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
