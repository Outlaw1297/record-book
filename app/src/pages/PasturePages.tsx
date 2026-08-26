import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { EmptyState } from '../ui/Field';
import { useToast } from '../ui/Toast';
import {
  db,
  ensureSettings,
  newId,
  nowIso,
  queueChange,
  upsertAnimalByHerdId,
  type PastureExposure,
  type PastureExposureAnimal,
  type PastureRole,
} from '../db/schema';

export function PastureListPage() {
  const settings = useLiveQuery(() => ensureSettings());
  const year = settings?.currentYear ?? new Date().getFullYear();
  const rows = useLiveQuery(
    () =>
      db.pastures
        .filter((r) => !r.deletedAt && r.year === year)
        .reverse()
        .sortBy('updatedAt'),
    [year],
  );

  return (
    <div className="page">
      <header className="page-header row-between">
        <div>
          <h1>Pasture Exposure</h1>
          <p className="lede">Pasture · bull in / out · animal lists · {year}</p>
        </div>
        <Link className="btn primary" to="/pasture/new">
          Add pasture
        </Link>
      </header>

      <div className="card-list">
        {(rows ?? []).map((row) => (
          <Link key={row.id} className="list-card" to={`/pasture/${row.id}`}>
            <h2>{row.pastureName}</h2>
            <p>
              Bull in {row.bullInDate || '—'} · Bull out {row.bullOutDate || '—'}
            </p>
          </Link>
        ))}
        {(rows?.length ?? 0) === 0 && (
          <EmptyState
            title="No pastures yet"
            body="Name the pasture, bull in/out, then add animals one at a time."
            actionTo="/pasture/new"
            actionLabel="Add pasture"
          />
        )}
      </div>
    </div>
  );
}

export function PastureFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useLiveQuery(() => ensureSettings());
  const existing = useLiveQuery(
    () => (id && id !== 'new' ? db.pastures.get(id) : undefined),
    [id],
  );
  const animals = useLiveQuery(
    () =>
      existing
        ? db.pastureAnimals
            .filter((a) => a.exposureId === existing.id && !a.deletedAt)
            .toArray()
        : Promise.resolve([] as PastureExposureAnimal[]),
    [existing?.id],
  );

  const [pastureName, setPastureName] = useState('');
  const [bullInDate, setBullInDate] = useState('');
  const [bullOutDate, setBullOutDate] = useState('');
  const [notes, setNotes] = useState('');
  const [animalHerdId, setAnimalHerdId] = useState('');
  const [role, setRole] = useState<PastureRole>('cow');
  const [animalNote, setAnimalNote] = useState('');
  const [metric, setMetric] = useState('');

  useEffect(() => {
    if (!existing) return;
    setPastureName(existing.pastureName);
    setBullInDate(existing.bullInDate ?? '');
    setBullOutDate(existing.bullOutDate ?? '');
    setNotes(existing.notes ?? '');
  }, [existing]);

  async function savePasture(e: FormEvent) {
    e.preventDefault();
    if (!pastureName.trim()) {
      alert('Pasture name is required');
      return;
    }

    const record: PastureExposure = {
      id: existing?.id ?? newId(),
      year: settings?.currentYear ?? new Date().getFullYear(),
      pastureName: pastureName.trim(),
      bullInDate: bullInDate || undefined,
      bullOutDate: bullOutDate || undefined,
      notes: notes.trim() || undefined,
      updatedAt: nowIso(),
    };

    await db.pastures.put(record);
    await queueChange('pastures', record.id, 'upsert', record);
    toast('Pasture saved');
    navigate(`/pasture/${record.id}`);
  }

  async function addAnimal(e: FormEvent) {
    e.preventDefault();
    if (!existing) {
      alert('Save the pasture first, then add animals.');
      return;
    }
    if (!animalHerdId.trim()) return;

    const row: PastureExposureAnimal = {
      id: newId(),
      exposureId: existing.id,
      animalHerdId: animalHerdId.trim(),
      role,
      note: animalNote.trim() || undefined,
      metric: metric.trim() || undefined,
      flagged: false,
      updatedAt: nowIso(),
    };
    await db.pastureAnimals.put(row);
    await queueChange('pastureAnimals', row.id, 'upsert', row);
    await upsertAnimalByHerdId(row.animalHerdId);
    toast('Animal added');
    setAnimalHerdId('');
    setAnimalNote('');
    setMetric('');
  }

  return (
    <div className="page narrow">
      <header className="page-header">
        <h1>{existing ? existing.pastureName : 'New pasture exposure'}</h1>
        <p className="lede">
          PASTURE EXPOSURE — e.g. OLD COWS, or a List of Culls on 2+3&apos;s.
        </p>
      </header>

      <form className="form" onSubmit={savePasture}>
        <label>
          Pasture
          <input
            value={pastureName}
            onChange={(e) => setPastureName(e.target.value)}
            placeholder="OLD COWS"
            required
          />
        </label>
        <div className="form-row">
          <label>
            Bull in
            <input
              type="date"
              value={bullInDate}
              onChange={(e) => setBullInDate(e.target.value)}
            />
          </label>
          <label>
            Bull out
            <input
              type="date"
              value={bullOutDate}
              onChange={(e) => setBullOutDate(e.target.value)}
            />
          </label>
        </div>
        <label>
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </label>
        <div className="sticky-actions">
          <Link className="btn ghost" to="/pasture">
            Back
          </Link>
          <button type="submit" className="btn primary">
            Save pasture
          </button>
        </div>
      </form>

      {existing && (
        <section className="subpanel">
          <h2>Animals on this pasture</h2>
          <ul className="plain-list">
            {(animals ?? []).map((a) => (
              <li key={a.id}>
                <strong>{a.role === 'bull' ? 'Bull' : 'Cow'}</strong> {a.animalHerdId}
                {a.metric ? ` ${a.metric}` : ''}
                {a.note ? ` · ${a.note}` : ''}
              </li>
            ))}
            {(animals?.length ?? 0) === 0 && (
              <li className="muted">No animals listed yet.</li>
            )}
          </ul>

          <form className="form compact" onSubmit={addAnimal}>
            <div className="form-row">
              <label>
                Role
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as PastureRole)}
                >
                  <option value="bull">Bull</option>
                  <option value="cow">Cow</option>
                </select>
              </label>
              <label>
                Herd I.D.
                <input
                  value={animalHerdId}
                  onChange={(e) => setAnimalHerdId(e.target.value)}
                  placeholder="241w / 509w"
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Metric
                <input
                  value={metric}
                  onChange={(e) => setMetric(e.target.value)}
                  placeholder="+3.3"
                />
              </label>
              <label>
                Note
                <input
                  value={animalNote}
                  onChange={(e) => setAnimalNote(e.target.value)}
                  placeholder="BLK / Red / Jenkins"
                />
              </label>
            </div>
            <button type="submit" className="btn secondary">
              Add animal
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
