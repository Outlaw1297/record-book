import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  findAnimalByHerdId,
  isActiveCattle,
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
import {
  BREED_CHOICES,
  COLOR_CHOICES,
  TAG_COLOR_CHOICES,
  TATTOO_LOC_CHOICES,
  TREATMENT_PRODUCT_CHOICES,
  TREATMENT_ROUTE_CHOICES,
  mergeChoices,
  rankedLabels,
} from '../lib/choices';
import { getLifetime, listHerdIds } from '../lib/herd';
import { uniqueYears } from '../lib/year';
import { cowSenseStatus } from '../interop/fields';
import { DeleteRecordButton } from '../ui/DeleteRecordButton';
import { EmptyState, Field, Segmented } from '../ui/Field';
import { RecordToolbar, matchesQuery } from '../ui/RecordToolbar';
import { SuggestSelect } from '../ui/SuggestSelect';
import {
  AnimalRecordFields,
  ANIMAL_FIELD_TABS,
  type AnimalFieldTab,
} from '../ui/AnimalRecordFields';
import { useToast } from '../ui/Toast';

type AnimalTab = AnimalFieldTab | 'treatments' | 'history';

const TABS: Array<{ id: AnimalTab; label: string }> = [
  ...ANIMAL_FIELD_TABS,
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
  const [typeFilter, setTypeFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState<'all' | number>('all');
  const animals = useLiveQuery(
    () => db.animals.filter((row) => !row.deletedAt).sortBy('herdId'),
    [],
  );

  const years = useMemo(
    () => uniqueYears((animals ?? []).map((animal) => animal.yearBorn)),
    [animals],
  );
  const types = useMemo(
    () => rankedLabels((animals ?? []).map((animal) => animal.animalType)),
    [animals],
  );
  const locations = useMemo(
    () => rankedLabels((animals ?? []).map((animal) => animal.location)),
    [animals],
  );

  const visible = useMemo(() => {
    return (animals ?? []).filter((animal) => {
      if (filter === 'active' && !isActiveCattle(animal.status)) {
        return false;
      }
      if (filter === 'gone' && isActiveCattle(animal.status)) {
        return false;
      }
      if (typeFilter !== 'all' && (animal.animalType || '') !== typeFilter) return false;
      if (locationFilter !== 'all' && (animal.location || '') !== locationFilter) return false;
      if (yearFilter !== 'all' && animal.yearBorn !== yearFilter) return false;
      return matchesQuery(
        [
          animal.herdId,
          animal.name,
          animal.electronicId,
          animal.tattoo,
          animal.location,
          animal.damId,
          animal.sireId,
          animal.animalType,
          animal.groupName,
          animal.yearBorn,
        ],
        query,
      );
    });
  }, [animals, filter, locationFilter, query, typeFilter, yearFilter]);

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

      <RecordToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Visual ID / EID / dam / location"
        year={yearFilter}
        onYear={setYearFilter}
        years={years}
      >
        <label className="filter-field">
          <span className="sr-only">Type</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All types</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span className="sr-only">Location</span>
          <select
            value={locationFilter}
            onChange={(event) => setLocationFilter(event.target.value)}
          >
            <option value="all">All locations</option>
            {locations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </label>
      </RecordToolbar>

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

      {(animals?.length ?? 0) === 0 ? (
        <div style={{ marginTop: '1rem' }}>
          <EmptyState
            title="No animals yet"
            body="Import the Cow Sense .csh (a copy, never the original), or add one animal by Visual ID, Sex, Type, and Status."
            actionTo="/import"
            actionLabel="Import Cow Sense"
          />
        </div>
      ) : visible.length === 0 ? (
        <p className="empty-match">No animals match that search.</p>
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
  const catalog = useLiveQuery(
    () => db.animals.filter((row) => !row.deletedAt).toArray(),
    [],
  );
  const allTreatments = useLiveQuery(
    () => db.treatments.filter((row) => !row.deletedAt).toArray(),
    [],
  );
  const herdIds = useLiveQuery(() => listHerdIds(), []);
  const locationOptions = useMemo(
    () => rankedLabels((catalog ?? []).map((row) => row.location)),
    [catalog],
  );
  const groupOptions = useMemo(
    () => rankedLabels((catalog ?? []).map((row) => row.groupName)),
    [catalog],
  );
  const colorOptions = useMemo(
    () => mergeChoices(rankedLabels((catalog ?? []).map((row) => row.color)), COLOR_CHOICES),
    [catalog],
  );
  const breedOptions = useMemo(
    () => mergeChoices(rankedLabels((catalog ?? []).map((row) => row.breed)), BREED_CHOICES),
    [catalog],
  );
  const tagColorOptions = useMemo(
    () => mergeChoices(rankedLabels((catalog ?? []).map((row) => row.tagColor)), TAG_COLOR_CHOICES),
    [catalog],
  );
  const tattooLocOptions = useMemo(
    () =>
      mergeChoices(rankedLabels((catalog ?? []).map((row) => row.tattooLoc)), TATTOO_LOC_CHOICES),
    [catalog],
  );
  const productOptions = useMemo(
    () =>
      mergeChoices(
        rankedLabels((allTreatments ?? []).map((row) => row.product)),
        TREATMENT_PRODUCT_CHOICES,
      ),
    [allTreatments],
  );

  const [tab, setTab] = useState<AnimalTab>('identity');
  const [animal, setAnimal] = useState<Animal>(blankAnimal());
  const [txDate, setTxDate] = useState(todayIsoDate());
  const [txProduct, setTxProduct] = useState('');
  const [txDose, setTxDose] = useState('');
  const [txRoute, setTxRoute] = useState('');
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
      route: txRoute.trim() || undefined,
      notes: txNotes.trim() || undefined,
      updatedAt: nowIso(),
    };
    await db.treatments.put(row);
    await queueChange('treatments', row.id, 'upsert', row);
    setTxProduct('');
    setTxDose('');
    setTxRoute('');
    setTxNotes('');
    toast('Treatment saved');
  }

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
        {tab === 'identity' || tab === 'traits' || tab === 'performance' || tab === 'notes' ? (
          <AnimalRecordFields
            animal={animal}
            patch={patch}
            tab={tab}
            error={error}
            herdIds={herdIds ?? []}
            options={{
              location: locationOptions,
              group: groupOptions,
              color: colorOptions,
              breed: breedOptions,
              tagColor: tagColorOptions,
              tattooLoc: tattooLocOptions,
            }}
            excludeAnimalId={existing?.id ?? animal.id}
          />
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
          <SuggestSelect
            label="Product"
            value={txProduct}
            onChange={setTxProduct}
            options={productOptions}
          />
          <div className="form-row">
            <Field label="Dose">
              <input value={txDose} onChange={(e) => setTxDose(e.target.value)} />
            </Field>
            <SuggestSelect
              label="Route"
              value={txRoute}
              onChange={setTxRoute}
              options={TREATMENT_ROUTE_CHOICES}
            />
          </div>
          <Field label="Notes">
            <input value={txNotes} onChange={(e) => setTxNotes(e.target.value)} />
          </Field>
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
