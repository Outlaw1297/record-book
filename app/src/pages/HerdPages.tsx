import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { getLifetime, searchHerdIds } from '../lib/herd';
import { EmptyState } from '../ui/Field';
import { IconSearch } from '../ui/icons';

export function HerdListPage() {
  const [query, setQuery] = useState('');
  const ids = useLiveQuery(() => searchHerdIds(query), [query]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Herd</h1>
        <p className="lede">
          Look up a cow or calf by herd I.D. and see lifetime records.
        </p>
      </header>

      <label className="search-wrap" style={{ margin: '1rem 0' }}>
        <span className="sr-only">Search herd I.D.</span>
        <IconSearch />
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="67y / Helen / BLK 455org"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>

      {(ids?.length ?? 0) === 0 ? (
        <EmptyState
          title="No animals yet"
          body="Log a calf and it will show up here for lifetime lookup."
          actionTo="/cow-calf/new"
          actionLabel="Log calf"
        />
      ) : (
        <div className="card-list">
          {ids?.map((id) => (
            <Link key={id} className="list-card" to={`/herd/${encodeURIComponent(id)}`}>
              <h2>{id}</h2>
              <p>Open lifetime record</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function HerdDetailPage() {
  const { herdId = '' } = useParams();
  const decoded = decodeURIComponent(herdId);
  const record = useLiveQuery(() => getLifetime(decoded), [decoded]);
  const counts = useMemo(() => {
    if (!record) return null;
    return {
      calves: record.cowCalfAsDam.length,
      birth: record.cowCalfAsCalf.length,
      breeding: record.breeding.length,
      sales: record.sales.length,
    };
  }, [record]);

  if (!record) {
    return (
      <div className="page">
        <p className="hint">Loading lifetime record…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <p className="due-kicker">Lifetime</p>
        <h1>{record.herdId}</h1>
        <p className="lede">
          {counts?.calves ?? 0} calves · {counts?.breeding ?? 0} breedings ·{' '}
          {counts?.sales ?? 0} sales / culls
        </p>
      </header>

      {record.events.length === 0 ? (
        <EmptyState
          title="No history yet"
          body="This I.D. is not on a saved page. Log a calf or breeding row to start the timeline."
          actionTo="/cow-calf/new"
          actionLabel="Log calf"
        />
      ) : (
        <div className="timeline" style={{ marginTop: '1rem' }}>
          {record.events.map((event) => (
            <Link key={event.id} className="list-card" to={event.href}>
              <p className="due-kicker">{event.kind}</p>
              <h2>{event.title}</h2>
              <p>
                {event.date || 'No date'} {event.detail ? `· ${event.detail}` : ''}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
