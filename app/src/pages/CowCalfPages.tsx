import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  newId,
  nowIso,
  todayIsoDate,
  upsertAnimalByHerdId,
  queueChange,
  softDeleteRecord,
  type CowCalfRecord,
  type Sex,
} from '../db/schema';
import {
  BIRTH_CODE_CHOICES,
  CALVING_EASE_CODE_CHOICES,
  mergeChoices,
  rankedLabels,
} from '../lib/choices';
import { listHerdIds } from '../lib/herd';
import { calfRowLabel } from '../lib/cowCalf';
import { recordYear, uniqueYears } from '../lib/year';
import { DeleteRecordButton } from '../ui/DeleteRecordButton';
import { EmptyState, Field, Segmented } from '../ui/Field';
import { RecordToolbar, matchesQuery, matchesYear } from '../ui/RecordToolbar';
import { SuggestSelect } from '../ui/SuggestSelect';
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
  const sireOptions = useMemo(
    () => rankedLabels((usedBirthCodes ?? []).map((row) => row.sireId)),
    [usedBirthCodes],
  );

  const [cowId, setCowId] = useState('');
  const [calfId, setCalfId] = useState('');
  const [sireId, setSireId] = useState('');
  const [sex, setSex] = useState<Sex>('');
  const [calvingDate, setCalvingDate] = useState(todayIsoDate());
  const [birthWeight, setBirthWeight] = useState('');
  const [birthCodes, setBirthCodes] = useState('');
  const [calvingEase, setCalvingEase] = useState('1');
  const [remarks, setRemarks] = useState('');
  const [openWithoutCalf, setOpenWithoutCalf] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!existing) return;
    setCowId(existing.cowId);
    setCalfId(existing.calfId ?? '');
    setSireId(existing.sireId ?? '');
    setSex(existing.sex);
    setCalvingDate(existing.calvingDate ?? todayIsoDate());
    setBirthWeight(existing.birthWeight ?? '');
    setBirthCodes(existing.birthCodes ?? '');
    setCalvingEase(existing.calvingEase ?? '1');
    setRemarks(existing.remarks ?? '');
    setOpenWithoutCalf(existing.openWithoutCalf);
    setFlagged(existing.flagged);
  }, [existing]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cowId.trim()) {
      setError('Cow I.D. is required.');
      return;
    }

    const record: CowCalfRecord = {
      id: existing?.id ?? newId(),
      year: recordYear(calvingDate, existing?.year),
      cowId: cowId.trim(),
      calfId: openWithoutCalf ? undefined : calfId.trim() || undefined,
      sireId: openWithoutCalf ? 'open' : sireId.trim() || undefined,
      sex,
      calvingDate: calvingDate || undefined,
      birthWeight: birthWeight.trim() || undefined,
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
      await upsertAnimalByHerdId(record.calfId, {
        sex,
        yearBorn: record.year,
      });
    }
    if (record.sireId && record.sireId !== 'open') {
      await upsertAnimalByHerdId(record.sireId);
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
          Same columns as the paper cow–calf page. Date defaults to today.
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
            onChange={(e) => {
              setCowId(e.target.value);
              setError('');
            }}
            list="herd-ids"
            placeholder="Helen / 90bk"
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

        {!openWithoutCalf && (
          <>
            <Field label="Calf I.D.">
              <input
                value={calfId}
                onChange={(e) => setCalfId(e.target.value)}
                placeholder="67y / 247w"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            <Field label="Sex">
              <Segmented
                ariaLabel="Calf sex"
                value={sex || ''}
                onChange={(value) => setSex(value as Sex)}
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
                value={calvingDate}
                onChange={(e) => setCalvingDate(e.target.value)}
              />
            </Field>
            <Field label="Bred by sire I.D.">
              <input
                value={sireId}
                onChange={(e) => setSireId(e.target.value)}
                list="sire-ids"
                placeholder="Diablo / 5/5"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            <datalist id="sire-ids">
              {sireOptions.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
            <div className="form-row">
              <Field label="Birth weight">
                <input
                  value={birthWeight}
                  onChange={(e) => setBirthWeight(e.target.value)}
                  placeholder="80"
                  inputMode="decimal"
                />
              </Field>
              <SuggestSelect
                label="Calv EZ"
                value={calvingEase}
                onChange={setCalvingEase}
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
        )}

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
