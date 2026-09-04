import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_RANCH_NAME, PRODUCT_NAME, PRODUCT_WORDMARK, TAGLINE } from '../brand';
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
  listCloudAuths,
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
  listNasCloudBackup,
  probeRanchServer,
  saveRanchApiKey,
  saveRanchApiUrl,
  type NasCloudAccount,
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
  const auths = useLiveQuery(() => listCloudAuths()) ?? [];

  const [ranchName, setRanchName] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [ranchApiUrl, setRanchApiUrl] = useState('');
  const [ranchApiKey, setRanchApiKey] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState<
    'google-drive' | 'dropbox' | 'off' | 'replace' | 'ranch' | null
  >(null);
  const [nasAccounts, setNasAccounts] = useState<NasCloudAccount[]>([]);

  useEffect(() => {
    if (settings && !hydrated) {
      setRanchName(settings.ranchName);
      setOperatorName(settings.operatorName ?? '');
      setDeviceName(
        settings.deviceName ||
          defaultDeviceName(settings.deviceKind, settings.operatorName),
      );
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

  useEffect(() => {
    if (!hydrated) return;
    if (!(ranchApiUrl.trim() || hasRanchServer() || hasEnvRanchApiUrl())) {
      setNasAccounts([]);
      return;
    }
    void listNasCloudBackup().then(setNasAccounts);
  }, [hydrated, ranchApiUrl]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    saveRanchApiUrl(ranchApiUrl);
    saveRanchApiKey(ranchApiKey);
    const nextRanch = ranchName.trim() || DEFAULT_RANCH_NAME;
    const ranchChanged = nextRanch !== settings.ranchName;
    const next = {
      ...settings,
      ranchName: nextRanch,
      operatorName: operatorName.trim(),
      deviceName: deviceName.trim() || defaultDeviceName(settings.deviceKind, operatorName),
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

  async function disconnect(provider?: CloudProvider) {
    setBusy(provider ?? 'off');
    await disconnectCloud(provider);
    toast(
      provider === 'google-drive'
        ? 'Disconnected Google. Dropbox stays signed in if you used it.'
        : provider === 'dropbox'
          ? 'Disconnected Dropbox. Google stays signed in if you used it.'
          : 'Disconnected. Herd stays on this device.',
    );
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

  const googleAuth = auths.find((row) => row.provider === 'google-drive');
  const dropboxAuth = auths.find((row) => row.provider === 'dropbox');
  const connected = auths.length > 0;
  const native = isNativeApp();
  const ranchReady = Boolean(ranchApiUrl.trim()) || hasRanchServer();
  const others = (devices ?? []).filter((device) => !device.isThisDevice);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <p className="lede">
          {native
            ? 'This phone keeps this ranch’s book. If YOU run Docker, that NAS is the book and it copies the herd to YOUR Dropbox or Drive. The phone can read the NAS or that cloud copy.'
            : 'This website is the ranch NAS. After a phone signs in to Dropbox or Google, this host copies the herd there by itself. The phone can grab from this NAS or from Dropbox/Drive.'}
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
        <p className="hint">
          Ranch name stays with this ranch’s book. Your name and this device
          label stay with you so two people on the same ranch can share.
        </p>
        <div className="sticky-actions">
          <button type="button" className="btn secondary" onClick={downloadBackup}>
            Download backup
          </button>
          <button type="submit" className="btn primary">
            Save settings
          </button>
        </div>
        <p className="hint">
          Cow Sense herd file? <Link to="/import">Import or export CSV</Link> that
          Tools → Import can read. JSON backup above is this app’s own copy.
        </p>
      </form>

      <section className="sync-panel form">
        <h2>Ranch server (optional)</h2>
        <p className="hint">
          Only if YOU run the Portainer stack on YOUR network. That Postgres
          database is this ranch’s book. Saves copy by themselves on Wi-Fi.
          Do not point this phone at another ranch’s server.
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
        <h2>NAS copy on Google Drive or Dropbox</h2>
        <p className="hint">
          {native
            ? ranchReady
              ? 'Sign in on this phone once. The NAS stores that login and copies the herd to YOUR Dropbox or Drive. This phone can then pull from the NAS or from that cloud copy. If the NAS is off, use Dropbox or Drive. When the NAS is back, cloud changes copy onto it.'
              : 'No Docker server on this phone. Sign in to YOUR Google or Dropbox. That account is this ranch’s book until you add a NAS.'
            : 'Sign in on the Android app (not this website). That gives this NAS permission to copy the herd to YOUR Dropbox or Drive. Google login in this browser usually fails on http://NAS.'}
        </p>

        <div className="account-card" style={{ marginTop: '0.85rem' }}>
          <p className="due-kicker">{googleAuth ? 'Google Drive signed in' : 'Google Drive'}</p>
          <p className="due-date" style={{ fontSize: '1.2rem' }}>
            {googleAuth?.accountEmail || googleAuth?.accountName || 'Not signed in'}
          </p>
        </div>
        <div className="account-card" style={{ marginTop: '0.55rem' }}>
          <p className="due-kicker">{dropboxAuth ? 'Dropbox signed in' : 'Dropbox'}</p>
          <p className="due-date" style={{ fontSize: '1.2rem' }}>
            {dropboxAuth?.accountEmail || dropboxAuth?.accountName || 'Not signed in'}
          </p>
        </div>
        {nasAccounts.length > 0 ? (
          nasAccounts.map((account) => (
            <p className="hint" key={account.provider} style={{ marginTop: '0.55rem' }}>
              NAS copies to {account.provider === 'dropbox' ? 'Dropbox' : 'Google Drive'}
              {account.accountEmail ? ` (${account.accountEmail})` : ''}
              {account.lastBackupAt
                ? ` · last copy ${new Date(account.lastBackupAt).toLocaleString()}`
                : ' · waiting for first copy'}
              {account.lastError ? ` · ${account.lastError}` : ''}
            </p>
          ))
        ) : ranchReady || hasEnvRanchApiUrl() ? (
          <p className="hint" style={{ marginTop: '0.55rem' }}>
            This NAS has no Dropbox or Drive login yet. Sign in on the phone once.
          </p>
        ) : null}

        {native || !hasEnvRanchApiUrl() ? (
          <>
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
                disabled={busy !== null || !googleAuth}
                onClick={() => void disconnect('google-drive')}
              >
                Disconnect Google
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={busy !== null || !dropboxAuth}
                onClick={() => void disconnect('dropbox')}
              >
                Disconnect Dropbox
              </button>
            </div>
          </>
        ) : (
          <p className="hint" style={{ marginTop: '0.75rem' }}>
            Open HerdLedger on the phone, set this host as the ranch API, then
            Sign in with Google or Dropbox there. After that, this NAS copies
            the herd to that account by itself.
          </p>
        )}
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

      <aside className="brand-about" aria-label={`About ${PRODUCT_NAME}`}>
        <p className="wordmark">{PRODUCT_WORDMARK}</p>
        <p className="tagline">{TAGLINE}</p>
      </aside>
    </div>
  );
}
