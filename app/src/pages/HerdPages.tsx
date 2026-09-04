import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  findAnimalByHerdId,
  newId,
  nowIso,
  queueChange,
  todayIsoDate,
  upsertAnimalByHerdId,
  softDeleteRecord,
  type Animal,
  type AnimalStatus,
  type TreatmentRecord,
} from '../db/schema';
import { EidCapture } from '../eid/EidCapture';
import { takeScannedEid } from '../eid/wand';
import { getLifetime } from '../lib/herd';
import { COW_SENSE_STATUS, COW_SENSE_TYPE, cowSenseSex, cowSenseStatus } from '../interop/fields';
import { DeleteRecordButton } from '../ui/DeleteRecordButton';
import { EmptyState, Field, Segmented } from '../ui/Field';
import { IconSearch } from '../ui/icons';
import { useToast } from '../ui/Toast';

type AnimalTab = 'identity' | 'traits' | 'performance' | 'notes' | 'treatments' | 'history';

const TABS: Array<{ id: AnimalTab; label: string }> = [
  { id: 'identity', label: 'Identity' },
  { id: 'traits', label: 'Traits' },
  { id: 'performance', label: 'Performance' },
  { id: 'notes', label: 'Notes' },
  { id: 'treatments', label: 'Treatments' },
  { id: 'history', label: 'History' },
];

function statusLabel(status: AnimalStatus): string {
  return cowSenseStatus(status);
}

export function HerdListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [tagEid, setTagEid] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'gone'>('active');
  const animals = useLiveQuery(
    () => db.animals.filter((row) => !row.deletedAt).sortBy('herdId'),
    [],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (animals ?? []).filter((animal) => {
      if (filter === 'active' && animal.status !== 'active' && animal.status !== 'open') {
        return false;
      }
      if (filter === 'gone' && (animal.status === 'active' || animal.status === 'open')) {
        return false;
      }
      if (!needle) return true;
      const hay = [
        animal.herdId,
        animal.name,
        animal.electronicId,
        animal.tattoo,
        animal.location,
        animal.damId,
        animal.sireId,
        animal.animalType,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [animals, filter, query]);

  const openFoundAnimal = useCallback(
    (animal: Animal) => {
      toast(`That’s ${animal.herdId}`);
      navigate(`/herd/${encodeURIComponent(animal.herdId)}`);
    },
    [navigate, toast],
  );

  return (
    <div className="page">
      <header className="page-header row-between" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Herd</h1>
          <p className="lede">
            Visual ID, type, and status the way Cow Sense keeps them. Import the
            .csh herd file, or a CSV if you already exported one.
          </p>
        </div>
        <div className="provider-actions">
          <Link className="btn secondary" to="/import">
            Import / export
          </Link>
          <Link className="btn secondary" to="/eid">
            Find by tag
          </Link>
          <Link className="btn primary" to="/herd/new">
            Add animal
          </Link>
        </div>
      </header>

      <label className="search-wrap" style={{ margin: '1rem 0 0.75rem' }}>
        <span className="sr-only">Search herd</span>
        <IconSearch />
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Visual ID / EID / dam / location"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>

      <section className="eid-find" aria-label="Find by EID tag">
        <p className="field-label">Lost a tag?</p>
        <p className="hint">Photo the disc or scan with the wand to see who it belongs to.</p>
        <EidCapture
          variant="lookup"
          methods={['photo', 'wand']}
          value={tagEid}
          onChange={setTagEid}
          autoOpen
          onOpenAnimal={openFoundAnimal}
        />
      </section>

      <Segmented
        ariaLabel="Herd filter"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'all', label: 'All' },
          { value: 'gone', label: 'Sold / dead' },
        ]}
      />

      {(visible.length ?? 0) === 0 ? (
        <div style={{ marginTop: '1rem' }}>
          <EmptyState
            title="No animals yet"
            body="Import the Cow Sense .csh (a copy, never the original), or add one animal by Visual ID, Sex, Type, and Status."
            actionTo="/import"
            actionLabel="Import Cow Sense"
          />
        </div>
      ) : (
        <div className="card-list" style={{ marginTop: '1rem' }}>
          {visible.map((animal) => (
            <Link
              key={animal.id}
              className="list-card"
              to={`/herd/${encodeURIComponent(animal.herdId)}`}
            >
              <div className="row-between" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                <h2>{animal.herdId}</h2>
                <span className={`badge status-${animal.status}`}>{statusLabel(animal.status)}</span>
              </div>
              <p>
                {[animal.animalType, animal.sex === 'F' ? 'F' : animal.sex === 'M' ? 'M' : '', animal.location, animal.name]
                  .filter(Boolean)
                  .join(' · ') || 'Open record'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function blankAnimal(): Animal {
  return {
    id: newId(),
    herdId: '',
    sex: '',
    status: 'active',
    animalType: 'Nursing Calf',
    updatedAt: nowIso(),
  };
}

export function HerdDetailPage() {
  const { herdId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isNew = herdId === 'new';
  const decoded = isNew ? '' : decodeURIComponent(herdId);
  const existing = useLiveQuery(
    () => (isNew ? undefined : findAnimalByHerdId(decoded)),
    [decoded, isNew],
  );
  const lifetime = useLiveQuery(
    () => (decoded ? getLifetime(decoded) : undefined),
    [decoded],
  );
  const treatments = useLiveQuery(
    () =>
      decoded
        ? db.treatments
            .filter(
              (row) =>
                !row.deletedAt &&
                row.animalHerdId.toLowerCase() === decoded.toLowerCase(),
            )
            .toArray()
        : [],
    [decoded],
  );

  const [tab, setTab] = useState<AnimalTab>('identity');
  const [animal, setAnimal] = useState<Animal>(blankAnimal());
  const [txDate, setTxDate] = useState(todayIsoDate());
  const [txProduct, setTxProduct] = useState('');
  const [txDose, setTxDose] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [error, setError] = useState('');
  const pendingEid = useRef(takeScannedEid());

  useEffect(() => {
    const scanned = pendingEid.current;
    if (existing) {
      setAnimal(scanned ? { ...existing, electronicId: scanned } : existing);
      if (scanned) pendingEid.current = undefined;
      return;
    }
    if (isNew && scanned) {
      setAnimal((current) => ({ ...current, electronicId: scanned }));
    }
  }, [existing, isNew]);

  function patch(partial: Partial<Animal>) {
    setAnimal((current) => ({ ...current, ...partial }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!animal.herdId.trim()) {
      setError('Visual ID is required.');
      setTab('identity');
      return;
    }
    if (!animal.sex) {
      setError('Sex is required (Heifer, Cow, Bull, or Steer).');
      setTab('identity');
      return;
    }
    if (!animal.animalType?.trim()) {
      setError('Type is required.');
      setTab('identity');
      return;
    }
    const saved = await upsertAnimalByHerdId(animal.herdId.trim(), {
      ...animal,
      sex: animal.sex,
      status: animal.status,
    });
    toast(existing || !isNew ? 'Animal saved' : 'Animal added to this ranch');
    if (saved && isNew) navigate(`/herd/${encodeURIComponent(saved.herdId)}`);
  }

  async function deleteAnimal() {
    if (!existing?.id) return;
    const gone = await softDeleteRecord('animals', existing.id);
    if (!gone) {
      toast('Could not delete that animal.');
      return;
    }
    toast('Animal deleted from this ranch’s book');
    navigate('/herd');
  }

  async function deleteTreatment(id: string) {
    const gone = await softDeleteRecord('treatments', id);
    toast(gone ? 'Treatment deleted' : 'Could not delete that treatment.');
  }

  async function addTreatment(event: FormEvent) {
    event.preventDefault();
    if (!animal.herdId.trim() || !txProduct.trim()) {
      toast('Save the animal and enter a product.');
      return;
    }
    const row: TreatmentRecord = {
      id: newId(),
      animalHerdId: animal.herdId.trim(),
      date: txDate || undefined,
      product: txProduct.trim(),
      dose: txDose.trim() || undefined,
      notes: txNotes.trim() || undefined,
      updatedAt: nowIso(),
    };
    await db.treatments.put(row);
    await queueChange('treatments', row.id, 'upsert', row);
    setTxProduct('');
    setTxDose('');
    setTxNotes('');
    toast('Treatment saved');
  }

  const sexWord = cowSenseSex(animal.sex, animal.animalType) || '';

  return (
    <div className="page">
      <header className="page-header">
        <p className="due-kicker">{isNew ? 'New animal' : animal.animalType || 'Animal'}</p>
        <h1>{isNew ? 'Add animal' : animal.herdId || decoded}</h1>
        <p className="lede">
          Same required fields as Cow Sense: Sex, Type, Status. Other tabs match
          Identity, Traits, Performance, Notes, and Treatments.
        </p>
      </header>

      <nav className="book-tabs" aria-label="Animal record">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'active' : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <form className="form" onSubmit={onSubmit}>
        {tab === 'identity' ? (
          <>
            <Field label="Visual ID" error={error && !animal.herdId.trim() ? error : undefined}>
              <input
                value={animal.herdId}
                onChange={(e) => patch({ herdId: e.target.value })}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </Field>
            <div className="form-row">
              <Field label="Sex">
                <select
                  value={sexWord}
                  onChange={(e) => {
                    const value = e.target.value;
                    const next: Partial<Animal> = {
                      sex: value === 'Cow' || value === 'Heifer' ? 'F' : value ? 'M' : '',
                    };
                    if (value === 'Cow' && !animal.animalType) next.animalType = 'Cow';
                    if (value === 'Steer') next.animalType = animal.animalType || 'Steer';
                    patch(next);
                  }}
                >
                  <option value="">Select</option>
                  <option value="Heifer">Heifer</option>
                  <option value="Cow">Cow</option>
                  <option value="Bull">Bull</option>
                  <option value="Steer">Steer</option>
                </select>
              </Field>
              <Field label="Type">
                <select
                  value={animal.animalType || ''}
                  onChange={(e) => patch({ animalType: e.target.value })}
                >
                  <option value="">Select</option>
                  {animal.animalType &&
                  !(COW_SENSE_TYPE as readonly string[]).includes(animal.animalType) ? (
                    <option value={animal.animalType}>{animal.animalType}</option>
                  ) : null}
                  {COW_SENSE_TYPE.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Status">
              <select
                value={cowSenseStatus(animal.status)}
                onChange={(e) => {
                  const value = e.target.value as (typeof COW_SENSE_STATUS)[number];
                  const map: Record<string, AnimalStatus> = {
                    Active: 'active',
                    Sold: 'sold',
                    Dead: 'dead',
                    Culled: 'culled',
                    Disposed: 'culled',
                    Reference: 'reference',
                    Open: 'open',
                  };
                  patch({ status: map[value] || 'active' });
                }}
              >
                {COW_SENSE_STATUS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-row">
              <Field label="Birth date">
                <input
                  type="date"
                  value={animal.birthDate || ''}
                  onChange={(e) =>
                    patch({
                      birthDate: e.target.value || undefined,
                      yearBorn: e.target.value
                        ? Number(e.target.value.slice(0, 4))
                        : animal.yearBorn,
                    })
                  }
                />
              </Field>
              <Field label="Birth year">
                <input
                  type="number"
                  inputMode="numeric"
                  value={animal.yearBorn ?? ''}
                  onChange={(e) =>
                    patch({ yearBorn: e.target.value ? Number(e.target.value) : undefined })
                  }
                />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Location">
                <input
                  value={animal.location || ''}
                  onChange={(e) => patch({ location: e.target.value || undefined })}
                />
              </Field>
              <Field label="Group">
                <input
                  value={animal.groupName || ''}
                  onChange={(e) => patch({ groupName: e.target.value || undefined })}
                />
              </Field>
            </div>
            <div className="field">
              <span className="field-label">Electronic ID</span>
              <EidCapture
                variant="fill"
                value={animal.electronicId || ''}
                onChange={(eid) => patch({ electronicId: eid.trim() || undefined })}
                excludeAnimalId={existing?.id ?? animal.id}
              />
            </div>
            <div className="form-row">
              <Field label="Sire">
                <input
                  value={animal.sireId || ''}
                  onChange={(e) => patch({ sireId: e.target.value || undefined })}
                  autoCapitalize="characters"
                />
              </Field>
              <Field label="Dam">
                <input
                  value={animal.damId || ''}
                  onChange={(e) => patch({ damId: e.target.value || undefined })}
                  autoCapitalize="characters"
                />
              </Field>
            </div>
            <Field label="Name">
              <input
                value={animal.name || ''}
                onChange={(e) => patch({ name: e.target.value || undefined })}
              />
            </Field>
            <div className="form-row">
              <Field label="Registration - Primary">
                <input
                  value={animal.registration || ''}
                  onChange={(e) => patch({ registration: e.target.value || undefined })}
                />
              </Field>
              <Field label="Tattoo 1">
                <input
                  value={animal.tattoo || ''}
                  onChange={(e) => patch({ tattoo: e.target.value || undefined })}
                />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Tattoo 1 Loc">
                <input
                  value={animal.tattooLoc || ''}
                  onChange={(e) => patch({ tattooLoc: e.target.value || undefined })}
                />
              </Field>
              <Field label="Brand">
                <input
                  value={animal.brand || ''}
                  onChange={(e) => patch({ brand: e.target.value || undefined })}
                />
              </Field>
            </div>
          </>
        ) : null}

        {tab === 'traits' ? (
          <>
            <div className="form-row">
              <Field label="Color">
                <input
                  value={animal.color || ''}
                  onChange={(e) => patch({ color: e.target.value || undefined })}
                />
              </Field>
              <Field label="Breed 1">
                <input
                  value={animal.breed || ''}
                  onChange={(e) => patch({ breed: e.target.value || undefined })}
                />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Horn Code">
                <select
                  value={animal.horned || ''}
                  onChange={(e) => patch({ horned: e.target.value || undefined })}
                >
                  <option value="">Select</option>
                  <option value="Horned">Horned</option>
                  <option value="Polled">Polled</option>
                  <option value="Scurred">Scurred</option>
                </select>
              </Field>
              <Field label="Twin Code">
                <select
                  value={animal.birthType || ''}
                  onChange={(e) => patch({ birthType: e.target.value || undefined })}
                >
                  <option value="">Select</option>
                  <option value="Single">Single</option>
                  <option value="Twin to heifer calf">Twin to heifer calf</option>
                  <option value="Twin to a bull calf">Twin to a bull calf</option>
                  <option value="Multiple Birth">Multiple Birth</option>
                </select>
              </Field>
            </div>
            <Field label="Calving Ease">
              <select
                value={animal.calvingEase || ''}
                onChange={(e) => patch({ calvingEase: e.target.value || undefined })}
              >
                <option value="">Select</option>
                <option value="No difficulty - no assistance">No difficulty - no assistance</option>
                <option value="Minor difficulty - some assistance">
                  Minor difficulty - some assistance
                </option>
                <option value="Major difficulty - mechanical assistance">
                  Major difficulty - mechanical assistance
                </option>
                <option value="Cesarean section or other surgery">
                  Cesarean section or other surgery
                </option>
                <option value="Abnormal presentation">Abnormal presentation</option>
              </select>
            </Field>
            <Field label="Service Type">
              <select
                value={animal.serviceType || ''}
                onChange={(e) => patch({ serviceType: e.target.value || undefined })}
              >
                <option value="">Select</option>
                <option value="Natural">Natural</option>
                <option value="AI">AI</option>
                <option value="ET">ET</option>
              </select>
            </Field>
            <div className="form-row">
              <Field label="Chute Score">
                <input
                  value={animal.disposition || ''}
                  onChange={(e) => patch({ disposition: e.target.value || undefined })}
                  placeholder="1–6"
                />
              </Field>
              <Field label="Body Condition">
                <input
                  value={animal.bodyCondition || ''}
                  onChange={(e) => patch({ bodyCondition: e.target.value || undefined })}
                  placeholder="1–9"
                />
              </Field>
            </div>
            <Field label="Identity comment / phenotype">
              <input
                value={animal.phenotype || ''}
                onChange={(e) => patch({ phenotype: e.target.value || undefined })}
              />
            </Field>
            <Field label="Tag color">
              <input
                value={animal.tagColor || ''}
                onChange={(e) => patch({ tagColor: e.target.value || undefined })}
              />
            </Field>
          </>
        ) : null}

        {tab === 'performance' ? (
          <>
            <Field label="Birth weight">
              <input
                value={animal.birthWeight || ''}
                onChange={(e) => patch({ birthWeight: e.target.value || undefined })}
                inputMode="decimal"
              />
            </Field>
            <div className="form-row">
              <Field label="Weaning weight">
                <input
                  value={animal.weaningWeight || ''}
                  onChange={(e) => patch({ weaningWeight: e.target.value || undefined })}
                  inputMode="decimal"
                />
              </Field>
              <Field label="Weaning date">
                <input
                  type="date"
                  value={animal.weaningDate || ''}
                  onChange={(e) => patch({ weaningDate: e.target.value || undefined })}
                />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Yearling weight">
                <input
                  value={animal.yearlingWeight || ''}
                  onChange={(e) => patch({ yearlingWeight: e.target.value || undefined })}
                  inputMode="decimal"
                />
              </Field>
              <Field label="Yearling date">
                <input
                  type="date"
                  value={animal.yearlingDate || ''}
                  onChange={(e) => patch({ yearlingDate: e.target.value || undefined })}
                />
              </Field>
            </div>
          </>
        ) : null}

        {tab === 'notes' ? (
          <Field label="Notes">
            <textarea
              value={animal.notes || ''}
              onChange={(e) => patch({ notes: e.target.value || undefined })}
            />
          </Field>
        ) : null}

        {error && tab === 'identity' ? <p className="field-error">{error}</p> : null}

        {tab !== 'treatments' && tab !== 'history' ? (
          <>
            {!isNew && existing ? (
              <DeleteRecordButton
                label="Delete animal"
                confirmText={`Delete ${animal.herdId || decoded} from this ranch’s book? This does not change the Cow Sense .csh.`}
                onDelete={deleteAnimal}
              />
            ) : null}
            <div className="sticky-actions">
              <Link className="btn secondary" to="/herd">
                Back to herd
              </Link>
              <button type="submit" className="btn primary">
                Save animal
              </button>
            </div>
          </>
        ) : null}
      </form>

      {tab === 'treatments' ? (
        <form className="form compact" onSubmit={addTreatment}>
          {(treatments ?? []).length === 0 ? (
            <p className="hint">No treatments on this animal yet.</p>
          ) : (
            <div className="card-list">
              {(treatments ?? [])
                .slice()
                .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                .map((row) => (
                  <div className="list-card" key={row.id}>
                    <div className="row-between" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <h2>{row.product || 'Treatment'}</h2>
                      <button
                        type="button"
                        className="btn danger"
                        style={{ minHeight: '2.5rem', padding: '0.35rem 0.7rem' }}
                        onClick={() => {
                          if (!window.confirm('Delete this treatment?')) return;
                          void deleteTreatment(row.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                    <p>
                      {[row.date, row.dose, row.route, row.notes].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                ))}
            </div>
          )}
          <Field label="Date">
            <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
          </Field>
          <Field label="Product">
            <input value={txProduct} onChange={(e) => setTxProduct(e.target.value)} />
          </Field>
          <div className="form-row">
            <Field label="Dose">
              <input value={txDose} onChange={(e) => setTxDose(e.target.value)} />
            </Field>
            <Field label="Notes">
              <input value={txNotes} onChange={(e) => setTxNotes(e.target.value)} />
            </Field>
          </div>
          <div className="sticky-actions">
            <Link className="btn secondary" to="/herd">
              Back to herd
            </Link>
            <button type="submit" className="btn primary">
              Save treatment
            </button>
          </div>
        </form>
      ) : null}

      {tab === 'history' ? (
        <div>
          {(lifetime?.events.length ?? 0) === 0 ? (
            <EmptyState
              title="No history yet"
              body="Calving, breeding, pasture, and sales for this Visual ID show up here."
              actionTo="/cow-calf/new"
              actionLabel="Log calf"
            />
          ) : (
            <div className="timeline">
              {lifetime?.events.map((event) => (
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
      ) : null}
    </div>
  );
}
