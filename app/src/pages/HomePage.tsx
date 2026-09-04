import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db/schema';

export function HomePage() {
  const settings = useLiveQuery(() => getSettings());

  const counts = useLiveQuery(async () => {
    const [cowCalf, breeding, pastures, sales, animals, pending] =
      await Promise.all([
        db.cowCalf.filter((r) => !r.deletedAt).count(),
        db.breeding.filter((r) => !r.deletedAt).count(),
        db.pastures.filter((r) => !r.deletedAt).count(),
        db.sales.filter((r) => !r.deletedAt).count(),
        db.animals.filter((r) => !r.deletedAt).count(),
        db.outbox.filter((c) => !c.syncedAt).count(),
      ]);
    return { cowCalf, breeding, pastures, sales, animals, pending };
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <h1>{settings?.ranchName ?? 'Record Book'}</h1>
        <p className="lede">
          Every year stays in this book
          {settings?.operatorName ? ` · ${settings.operatorName}` : ''}. Search
          and filter when you need one row. Big buttons, one record at a time.
        </p>
      </header>

      <section className="log-hero" style={{ marginTop: '1rem' }}>
        <div>
          <p className="due-kicker" style={{ color: '#edc8b4' }}>
            In the pasture
          </p>
          <h2
            style={{
              margin: '0.2rem 0 0.35rem',
              fontFamily: 'var(--font-display)',
              fontSize: '1.7rem',
            }}
          >
            Log a new calf
          </h2>
          <p>Cow, calf I.D., sex, date. Stays on this phone until you have signal.</p>
        </div>
        <Link className="btn primary" to="/cow-calf/new">
          Log calf
        </Link>
      </section>

      <div className="stat-row">
        <div className="stat">
          <strong>{counts?.cowCalf ?? '—'}</strong>
          <span>Calf rows</span>
        </div>
        <div className="stat">
          <strong>{counts?.animals ?? '—'}</strong>
          <span>Herd I.D.s</span>
        </div>
        <div className="stat">
          <strong>{counts?.breeding ?? '—'}</strong>
          <span>Breeding rows</span>
        </div>
        <div className="stat">
          <strong>{counts?.sales ?? '—'}</strong>
          <span>Sales / culls</span>
        </div>
      </div>

      <section className="quick-grid">
        <Link className="quick-card" to="/eid">
          <h2>Find a lost tag</h2>
          <p>Photo or wand an EID to see which animal it belongs to</p>
        </Link>
        <Link className="quick-card" to="/herd">
          <h2>Look up an animal</h2>
          <p>Visual ID, Cow Sense fields, lifetime records</p>
        </Link>
        <Link className="quick-card" to="/import">
          <h2>Cow Sense import / export</h2>
          <p>Pull Nygaaard.csh or a CSV in, send CSV back to Tools → Import</p>
        </Link>
        <Link className="quick-card" to="/cow-calf">
          <h2>Open the book</h2>
          <p>Cow–calf, breeding, pasture, sales, due dates</p>
        </Link>
        <Link className="quick-card" to="/gestation">
          <h2>Due date</h2>
          <p>Service plus 283 days</p>
        </Link>
        <Link className="quick-card" to="/account">
          <h2>Account</h2>
          <p>This ranch, you, this ranch’s Drive or Dropbox</p>
        </Link>
      </section>
    </div>
  );
}
