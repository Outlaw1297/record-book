import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  ensureSettings,
  newId,
  nowIso,
  queueChange,
  type CowCalfRecord,
  type Sex,
} from '../db/schema';

const REMARK_CHIPS = ['poll', 'GAGM', 'FAGM', 'open', 'preme pull', 'BB'];

export function CowCalfListPage() {
  const settings = useLiveQuery(() => ensureSettings());
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
      <header className="page-header row-between">
        <div>
          <h1>Cow – Calf Record</h1>
          <p className="lede">List cows by herd I.D. · {year}</p>
        </div>
        <Link className="btn primary" to="/cow-calf/new">
          Add row
        </Link>
      </header>

      <div className="table-wrap">
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
            {(rows ?? []).map((row) => (
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
                <td className="remarks">{row.remarks || '—'}</td>
              </tr>
            ))}
            {(rows?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  No cow–calf rows for {year}. Add the first calf from the
                  pasture.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CowCalfFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const settings = useLiveQuery(() => ensureSettings());
  const existing = useLiveQuery(
    () => (id && id !== 'new' ? db.cowCalf.get(id) : undefined),
    [id],
  );

  const [cowId, setCowId] = useState('');
  const [calfId, setCalfId] = useState('');
  const [sireId, setSireId] = useState('');
  const [sex, setSex] = useState<Sex>('');
  const [calvingDate, setCalvingDate] = useState('');
  const [birthWeight, setBirthWeight] = useState('');
  const [birthCodes, setBirthCodes] = useState('');
  const [calvingEase, setCalvingEase] = useState('1');
  const [remarks, setRemarks] = useState('');
  const [openWithoutCalf, setOpenWithoutCalf] = useState(false);
  const [flagged, setFlagged] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setCowId(existing.cowId);
    setCalfId(existing.calfId ?? '');
    setSireId(existing.sireId ?? '');
    setSex(existing.sex);
    setCalvingDate(existing.calvingDate ?? '');
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
      alert('Cow I.D. is required');
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
    navigate('/cow-calf');
  }

  return (
    <div className="page narrow">
      <header className="page-header">
        <h1>{existing ? 'Edit cow–calf' : 'Add cow–calf'}</h1>
        <p className="lede">Same columns as the paper COW – CALF RECORD page.</p>
      </header>

      <form className="form" onSubmit={onSubmit}>
        <label className="check">
          <input
            type="checkbox"
            checked={openWithoutCalf}
            onChange={(e) => setOpenWithoutCalf(e.target.checked)}
          />
          Open (no calf this season)
        </label>

        <label>
          Cow I.D. No.
          <input
            value={cowId}
            onChange={(e) => setCowId(e.target.value)}
            placeholder="Helen / 90bk / 654 Heal"
            required
          />
        </label>

        {!openWithoutCalf && (
          <>
            <label>
              Calf I.D. No.
              <input
                value={calfId}
                onChange={(e) => setCalfId(e.target.value)}
                placeholder="67y / 247w"
              />
            </label>
            <label>
              Bred by sire I.D. No.
              <input
                value={sireId}
                onChange={(e) => setSireId(e.target.value)}
                placeholder="Diablo / 5/5"
              />
            </label>
            <label>
              Sex
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value as Sex)}
              >
                <option value="">—</option>
                <option value="F">F</option>
                <option value="M">M</option>
              </select>
            </label>
            <label>
              Calving date
              <input
                type="date"
                value={calvingDate}
                onChange={(e) => setCalvingDate(e.target.value)}
              />
            </label>
            <div className="form-row">
              <label>
                Birth weight
                <input
                  value={birthWeight}
                  onChange={(e) => setBirthWeight(e.target.value)}
                  placeholder="40"
                />
              </label>
              <label>
                Birth codes
                <input
                  value={birthCodes}
                  onChange={(e) => setBirthCodes(e.target.value)}
                  placeholder="BB / RN / BEF"
                />
              </label>
            </div>
            <label>
              Calv EZ
              <input
                value={calvingEase}
                onChange={(e) => setCalvingEase(e.target.value)}
                placeholder="1"
              />
            </label>
          </>
        )}

        <label>
          Remarks
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={3}
            placeholder="poll, GAGM, notes…"
          />
        </label>

        <div className="chip-row">
          {REMARK_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="chip"
              onClick={() =>
                setRemarks((prev) =>
                  prev.includes(chip) ? prev : [prev, chip].filter(Boolean).join(' '),
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
          Flagged (circled on paper)
        </label>

        <div className="form-actions">
          <button type="submit" className="btn primary">
            Save
          </button>
          <Link className="btn ghost" to="/cow-calf">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
