import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  getSettings,
  newId,
  nowIso,
  todayIsoDate,
  upsertAnimalByHerdId,
  queueChange,
  softDeleteRecord,
  type BreedingKind,
  type BreedingService,
} from '../db/schema';
import { dueDateFromService, formatDisplayDate } from '../lib/gestation';
import { listHerdIds } from '../lib/herd';
import { DeleteRecordButton } from '../ui/DeleteRecordButton';
import { EmptyState, Field, Segmented } from '../ui/Field';
import { useToast } from '../ui/Toast';

const KIND_LABEL: Record<BreedingKind, string> = {
  ai1: 'AI 1st',
  ai2: 'AI 2nd',
  pasture: 'Pasture',
};

export function BreedingListPage() {
  const settings = useLiveQuery(() => getSettings());
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
      <header
        className="page-header"
        style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}
      >
        <div>
          <h1>Breeding</h1>
          <p className="lede">Year {year} · AI and pasture service</p>
        </div>
        <Link className="btn primary" to="/breeding/new">
          Add service
        </Link>
      </header>

      {(rows?.length ?? 0) === 0 ? (
        <div style={{ marginTop: '1rem' }}>
          <EmptyState
            title="No breeding rows"
            body="Add a first or second AI service, or a pasture turnout."
            actionTo="/breeding/new"
            actionLabel="Add service"
          />
        </div>
      ) : (
        <>
          <div className="card-list card-mobile" style={{ marginTop: '1rem' }}>
            {rows?.map((row) => {
              const due = row.serviceDate
                ? dueDateFromService(row.serviceDate)
                : null;
              return (
                <Link key={row.id} className="list-card" to={`/breeding/${row.id}`}>
                  <h2>{row.cowId}</h2>
                  <p>
                    {KIND_LABEL[row.kind]}
                    {row.serviceDate ? ` · ${row.serviceDate}` : ''}
                    {due ? ` · due ${formatDisplayDate(due)}` : ''}
                  </p>
                </Link>
              );
            })}
          </div>
          <div className="table-wrap table-desktop" style={{ marginTop: '1rem' }}>
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
                {rows?.map((row) => {
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
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function BreedingFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useLiveQuery(() => getSettings());
  const existing = useLiveQuery(
    () => (id && id !== 'new' ? db.breeding.get(id) : undefined),
    [id],
  );
  const herdIds = useLiveQuery(() => listHerdIds(), []);

  const [cowId, setCowId] = useState('');
  const [kind, setKind] = useState<BreedingKind>('ai1');
  const [sireId, setSireId] = useState('');
  const [serviceDate, setServiceDate] = useState(todayIsoDate());
  const [flagged, setFlagged] = useState(false);
  const [error, setError] = useState('');
  const duePreview = serviceDate ? dueDateFromService(serviceDate) : null;

  useEffect(() => {
    if (!existing) return;
    setCowId(existing.cowId);
    setKind(existing.kind);
    setSireId(existing.sireId ?? '');
    setServiceDate(existing.serviceDate ?? todayIsoDate());
    setFlagged(existing.flagged);
  }, [existing]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cowId.trim()) {
      setError('Cow I.D. is required.');
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
    await upsertAnimalByHerdId(record.cowId);
    if (record.sireId) await upsertAnimalByHerdId(record.sireId);
    toast('Breeding row saved');
    navigate('/breeding');
  }

  async function onDelete() {
    if (!existing) return;
    const gone = await softDeleteRecord('breeding', existing.id);
    if (!gone) {
      toast('Could not delete that row.');
      return;
    }
    toast('Breeding row deleted');
    navigate('/breeding');
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>{existing ? 'Edit breeding' : 'Add service'}</h1>
        <p className="lede">One cow, one service. Due date fills in automatically.</p>
      </header>

      <form className="form" onSubmit={onSubmit} style={{ marginTop: '1rem' }}>
        <Field label="Cow I.D." error={error}>
          <input
            list="herd-ids"
            value={cowId}
            onChange={(e) => {
              setCowId(e.target.value);
              setError('');
            }}
            placeholder="BLK 455org"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </Field>
        <datalist id="herd-ids">
          {(herdIds ?? []).map((herdId) => (
            <option key={herdId} value={herdId} />
          ))}
        </datalist>
        <Field label="Service">
          <Segmented
            ariaLabel="Service type"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'ai1', label: 'AI 1st' },
              { value: 'ai2', label: 'AI 2nd' },
              { value: 'pasture', label: 'Pasture' },
            ]}
          />
        </Field>
        <Field label="Sire">
          <input
            value={sireId}
            onChange={(e) => setSireId(e.target.value)}
            placeholder="100 / 99"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
        <Field label="Date">
          <input
            type="date"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
          />
        </Field>
        {duePreview && (
          <div className="due-card">
            <p className="due-kicker">Date due</p>
            <p className="due-date">{formatDisplayDate(duePreview)}</p>
          </div>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={flagged}
            onChange={(e) => setFlagged(e.target.checked)}
          />
          <span>Flagged</span>
        </label>
        {existing ? (
          <DeleteRecordButton
            label="Delete service"
            confirmText="Delete this breeding row from this ranch’s book?"
            onDelete={onDelete}
          />
        ) : null}
        <div className="sticky-actions">
          <Link className="btn ghost" to="/breeding">
            Cancel
          </Link>
          <button type="submit" className="btn primary">
            Save service
          </button>
        </div>
      </form>
    </div>
  );
}
