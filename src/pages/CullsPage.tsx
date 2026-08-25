import { useState } from 'react'
import { AnimalChip } from '../components/AnimalChip.tsx'
import { formatDisplayDate } from '../lib/dates.ts'
import { animalFromToken, animalShortLabel, findAnimal, newId, upsertAnimal } from '../lib/ids.ts'
import { useBook } from '../store.tsx'
import type { CullRecord, RecordBook } from '../types.ts'

export function CullsPage() {
  const { book, replaceBook, removeCull } = useBook()
  const [editing, setEditing] = useState<CullRecord | null>(null)
  const page111 = book.culls.filter((c) => c.page === 111)
  const others = book.culls.filter((c) => c.page !== 111)

  return (
    <>
      <h2 className="page-title">Cull list</h2>
      <p className="lede">
        Same grid as Sale Record, with the reason written across the row. Circled IDs and a leading
        × are kept as marks. 412 is listed with two death dates: 7/16/26 on p111 and 3/10/26 on
        pasture p83.
      </p>
      <p>
        <button
          className="btn"
          type="button"
          onClick={() =>
            setEditing({
              id: newId('cull'),
              year: book.year,
              source: '2026 CULL LIST',
              page: 111,
              animalId: '',
              reason: '',
            })
          }
        >
          Add cull
        </button>
      </p>
      {editing && (
        <CullForm
          record={toFormCull(editing, book)}
          onCancel={() => setEditing(null)}
          onSave={(form) => {
            const animal = animalFromToken(form.animalId)
            const dam = form.damId ? animalFromToken(form.damId) : undefined
            let animals = upsertAnimal(book.animals, animal)
            if (dam) animals = upsertAnimal(animals, dam)
            replaceBook({
              ...book,
              animals,
              culls: upsertById(book.culls, {
                ...form,
                animalId: animal.id,
                damId: dam?.id,
              }),
            })
            setEditing(null)
          }}
        />
      )}
      <h3>2026 cull list · p111</h3>
      <CullTable rows={page111} onEdit={setEditing} onDelete={removeCull} />
      {others.length > 0 && (
        <>
          <h3>Other cull notes</h3>
          <CullTable rows={others} onEdit={setEditing} onDelete={removeCull} />
        </>
      )}
    </>
  )
}

function CullTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: CullRecord[]
  onEdit: (row: CullRecord) => void
  onDelete: (id: string) => void
}) {
  const { book } = useBook()
  return (
    <div className="table-wrap">
      <table className="ledger">
        <thead>
          <tr>
            <th>I.D.</th>
            <th>Marks</th>
            <th>Reason</th>
            <th>Dam</th>
            <th>Died</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const animal = findAnimal(book.animals, row.animalId)
            const dam = row.damId ? findAnimal(book.animals, row.damId) : undefined
            return (
              <tr key={row.id}>
                <td>
                  {animal ? (
                    <AnimalChip animal={animal} circled={row.circled} markedX={row.markedX} />
                  ) : (
                    row.animalId
                  )}
                </td>
                <td>
                  {row.circled ? 'circled ' : ''}
                  {row.markedX ? '× ' : ''}
                  {row.recovered ? <span className="badge ok">ok now</span> : ''}
                </td>
                <td>{row.reason}</td>
                <td>{dam ? <AnimalChip animal={dam} /> : row.damId ?? '—'}</td>
                <td>{formatDisplayDate(row.diedOn)}</td>
                <td className="row-actions">
                  <button className="btn secondary" type="button" onClick={() => onEdit(row)}>
                    Edit
                  </button>
                  <button className="btn danger" type="button" onClick={() => onDelete(row.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function toFormCull(row: CullRecord, book: RecordBook): CullRecord {
  const animal = findAnimal(book.animals, row.animalId)
  const dam = row.damId ? findAnimal(book.animals, row.damId) : undefined
  return {
    ...row,
    animalId: animal ? animalShortLabel(animal) : row.animalId,
    damId: dam ? animalShortLabel(dam) : row.damId,
  }
}

function CullForm({
  record,
  onSave,
  onCancel,
}: {
  record: CullRecord
  onSave: (record: CullRecord) => void
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
          Animal I.D.
          <input
            required
            value={draft.animalId}
            onChange={(event) => setDraft({ ...draft, animalId: event.target.value })}
          />
        </label>
        <label className="field">
          Reason
          <input value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} />
        </label>
        <label className="field">
          Dam
          <input
            value={draft.damId ?? ''}
            onChange={(event) => setDraft({ ...draft, damId: event.target.value || undefined })}
          />
        </label>
        <label className="field">
          Died
          <input
            type="date"
            value={draft.diedOn ?? ''}
            onChange={(event) => setDraft({ ...draft, diedOn: event.target.value || undefined })}
          />
        </label>
        <label className="field">
          Circled
          <select
            value={draft.circled ? 'yes' : 'no'}
            onChange={(event) => setDraft({ ...draft, circled: event.target.value === 'yes' })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
        <label className="field">
          Leading ×
          <select
            value={draft.markedX ? 'yes' : 'no'}
            onChange={(event) => setDraft({ ...draft, markedX: event.target.value === 'yes' })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
        <label className="field">
          Ok now
          <select
            value={draft.recovered ? 'yes' : 'no'}
            onChange={(event) => setDraft({ ...draft, recovered: event.target.value === 'yes' })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
      </div>
      <div className="row-actions">
        <button className="btn" type="submit">
          Save cull
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
