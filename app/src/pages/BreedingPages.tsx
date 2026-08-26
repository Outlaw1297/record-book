import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  ensureSettings,
  newId,
  nowIso,
  queueChange,
  type BreedingKind,
  type BreedingService,
} from '../db/schema';
import { dueDateFromService, formatDisplayDate } from '../lib/gestation';

const KIND_LABEL: Record<BreedingKind, string> = {
  ai1: 'AI 1st service',
  ai2: 'AI 2nd service',
  pasture: 'Pasture service',
};

export function BreedingListPage() {
  const settings = useLiveQuery(() => ensureSettings());
  const year = settings?.currentYear ?? new Date().getFullYear();
  const rows = useLiveQuery(
    () =>
      db.breeding
        .filter((r) => !r.deletedAt && r.year === year)
        .reverse()
        .sortBy('updatedAt'),
    [year],
  );

  return (
    <div className="page">
      <header className="page-header row-between">
        <div>
          <h1>Breeding Record</h1>
          <p className="lede">Year {year} · AI and pasture service</p>
        </div>
        <Link className="btn primary" to="/breeding/new">
          Add service
        </Link>
      </header>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Cow I.D.</th>
              <th>Service</th>
              <th>Sire</th>
              <th>Date</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((row) => {
              const due = row.serviceDate
                ? dueDateFromService(row.serviceDate)
                : null;
              return (
                <tr key={row.id} className={row.flagged ? 'flagged' : undefined}>
                  <td>
                    <Link to={`/breeding/${row.id}`}>{row.cowId}</Link>
                  </td>
                  <td>{KIND_LABEL[row.kind]}</td>
                  <td>{row.sireId || '—'}</td>
                  <td>{row.serviceDate || '—'}</td>
                  <td>{due ? formatDisplayDate(due) : '—'}</td>
                </tr>
              );
            })}
            {(rows?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No breeding rows for {year}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BreedingFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const settings = useLiveQuery(() => ensureSettings());
  const existing = useLiveQuery(
    () => (id && id !== 'new' ? db.breeding.get(id) : undefined),
    [id],
  );

  const [cowId, setCowId] = useState('');
  const [kind, setKind] = useState<BreedingKind>('ai1');
  const [sireId, setSireId] = useState('');
  const [serviceDate, setServiceDate] = useState('');
  const [flagged, setFlagged] = useState(false);
  const duePreview = serviceDate ? dueDateFromService(serviceDate) : null;

  useEffect(() => {
    if (!existing) return;
    setCowId(existing.cowId);
    setKind(existing.kind);
    setSireId(existing.sireId ?? '');
    setServiceDate(existing.serviceDate ?? '');
    setFlagged(existing.flagged);
  }, [existing]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cowId.trim()) {
      alert('Cow I.D. is required');
      return;
    }

    const record: BreedingService = {
      id: existing?.id ?? newId(),
      year: settings?.currentYear ?? new Date().getFullYear(),
      cowId: cowId.trim(),
      kind,
      sireId: sireId.trim() || undefined,
      serviceDate: serviceDate || undefined,
      flagged,
      updatedAt: nowIso(),
    };

    await db.breeding.put(record);
    await queueChange('breeding', record.id, 'upsert', record);
    navigate('/breeding');
  }

  return (
    <div className="page narrow">
      <header className="page-header">
        <h1>{existing ? 'Edit breeding' : 'Add breeding'}</h1>
        <p className="lede">
          Matches BREEDING RECORD — AI 1st/2nd and pasture service.
        </p>
      </header>

      <form className="form" onSubmit={onSubmit}>
        <label>
          Cow I.D.
          <input
            value={cowId}
            onChange={(e) => setCowId(e.target.value)}
            placeholder="BLK 455org / BWF 40pk"
            required
          />
        </label>
        <label>
          Service type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as BreedingKind)}
          >
            <option value="ai1">A.I. 1st service</option>
            <option value="ai2">A.I. 2nd service</option>
            <option value="pasture">Pasture service</option>
          </select>
        </label>
        <label>
          Sire
          <input
            value={sireId}
            onChange={(e) => setSireId(e.target.value)}
            placeholder="100 / 99"
          />
        </label>
        <label>
          Date
          <input
            type="date"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
          />
        </label>
        {duePreview && (
          <p className="hint">Due date: {formatDisplayDate(duePreview)}</p>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={flagged}
            onChange={(e) => setFlagged(e.target.checked)}
          />
          Flagged
        </label>
        <div className="form-actions">
          <button type="submit" className="btn primary">
            Save
          </button>
          <Link className="btn ghost" to="/breeding">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
