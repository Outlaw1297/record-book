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
import { scheduleSync } from '../sync/scheduler';
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
      toast('Signed in. Syncing…');
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
      const result = await startOAuth(provider);
      if (!result.navigated) {
        toast(result.detail || 'Signed in.');
        setBusy(null);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not start sign-in.');
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
      ranchReady
        ? 'Replace the herd on THIS device with the ranch database? Unsynced rows on this device will be dropped. Other devices are not changed.'
        : 'Replace the herd on THIS device from YOUR Google Drive or Dropbox? Unsynced rows on this device will be dropped.',
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
        ? 'Ranch API saved on this device. Changes copy by themselves when you have Wi-Fi.'
        : 'Ranch API cleared on this device.',
    );
    if (ranchApiUrl.trim()) scheduleSync(400);
  }

  async function testRanchApi() {
    saveRanchApiUrl(ranchApiUrl);
    saveRanchApiKey(ranchApiKey);
    setBusy('ranch');
    const result = await probeRanchServer();
    if (!result.ok) {
      toast(result.detail);
      setBusy(null);
      return;
    }
    const copied = await syncNow();
    toast(copied.detail);
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
            ? 'This phone keeps this ranch’s book. Sign in to YOUR Google or Dropbox, or use a Docker server YOU run. Other ranches who install this app sign into their own accounts.'
            : 'This browser keeps this ranch’s book. If you opened it from your own Docker site, that database is yours. Other ranches are not on it.'}
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
            placeholder="Field phone"
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
          Ranch name and year stay with this ranch’s book. Your name and this
          device label stay with you so two people on the same ranch can share.
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

      <section className="sync-panel form">
        <h2>Ranch server (optional)</h2>
        <p className="hint">
          Only if YOU run the Portainer stack on YOUR network. Saves copy by
          themselves on Wi-Fi after that. Do not point this phone at another
          ranch’s server. If you have no server, skip this and sign in to your
          own Google Drive or Dropbox below.
        </p>
        <p className="due-kicker" style={{ marginBottom: '0.5rem' }}>
          {ranchReady ? 'This ranch’s server' : 'No server on this ranch'}
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
            onBlur={() => {
              saveRanchApiUrl(ranchApiUrl);
              saveRanchApiKey(ranchApiKey);
              if (ranchApiUrl.trim()) scheduleSync(400);
            }}
            placeholder={native ? RANCH_LAN_API_PLACEHOLDER : '/api'}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <p className="hint">
          {native ? (
            <>
              Leave empty unless you run a ranch server. Example:{' '}
              <code>{RANCH_LAN_API_PLACEHOLDER}</code>. Health check is that
              URL plus <code>/health</code>. That host is yours, not a shared
              product server.
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
            {busy === 'ranch' ? 'Syncing…' : 'Sync ranch database'}
          </button>
        </div>
        <button
          type="button"
          className="btn ghost block"
          style={{ marginTop: '0.55rem' }}
          disabled={busy !== null || (!ranchReady && !connected)}
          onClick={() => void replaceFromCloud()}
        >
          {busy === 'replace'
            ? 'Replacing…'
            : ranchReady
              ? 'Replace this device from the ranch database'
              : 'Replace this device from Drive or Dropbox'}
        </button>
        <p className="hint" style={{ marginTop: '0.55rem' }}>
          Pending changes: {pending ?? 0}
          {settings?.deviceId ? (
            <>
              {' '}
              · This device ID: <code>{settings.deviceId}</code>
            </>
          ) : null}
        </p>
      </section>

      <section className="sync-panel">
        <h2>This ranch’s Google Drive or Dropbox</h2>
        <p className="hint">
          Sign in to YOUR Google or Dropbox account. That opens Google or
          Dropbox login, not this phone’s files. The app writes a RecordBook
          folder in that account. Other ranches who install Record Book sign
          into their own accounts and do not see your herd.
        </p>

        <div className="account-card" style={{ marginTop: '0.85rem' }}>
          <p className="due-kicker">{connected ? 'Signed in' : 'Not signed in'}</p>
          <p className="due-date" style={{ fontSize: '1.35rem' }}>
            {providerName ?? 'Your Drive or Dropbox'}
          </p>
          <p className="hint">
            {auth?.accountName ||
              auth?.accountEmail ||
              (ranchReady
                ? 'Skip this if you already use your own ranch server.'
                : 'Phones and the office on THIS ranch sign into the same Google or Dropbox account, or use this ranch’s API.')}
          </p>
        </div>

        <div className="provider-actions">
          <button
            type="button"
            className="btn primary"
            disabled={busy !== null}
            onClick={() => void connect('google-drive')}
          >
            {busy === 'google-drive' ? 'Opening Google…' : 'Sign in with Google'}
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy !== null}
            onClick={() => void connect('dropbox')}
          >
            {busy === 'dropbox' ? 'Opening Dropbox…' : 'Sign in with Dropbox'}
          </button>
        </div>
        <div className="provider-actions">
          <button
            type="button"
            className="btn ghost"
            disabled={busy !== null || !connected}
            onClick={() => void disconnect()}
          >
            Disconnect this account
          </button>
        </div>
      </section>

      <section className="sync-panel">
        <h2>Devices on this ranch’s book</h2>
        <p className="hint">
          Phones and office PCs that sync THIS ranch’s Drive, Dropbox, or
          server. Another ranch’s install does not show up here.
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
            Connect another phone or the office to this ranch’s Drive,
            Dropbox, or server. Do not use another ranch’s account or NAS.
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
