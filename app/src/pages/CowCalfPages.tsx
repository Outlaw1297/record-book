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
  type CowCalfRecord,
  type Sex,
} from '../db/schema';
import { listHerdIds } from '../lib/herd';
import { DeleteRecordButton } from '../ui/DeleteRecordButton';
import { EmptyState, Field, Segmented } from '../ui/Field';
import { useToast } from '../ui/Toast';

const REMARK_CHIPS = ['poll', 'GAGM', 'FAGM', 'open', 'preme pull', 'BB'];

export function CowCalfListPage() {
  const settings = useLiveQuery(() => getSettings());
  const year = settings?.currentYear ?? new Date().getFullYear();
  const rows = useLiveQuery(
    () =>
      db.cowCalf
        .filter((r) => !r.deletedAt && r.year === year)
        .reverse()
        .sortBy('updatedAt'),
    [year],
  );

  return (
    <div className="page">
      <header className="page-header row-between" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Cow – Calf</h1>
          <p className="lede">This year’s calving page · {year}</p>
        </div>
        <Link className="btn primary" to="/cow-calf/new">
          Log calf
        </Link>
      </header>

      {(rows?.length ?? 0) === 0 ? (
        <div style={{ marginTop: '1rem' }}>
          <EmptyState
            title="No calves logged"
            body="When a cow calves, tap Log calf. Fields stay large enough for gloves."
            actionTo="/cow-calf/new"
            actionLabel="Log calf"
          />
        </div>
      ) : (
        <>
          <div className="card-list card-mobile" style={{ marginTop: '1rem' }}>
            {rows?.map((row) => (
              <Link key={row.id} className="list-card" to={`/cow-calf/${row.id}`}>
                <h2>{row.openWithoutCalf ? row.cowId : row.calfId || 'Calf'}</h2>
                <p>
                  Dam {row.cowId}
                  {row.sex ? ` · ${row.sex}` : ''}
                  {row.calvingDate ? ` · ${row.calvingDate}` : ''}
                </p>
              </Link>
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
                </tr>
              </thead>
              <tbody>
                {rows?.map((row) => (
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
  const settings = useLiveQuery(() => getSettings());
  const existing = useLiveQuery(
    () => (id && id !== 'new' ? db.cowCalf.get(id) : undefined),
    [id],
  );
  const herdIds = useLiveQuery(() => listHerdIds(), []);

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
      year: settings?.currentYear ?? new Date().getFullYear(),
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
                placeholder="Diablo / 5/5"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            <div className="form-row">
              <Field label="Birth weight">
                <input
                  value={birthWeight}
                  onChange={(e) => setBirthWeight(e.target.value)}
                  placeholder="80"
                  inputMode="decimal"
                />
              </Field>
              <Field label="Calv EZ">
                <input
                  value={calvingEase}
                  onChange={(e) => setCalvingEase(e.target.value)}
                  placeholder="1"
                  inputMode="numeric"
                />
              </Field>
            </div>
            <Field label="Birth codes">
              <input
                value={birthCodes}
                onChange={(e) => setBirthCodes(e.target.value)}
                placeholder="BB / RN / BEF"
              />
            </Field>
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

        {existing ? (
          <DeleteRecordButton
            label="Delete row"
            confirmText="Delete this calf row from this ranch’s book?"
            onDelete={onDelete}
          />
        ) : null}
        <div className="sticky-actions">
          <Link className="btn ghost" to="/cow-calf">
            Cancel
          </Link>
          <button type="submit" className="btn primary">
            Save calf
          </button>
        </div>
      </form>
    </div>
  );
}
