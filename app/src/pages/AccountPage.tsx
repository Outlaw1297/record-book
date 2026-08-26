import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureSettings } from '../db/schema';
import { getSyncAuth } from '../sync/auth';
import { defaultDeviceName } from '../sync/identity';

function providerLabel(provider?: string) {
  if (provider === 'google-drive') return 'Google Drive';
  if (provider === 'dropbox') return 'Dropbox';
  return 'Not connected';
}

export function AccountPage() {
  const settings = useLiveQuery(() => ensureSettings());
  const auth = useLiveQuery(() => getSyncAuth());
  const devices = useLiveQuery(async () => {
    const rows = await db.syncDevices.toArray();
    return rows.sort((a, b) => a.deviceName.localeCompare(b.deviceName));
  });
  const others = (devices ?? []).filter((device) => !device.isThisDevice);
  const deviceLabel =
    settings?.deviceName ||
    defaultDeviceName(settings?.deviceKind, settings?.operatorName);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Account</h1>
        <p className="lede">
          You have a name on this device. The herd is the shared book in Drive
          or Dropbox, used by every phone and office PC on the same account.
        </p>
      </header>

      <div className="account-card" style={{ marginTop: '1rem' }}>
        <p className="due-kicker">You on this device</p>
        <p className="due-date" style={{ fontSize: '1.6rem' }}>
          {settings?.operatorName || 'Not set'}
        </p>
        <p className="hint">
          {settings?.ranchName} · {deviceLabel}
        </p>
      </div>

      <div className="card-list" style={{ marginTop: '0.75rem' }}>
        <div className="list-card">
          <h2>Working year</h2>
          <p>{settings?.currentYear}</p>
        </div>
        <div className="list-card">
          <h2>Shared folder</h2>
          <p>
            {providerLabel(auth?.provider)}
            {auth?.accountEmail ? ` · ${auth.accountEmail}` : ''}
          </p>
        </div>
        <div className="list-card">
          <h2>Other devices</h2>
          <p>
            {others.length === 0
              ? 'None yet. Connect the office PC or another phone to the same Drive or Dropbox account so they share this book.'
              : others
                  .map(
                    (device) =>
                      `${device.deviceName}${device.operatorName ? ` (${device.operatorName})` : ''}`,
                  )
                  .join(', ')}
          </p>
        </div>
      </div>

      <div className="sticky-actions" style={{ gridTemplateColumns: '1fr' }}>
        <Link className="btn secondary" to="/settings">
          Open settings
        </Link>
      </div>
    </div>
  );
}
