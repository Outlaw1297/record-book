import { useState } from 'react'
import { AnimalChip } from '../components/AnimalChip.tsx'
import { formatDisplayDate } from '../lib/dates.ts'
import { animalFromToken, animalShortLabel, findAnimal, newId, upsertAnimal } from '../lib/ids.ts'
import { useBook } from '../store.tsx'
import type { RecordBook, SaleRecord, Sex } from '../types.ts'

export function SalesPage() {
  const { book, replaceBook, removeSale } = useBook()
  const [editing, setEditing] = useState<SaleRecord | null>(null)

  return (
    <>
      <h2 className="page-title">Sale Record — {book.year}</h2>
      <p className="lede">
        Calf I.D., sex, sold to, date, price. Page 110 in the notebook was blank; start logging
        sales here.
      </p>
      <p>
        <button
          className="btn"
          type="button"
          onClick={() =>
            setEditing({ id: newId('sale'), year: book.year, calfId: '', soldTo: '' })
          }
        >
          Add sale
        </button>
      </p>
      {editing && (
        <SaleForm
          record={toFormSale(editing, book)}
          onCancel={() => setEditing(null)}
          onSave={(form) => {
            const calf = animalFromToken(form.calfId)
            replaceBook({
              ...book,
              animals: upsertAnimal(book.animals, calf),
              sales: upsertById(book.sales, { ...form, calfId: calf.id }),
            })
            setEditing(null)
          }}
        />
      )}
      {book.sales.length === 0 && !editing && (
        <p className="empty">No sales recorded yet for {book.year}.</p>
      )}
      {book.sales.length > 0 && (
        <div className="table-wrap">
          <table className="ledger">
            <thead>
              <tr>
                <th>Calf I.D.</th>
                <th>Sex</th>
                <th>Sold to</th>
                <th>Date</th>
                <th>Price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {book.sales.map((row) => {
                const calf = findAnimal(book.animals, row.calfId)
                return (
                  <tr key={row.id}>
                    <td>{calf ? <AnimalChip animal={calf} /> : row.calfId}</td>
                    <td>{row.sex ?? '—'}</td>
                    <td>{row.soldTo}</td>
                    <td>{formatDisplayDate(row.date)}</td>
                    <td>{row.price != null ? `$${row.price.toFixed(2)}` : '—'}</td>
                    <td className="row-actions">
                      <button className="btn secondary" type="button" onClick={() => setEditing(row)}>
                        Edit
                      </button>
                      <button className="btn danger" type="button" onClick={() => removeSale(row.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function toFormSale(row: SaleRecord, book: RecordBook): SaleRecord {
  const calf = findAnimal(book.animals, row.calfId)
  return { ...row, calfId: calf ? animalShortLabel(calf) : row.calfId }
}

function SaleForm({
  record,
  onSave,
  onCancel,
}: {
  record: SaleRecord
  onSave: (record: SaleRecord) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(record)
  return (
    <form
      className="card"
      onSubmit={(event) => {
        event.preventDefault()
        onSave(draft)
      }}
    >
      <div className="form-grid">
        <label className="field">
          Calf I.D.
          <input
            required
            value={draft.calfId}
            onChange={(event) => setDraft({ ...draft, calfId: event.target.value })}
          />
        </label>
        <label className="field">
          Sex
          <select
            value={draft.sex ?? ''}
            onChange={(event) =>
              setDraft({ ...draft, sex: (event.target.value || undefined) as Sex | undefined })
            }
          >
            <option value="">Unknown</option>
            <option value="F">F</option>
            <option value="M">M</option>
          </select>
        </label>
        <label className="field">
          Sold to
          <input value={draft.soldTo} onChange={(event) => setDraft({ ...draft, soldTo: event.target.value })} />
        </label>
        <label className="field">
          Date
          <input
            type="date"
            value={draft.date ?? ''}
            onChange={(event) => setDraft({ ...draft, date: event.target.value || undefined })}
          />
        </label>
        <label className="field">
          Price
          <input
            type="number"
            step="0.01"
            value={draft.price ?? ''}
            onChange={(event) =>
              setDraft({ ...draft, price: event.target.value ? Number(event.target.value) : undefined })
            }
          />
        </label>
      </div>
      <div className="row-actions">
        <button className="btn" type="submit">
          Save sale
        </button>
        <button className="btn secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function upsertById<T extends { id: string }>(list: T[], record: T): T[] {
  const index = list.findIndex((item) => item.id === record.id)
  if (index === -1) return [...list, record]
  const next = [...list]
  next[index] = record
  return next
}
