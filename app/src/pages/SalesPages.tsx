import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  ensureSettings,
  newId,
  nowIso,
  queueChange,
  type SaleRecord,
  type Sex,
} from '../db/schema';

export function SalesListPage() {
  const settings = useLiveQuery(() => ensureSettings());
  const year = settings?.currentYear ?? new Date().getFullYear();
  const rows = useLiveQuery(
    () =>
      db.sales
        .filter((r) => !r.deletedAt && r.year === year)
        .reverse()
        .sortBy('updatedAt'),
    [year],
  );

  return (
    <div className="page">
      <header className="page-header row-between">
        <div>
          <h1>Sale Record</h1>
          <p className="lede">{year}</p>
        </div>
        <Link className="btn primary" to="/sales/new">
          Add sale
        </Link>
      </header>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Calf I.D.</th>
              <th>Sex</th>
              <th>Sold to</th>
              <th>Date</th>
              <th>Price</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((row) => (
              <tr key={row.id} className={row.flagged ? 'flagged' : undefined}>
                <td>
                  <Link to={`/sales/${row.id}`}>{row.calfId}</Link>
                </td>
                <td>{row.sex || '—'}</td>
                <td>{row.buyer || '—'}</td>
                <td>{row.saleDate || '—'}</td>
                <td>{row.price || '—'}</td>
                <td className="remarks">{row.notes || '—'}</td>
              </tr>
            ))}
            {(rows?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No sales for {year}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SalesFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const settings = useLiveQuery(() => ensureSettings());
  const existing = useLiveQuery(
    () => (id && id !== 'new' ? db.sales.get(id) : undefined),
    [id],
  );

  const [calfId, setCalfId] = useState('');
  const [sex, setSex] = useState<Sex>('');
  const [buyer, setBuyer] = useState('');
  const [saleDate, setSaleDate] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [flagged, setFlagged] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setCalfId(existing.calfId);
    setSex(existing.sex);
    setBuyer(existing.buyer ?? '');
    setSaleDate(existing.saleDate ?? '');
    setPrice(existing.price ?? '');
    setNotes(existing.notes ?? '');
    setFlagged(existing.flagged);
  }, [existing]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!calfId.trim()) {
      alert('Calf I.D. is required');
      return;
    }

    const record: SaleRecord = {
      id: existing?.id ?? newId(),
      year: settings?.currentYear ?? new Date().getFullYear(),
      calfId: calfId.trim(),
      sex,
      buyer: buyer.trim() || undefined,
      saleDate: saleDate || undefined,
      price: price.trim() || undefined,
      notes: notes.trim() || undefined,
      flagged,
      updatedAt: nowIso(),
    };

    await db.sales.put(record);
    await queueChange('sales', record.id, 'upsert', record);
    navigate('/sales');
  }

  return (
    <div className="page narrow">
      <header className="page-header">
        <h1>{existing ? 'Edit sale' : 'Add sale'}</h1>
        <p className="lede">SALE RECORD — calf, sex, sold to, date, price.</p>
      </header>

      <form className="form" onSubmit={onSubmit}>
        <label>
          Calf I.D.
          <input
            value={calfId}
            onChange={(e) => setCalfId(e.target.value)}
            placeholder="242y / 528 pk"
            required
          />
        </label>
        <label>
          Sex
          <select value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
            <option value="">—</option>
            <option value="F">F</option>
            <option value="M">M</option>
          </select>
        </label>
        <label>
          Sold to
          <input
            value={buyer}
            onChange={(e) => setBuyer(e.target.value)}
            placeholder="Buyer / sale barn"
          />
        </label>
        <label>
          Date
          <input
            type="date"
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
          />
        </label>
        <label>
          Price
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="1200"
            inputMode="decimal"
          />
        </label>
        <label>
          Notes
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="gimp / udder / old"
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={flagged}
            onChange={(e) => setFlagged(e.target.checked)}
          />
          Flagged / sold mark
        </label>
        <div className="form-actions">
          <button type="submit" className="btn primary">
            Save
          </button>
          <Link className="btn ghost" to="/sales">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
