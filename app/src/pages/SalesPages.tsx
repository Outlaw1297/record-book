import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  getSettings,
  newId,
  nowIso,
  upsertAnimalByHerdId,
  queueChange,
  softDeleteRecord,
  type ListMark,
  type SaleRecord,
  type Sex,
} from '../db/schema';
import { DeleteRecordButton } from '../ui/DeleteRecordButton';
import { EmptyState, Field, Segmented } from '../ui/Field';
import { useToast } from '../ui/Toast';

function markLabel(mark?: ListMark): string {
  if (mark === 'x') return 'x';
  if (mark === 'circled') return '○';
  return '—';
}

export function SalesListPage() {
  const settings = useLiveQuery(() => getSettings());
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
      <header
        className="page-header"
        style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}
      >
        <div>
          <h1>Sales / culls</h1>
          <p className="lede">{year} · sale record and cull list</p>
        </div>
        <Link className="btn primary" to="/sales/new">
          Add row
        </Link>
      </header>

      {(rows?.length ?? 0) === 0 ? (
        <div style={{ marginTop: '1rem' }}>
          <EmptyState
            title="No sales or culls"
            body="Same page as the paper sale record. Circle or leading x if that is how you mark them."
            actionTo="/sales/new"
            actionLabel="Add row"
          />
        </div>
      ) : (
        <>
          <div className="card-list card-mobile" style={{ marginTop: '1rem' }}>
            {rows?.map((row) => (
              <Link key={row.id} className="list-card" to={`/sales/${row.id}`}>
                <h2>
                  {markLabel(row.listMark)} {row.calfId}
                </h2>
                <p>{row.notes || row.buyer || 'Sale / cull'}</p>
              </Link>
            ))}
          </div>
          <div className="table-wrap table-desktop" style={{ marginTop: '1rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mark</th>
                  <th>Calf I.D.</th>
                  <th>Sex</th>
                  <th>Sold to</th>
                  <th>Date</th>
                  <th>Price</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows?.map((row) => (
                  <tr
                    key={row.id}
                    className={
                      row.flagged || row.listMark === 'circled' ? 'flagged' : undefined
                    }
                  >
                    <td>{markLabel(row.listMark)}</td>
                    <td>
                      <Link to={`/sales/${row.id}`}>{row.calfId}</Link>
                    </td>
                    <td>{row.sex || '—'}</td>
                    <td>{row.buyer || '—'}</td>
                    <td>{row.saleDate || '—'}</td>
                    <td>{row.price || '—'}</td>
                    <td>{row.notes || '—'}</td>
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

export function SalesFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useLiveQuery(() => getSettings());
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
  const [listMark, setListMark] = useState<ListMark>('');
  const [flagged, setFlagged] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!existing) return;
    setCalfId(existing.calfId);
    setSex(existing.sex);
    setBuyer(existing.buyer ?? '');
    setSaleDate(existing.saleDate ?? '');
    setPrice(existing.price ?? '');
    setNotes(existing.notes ?? '');
    setListMark(existing.listMark ?? '');
    setFlagged(existing.flagged);
  }, [existing]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!calfId.trim()) {
      setError('Calf I.D. is required.');
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
      listMark: listMark || undefined,
      flagged: flagged || listMark === 'circled',
      updatedAt: nowIso(),
    };

    await db.sales.put(record);
    await queueChange('sales', record.id, 'upsert', record);
    await upsertAnimalByHerdId(record.calfId, {
      sex,
      status: record.buyer ? 'sold' : 'flagged',
    });
    toast('Sale / cull saved');
    navigate('/sales');
  }

  async function onDelete() {
    if (!existing) return;
    const gone = await softDeleteRecord('sales', existing.id);
    if (!gone) {
      toast('Could not delete that row.');
      return;
    }
    toast('Sale / cull deleted');
    navigate('/sales');
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>{existing ? 'Edit sale / cull' : 'Add sale / cull'}</h1>
        <p className="lede">Paper sale record — also the cull list.</p>
      </header>

      <form className="form" onSubmit={onSubmit} style={{ marginTop: '1rem' }}>
        <Field label="Calf I.D." error={error}>
          <input
            value={calfId}
            onChange={(e) => {
              setCalfId(e.target.value);
              setError('');
            }}
            placeholder="242y"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </Field>
        <Field label="Sex">
          <Segmented
            ariaLabel="Sex"
            value={sex || ''}
            onChange={(value) => setSex(value as Sex)}
            options={[
              { value: '', label: 'Skip' },
              { value: 'F', label: 'Heifer' },
              { value: 'M', label: 'Bull' },
            ]}
          />
        </Field>
        <Field label="Book mark">
          <Segmented
            ariaLabel="Book mark"
            value={listMark || ''}
            onChange={(value) => setListMark(value as ListMark)}
            options={[
              { value: '', label: 'None' },
              { value: 'circled', label: 'Circled' },
              { value: 'x', label: 'Leading x' },
            ]}
          />
        </Field>
        <Field label="Notes">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="old / gimpy / udder"
          />
        </Field>
        <Field label="Sold to">
          <input
            value={buyer}
            onChange={(e) => setBuyer(e.target.value)}
            placeholder="Buyer / sale barn"
          />
        </Field>
        <div className="form-row">
          <Field label="Date">
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
            />
          </Field>
          <Field label="Price">
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="1200"
              inputMode="decimal"
            />
          </Field>
        </div>
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
            label="Delete row"
            confirmText="Delete this sale / cull row from this ranch’s book?"
            onDelete={onDelete}
          />
        ) : null}
        <div className="sticky-actions">
          <Link className="btn ghost" to="/sales">
            Cancel
          </Link>
          <button type="submit" className="btn primary">
            Save row
          </button>
        </div>
      </form>
    </div>
  );
}
