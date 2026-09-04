import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  findAnimalByHerdId,
  newId,
  nowIso,
  todayIsoDate,
  upsertAnimalByHerdId,
  queueChange,
  softDeleteRecord,
  type Animal,
  type CowCalfRecord,
  type Sex,
} from '../db/schema';
import {
  BIRTH_CODE_CHOICES,
  BREED_CHOICES,
  CALVING_EASE_CODE_CHOICES,
  COLOR_CHOICES,
  TAG_COLOR_CHOICES,
  TATTOO_LOC_CHOICES,
  mergeChoices,
  rankedLabels,
} from '../lib/choices';
import { listHerdIds } from '../lib/herd';
import {
  animalEaseFromCode,
  calfRowLabel,
  codeFromAnimalEase,
} from '../lib/cowCalf';
import { recordYear, uniqueYears } from '../lib/year';
import { DeleteRecordButton } from '../ui/DeleteRecordButton';
import { EmptyState, Field, Segmented } from '../ui/Field';
import { RecordToolbar, matchesQuery, matchesYear } from '../ui/RecordToolbar';
import { SuggestSelect } from '../ui/SuggestSelect';
import {
  AnimalRecordFields,
  ANIMAL_FIELD_TABS,
  type AnimalFieldTab,
} from '../ui/AnimalRecordFields';
import { useToast } from '../ui/Toast';

const REMARK_CHIPS = ['poll', 'GAGM', 'FAGM', 'open', 'preme pull', 'BB'];

export function CowCalfListPage() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [year, setYear] = useState<'all' | number>('all');
  const [sex, setSex] = useState<'all' | Sex>('all');
  const rows = useLiveQuery(
    () => db.cowCalf.filter((r) => !r.deletedAt).reverse().sortBy('updatedAt'),
    [],
  );
  const years = useMemo(() => uniqueYears((rows ?? []).map((row) => row.year)), [rows]);
  const visible = useMemo(
    () =>
      (rows ?? []).filter((row) => {
        if (!matchesYear(row.year, year)) return false;
        if (sex !== 'all' && row.sex !== sex) return false;
        return matchesQuery(
          [row.calfId, row.cowId, row.sireId, row.sex, row.calvingDate, row.remarks, row.year],
          query,
        );
      }),
    [query, rows, sex, year],
  );

  async function deleteRow(row: CowCalfRecord) {
    const gone = await softDeleteRecord('cowCalf', row.id);
    toast(gone ? 'Calf row deleted' : 'Could not delete that row.');
  }

  return (
    <div className="page">
      <header className="page-header row-between" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Cow – Calf</h1>
          <p className="lede">Every calving year stays in this book. Search or filter to find a row.</p>
        </div>
        <Link className="btn primary" to="/cow-calf/new">
          Log calf
        </Link>
      </header>

      <RecordToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Cow / calf / sire / remarks"
        year={year}
        onYear={setYear}
        years={years}
      >
        <label className="filter-field">
          <span className="sr-only">Sex</span>
          <select value={sex} onChange={(event) => setSex(event.target.value as 'all' | Sex)}>
            <option value="all">All sexes</option>
            <option value="F">Heifer</option>
            <option value="M">Bull</option>
          </select>
        </label>
      </RecordToolbar>

      {(rows?.length ?? 0) === 0 ? (
        <div style={{ marginTop: '1rem' }}>
          <EmptyState
            title="No calves logged"
            body="When a cow calves, tap Log calf. Fields stay large enough for gloves."
            actionTo="/cow-calf/new"
            actionLabel="Log calf"
          />
        </div>
      ) : visible.length === 0 ? (
        <p className="empty-match">No calf rows match that search.</p>
      ) : (
        <>
          <div className="card-list card-mobile" style={{ marginTop: '1rem' }}>
            {visible.map((row) => (
              <div key={row.id} className="list-card record-row">
                <Link className="record-row-main" to={`/cow-calf/${row.id}`}>
                  <h2>{row.openWithoutCalf ? row.cowId : row.calfId || 'Calf'}</h2>
                  <p>
                    Dam {row.cowId}
                    {row.year ? ` · ${row.year}` : ''}
                    {row.sex ? ` · ${row.sex}` : ''}
                    {row.calvingDate ? ` · ${row.calvingDate}` : ''}
                  </p>
                </Link>
                <DeleteRecordButton
                  compact
                  label="Delete"
                  confirmText={`Delete ${calfRowLabel(row)} from this ranch’s book?`}
                  onDelete={() => deleteRow(row)}
                />
              </div>
            ))}
          </div>
          <div className="table-wrap table-desktop" style={{ marginTop: '1rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Calf I.D.</th>
                  <th>Cow I.D.</th>
                  <th>Sire</th>
                  <th>Sex</th>
                  <th>Calving</th>
                  <th>Birth wt</th>
                  <th>Calv EZ</th>
                  <th>Remarks</th>
                  <th>
                    <span className="sr-only">Delete</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className={row.flagged ? 'flagged' : undefined}>
                    <td>
                      <Link to={`/cow-calf/${row.id}`}>
                        {row.openWithoutCalf ? '—' : row.calfId || '—'}
                      </Link>
                    </td>
                    <td>{row.cowId}</td>
                    <td>{row.openWithoutCalf ? 'open' : row.sireId || '—'}</td>
                    <td>{row.sex || '—'}</td>
                    <td>{row.calvingDate || '—'}</td>
                    <td>
                      {[row.birthWeight, row.birthCodes].filter(Boolean).join(' ') ||
                        '—'}
                    </td>
                    <td>{row.calvingEase || '—'}</td>
                    <td>{row.remarks || '—'}</td>
                    <td>
                      <DeleteRecordButton
                        compact
                        label="Delete"
                        confirmText={`Delete ${calfRowLabel(row)} from this ranch’s book?`}
                        onDelete={() => deleteRow(row)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function CowCalfFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const existing = useLiveQuery(
    () => (id && id !== 'new' ? db.cowCalf.get(id) : undefined),
    [id],
  );
  const herdIds = useLiveQuery(() => listHerdIds(), []);
  const catalog = useLiveQuery(
    () => db.animals.filter((row) => !row.deletedAt).toArray(),
    [],
  );
  const usedBirthCodes = useLiveQuery(
    () => db.cowCalf.filter((row) => !row.deletedAt).toArray(),
    [],
  );
  const birthCodeOptions = useMemo(
    () =>
      mergeChoices(
        rankedLabels((usedBirthCodes ?? []).map((row) => row.birthCodes)),
        BIRTH_CODE_CHOICES,
      ),
    [usedBirthCodes],
  );
  const animalOptions = useMemo(
    () => ({
      location: rankedLabels((catalog ?? []).map((row) => row.location)),
      group: rankedLabels((catalog ?? []).map((row) => row.groupName)),
      color: mergeChoices(rankedLabels((catalog ?? []).map((row) => row.color)), COLOR_CHOICES),
      breed: mergeChoices(rankedLabels((catalog ?? []).map((row) => row.breed)), BREED_CHOICES),
      tagColor: mergeChoices(
        rankedLabels((catalog ?? []).map((row) => row.tagColor)),
        TAG_COLOR_CHOICES,
      ),
      tattooLoc: mergeChoices(
        rankedLabels((catalog ?? []).map((row) => row.tattooLoc)),
        TATTOO_LOC_CHOICES,
      ),
    }),
    [catalog],
  );

  const [tab, setTab] = useState<AnimalFieldTab>('identity');
  const [cowId, setCowId] = useState('');
  const [birthCodes, setBirthCodes] = useState('');
  const [calvingEase, setCalvingEase] = useState('1');
  const [remarks, setRemarks] = useState('');
  const [openWithoutCalf, setOpenWithoutCalf] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [error, setError] = useState('');
  const [calf, setCalf] = useState<Animal>(() => ({
    id: newId(),
    herdId: '',
    sex: '',
    status: 'active',
    animalType: 'Nursing Calf',
    birthDate: todayIsoDate(),
    yearBorn: new Date().getFullYear(),
    updatedAt: nowIso(),
  }));

  useEffect(() => {
    if (!existing) return;
    setCowId(existing.cowId);
    setBirthCodes(existing.birthCodes ?? '');
    setCalvingEase(existing.calvingEase ?? '1');
    setRemarks(existing.remarks ?? '');
    setOpenWithoutCalf(existing.openWithoutCalf);
    setFlagged(existing.flagged);
    const calfKey = existing.calfId;
    void (async () => {
      const found = calfKey ? await findAnimalByHerdId(calfKey) : undefined;
      setCalf((current) => ({
        ...(found ?? current),
        herdId: existing.calfId || current.herdId,
        damId: existing.cowId,
        sireId: existing.openWithoutCalf ? undefined : existing.sireId || found?.sireId,
        sex: existing.sex || found?.sex || '',
        birthDate: existing.calvingDate || found?.birthDate || todayIsoDate(),
        yearBorn: recordYear(existing.calvingDate, existing.year),
        birthWeight: existing.birthWeight || found?.birthWeight,
        calvingEase:
          found?.calvingEase || animalEaseFromCode(existing.calvingEase ?? ''),
      }));
    })();
  }, [existing]);

  function patchCalf(partial: Partial<Animal>) {
    setCalf((current) => ({ ...current, ...partial }));
    if (partial.damId !== undefined) {
      setCowId(partial.damId);
      setError('');
    }
    if (partial.calvingEase) {
      const code = codeFromAnimalEase(partial.calvingEase);
      if (code) setCalvingEase(code);
    }
  }

  function setDam(value: string) {
    setCowId(value);
    setError('');
    setCalf((current) => ({ ...current, damId: value.trim() || undefined }));
  }

  function setPaperEase(value: string) {
    setCalvingEase(value);
    const label = animalEaseFromCode(value);
    if (label) setCalf((current) => ({ ...current, calvingEase: label }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cowId.trim()) {
      setError('Cow I.D. is required.');
      return;
    }

    const calvingDate = calf.birthDate || todayIsoDate();
    const record: CowCalfRecord = {
      id: existing?.id ?? newId(),
      year: recordYear(calvingDate, existing?.year),
      cowId: cowId.trim(),
      calfId: openWithoutCalf ? undefined : calf.herdId.trim() || undefined,
      sireId: openWithoutCalf ? 'open' : calf.sireId?.trim() || undefined,
      sex: openWithoutCalf ? '' : calf.sex,
      calvingDate: calvingDate || undefined,
      birthWeight: openWithoutCalf ? undefined : calf.birthWeight?.trim() || undefined,
      birthCodes: birthCodes.trim() || undefined,
      calvingEase: calvingEase.trim() || undefined,
      remarks: remarks.trim() || undefined,
      openWithoutCalf,
      flagged,
      updatedAt: nowIso(),
    };

    await db.cowCalf.put(record);
    await queueChange('cowCalf', record.id, 'upsert', record);
    await upsertAnimalByHerdId(record.cowId);
    if (record.calfId) {
      const { id: _id, herdId: _herdId, updatedAt: _updatedAt, deletedAt: _deletedAt, ...extras } =
        calf;
      await upsertAnimalByHerdId(record.calfId, {
        ...extras,
        damId: record.cowId,
        sireId: record.sireId === 'open' ? extras.sireId : record.sireId,
        sex: record.sex,
        birthDate: record.calvingDate,
        yearBorn: record.year,
        birthWeight: record.birthWeight,
        calvingEase: extras.calvingEase || animalEaseFromCode(record.calvingEase ?? ''),
        animalType: extras.animalType || 'Nursing Calf',
        status: extras.status || 'active',
      });
    }
    if (record.sireId && record.sireId !== 'open') {
      await upsertAnimalByHerdId(record.sireId, { sex: 'M' });
    }
    toast(existing ? 'Calf row updated' : 'Calf saved on this device');
    navigate('/cow-calf');
  }

  async function onDelete() {
    if (!existing) return;
    const gone = await softDeleteRecord('cowCalf', existing.id);
    if (!gone) {
      toast('Could not delete that row.');
      return;
    }
    toast('Calf row deleted');
    navigate('/cow-calf');
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>{existing ? 'Edit calf row' : 'Log calf'}</h1>
        <p className="lede">
          Paper calving columns, then the same Identity, Traits, Performance, and
          Notes fields as the cow’s herd record.
        </p>
      </header>

      <form className="form" onSubmit={onSubmit} style={{ marginTop: '1rem' }}>
        <label className="check">
          <input
            type="checkbox"
            checked={openWithoutCalf}
            onChange={(e) => setOpenWithoutCalf(e.target.checked)}
          />
          <span>Open — no calf this season</span>
        </label>

        <Field label="Cow I.D." error={error}>
          <input
            value={cowId}
            onChange={(e) => setDam(e.target.value)}
            list="log-calf-herd-ids"
            placeholder="Helen / 90bk"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </Field>
        <datalist id="log-calf-herd-ids">
          {(herdIds ?? []).map((herdId) => (
            <option key={herdId} value={herdId} />
          ))}
        </datalist>

        {!openWithoutCalf ? (
          <>
            <Field label="Calf I.D.">
              <input
                value={calf.herdId}
                onChange={(e) => patchCalf({ herdId: e.target.value })}
                placeholder="67y / 247w"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            <Field label="Sex">
              <Segmented
                ariaLabel="Calf sex"
                value={calf.sex || ''}
                onChange={(value) => patchCalf({ sex: value as Sex })}
                options={[
                  { value: '', label: 'Skip' },
                  { value: 'F', label: 'Heifer' },
                  { value: 'M', label: 'Bull' },
                ]}
              />
            </Field>
            <Field label="Calving date">
              <input
                type="date"
                value={calf.birthDate || ''}
                onChange={(e) =>
                  patchCalf({
                    birthDate: e.target.value || undefined,
                    yearBorn: e.target.value
                      ? Number(e.target.value.slice(0, 4))
                      : calf.yearBorn,
                  })
                }
              />
            </Field>
            <Field label="Bred by sire I.D.">
              <input
                value={calf.sireId || ''}
                onChange={(e) => patchCalf({ sireId: e.target.value || undefined })}
                list="log-calf-herd-ids"
                placeholder="Diablo / 5/5"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            <div className="form-row">
              <Field label="Birth weight">
                <input
                  value={calf.birthWeight || ''}
                  onChange={(e) => patchCalf({ birthWeight: e.target.value || undefined })}
                  placeholder="80"
                  inputMode="decimal"
                />
              </Field>
              <SuggestSelect
                label="Calv EZ"
                value={calvingEase}
                onChange={setPaperEase}
                options={CALVING_EASE_CODE_CHOICES}
                placeholder="Select"
              />
            </div>
            <SuggestSelect
              label="Birth codes"
              value={birthCodes}
              onChange={setBirthCodes}
              options={birthCodeOptions}
            />
          </>
        ) : null}

        <Field label="Remarks">
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={3}
            placeholder="poll, GAGM, notes"
          />
        </Field>
        <div className="chip-row">
          {REMARK_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className={remarks.includes(chip) ? 'chip active' : 'chip'}
              onClick={() =>
                setRemarks((prev) =>
                  prev.includes(chip)
                    ? prev
                    : [prev, chip].filter(Boolean).join(' '),
                )
              }
            >
              {chip}
            </button>
          ))}
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={flagged}
            onChange={(e) => setFlagged(e.target.checked)}
          />
          <span>Flagged (circled on paper)</span>
        </label>

        {!openWithoutCalf ? (
          <>
            <p className="due-kicker" style={{ marginTop: '0.35rem' }}>
              Calf record
            </p>
            <p className="hint">
              Same fields as Herd → the cow. Visual ID is this calf. Treatments stay
              on the herd record after you save.
            </p>
            <nav className="book-tabs" aria-label="Calf record">
              {ANIMAL_FIELD_TABS.map((item) => (
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
            <AnimalRecordFields
              animal={calf}
              patch={patchCalf}
              tab={tab}
              herdIds={herdIds ?? []}
              options={animalOptions}
              excludeAnimalId={calf.id}
              listId="log-calf-herd-ids"
              includeDatalist={false}
              requireHerdId={false}
            />
          </>
        ) : null}

        <div className="sticky-actions">
          <Link className="btn ghost" to="/cow-calf">
            Cancel
          </Link>
          <button type="submit" className="btn primary">
            Save calf
          </button>
        </div>
        {existing ? (
          <DeleteRecordButton
            label="Delete this calf row"
            confirmText="Delete this calf row from this ranch’s book?"
            onDelete={onDelete}
          />
        ) : null}
      </form>
    </div>
  );
}
