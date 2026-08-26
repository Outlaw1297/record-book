import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureSettings } from '../db/schema';

export function HomePage() {
  const settings = useLiveQuery(() => ensureSettings());
  const year = settings?.currentYear ?? new Date().getFullYear();

  const counts = useLiveQuery(async () => {
    const [cowCalf, breeding, pastures, sales, pending] = await Promise.all([
      db.cowCalf.filter((r) => !r.deletedAt && r.year === year).count(),
      db.breeding.filter((r) => !r.deletedAt && r.year === year).count(),
      db.pastures.filter((r) => !r.deletedAt && r.year === year).count(),
      db.sales.filter((r) => !r.deletedAt && r.year === year).count(),
      db.outbox.filter((c) => !c.syncedAt).count(),
    ]);
    return { cowCalf, breeding, pastures, sales, pending };
  }, [year]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>{settings?.ranchName ?? 'Record Book'}</h1>
        <p className="lede">
          Digital pocket book for {year}. Works without signal; syncs when your
          phone has service.
        </p>
      </header>

      <div className="stat-row">
        <div className="stat">
          <strong>{counts?.cowCalf ?? '—'}</strong>
          <span>Cow–calf rows</span>
        </div>
        <div className="stat">
          <strong>{counts?.breeding ?? '—'}</strong>
          <span>Breeding</span>
        </div>
        <div className="stat">
          <strong>{counts?.pastures ?? '—'}</strong>
          <span>Pastures</span>
        </div>
        <div className="stat">
          <strong>{counts?.sales ?? '—'}</strong>
          <span>Sales</span>
        </div>
      </div>

      <section className="quick-grid">
        <Link className="quick-card" to="/cow-calf/new">
          <h2>Add cow–calf</h2>
          <p>Calf, cow, sire, sex, date, weight, ease, remarks</p>
        </Link>
        <Link className="quick-card" to="/breeding/new">
          <h2>Add breeding</h2>
          <p>AI 1st / 2nd or pasture service</p>
        </Link>
        <Link className="quick-card" to="/pasture/new">
          <h2>Pasture exposure</h2>
          <p>Pasture name, bull in/out, animal list</p>
        </Link>
        <Link className="quick-card" to="/sales/new">
          <h2>Record sale / cull</h2>
          <p>Calf ID, buyer, date, price, or cull notes</p>
        </Link>
        <Link className="quick-card" to="/gestation">
          <h2>Gestation table</h2>
          <p>Service date plus 283 days = due date</p>
        </Link>
      </section>

      {(counts?.pending ?? 0) > 0 && (
        <p className="hint">
          {counts?.pending} change(s) queued for cloud sync.
        </p>
      )}
    </div>
  );
}
