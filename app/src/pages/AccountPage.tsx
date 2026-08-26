import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ensureSettings } from '../db/schema';

export function AccountPage() {
  const settings = useLiveQuery(() => ensureSettings());

  return (
    <div className="page">
      <header className="page-header">
        <h1>Account</h1>
        <p className="lede">
          This device keeps the herd locally. Cloud login comes later.
        </p>
      </header>

      <div className="account-card" style={{ marginTop: '1rem' }}>
        <p className="due-kicker">Operator</p>
        <p className="due-date" style={{ fontSize: '1.6rem' }}>
          {settings?.operatorName || 'Not set'}
        </p>
        <p className="hint">{settings?.ranchName}</p>
      </div>

      <div className="card-list" style={{ marginTop: '0.75rem' }}>
        <div className="list-card">
          <h2>Working year</h2>
          <p>{settings?.currentYear}</p>
        </div>
        <div className="list-card">
          <h2>Sign in</h2>
          <p>Google / ranch login will land here. Not required for field entry.</p>
        </div>
        <div className="list-card">
          <h2>Device</h2>
          <p>
            <code>{settings?.deviceId}</code>
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
