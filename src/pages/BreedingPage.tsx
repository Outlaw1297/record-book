import { useState } from 'react'
import { AnimalChip } from '../components/AnimalChip.tsx'
import { dueDateFromService, formatDisplayDate } from '../lib/dates.ts'
import { animalFromToken, animalShortLabel, findAnimal, newId, upsertAnimal } from '../lib/ids.ts'
import { useBook } from '../store.tsx'
import type { BreedingRecord, RecordBook, ServiceEntry } from '../types.ts'

const empty = (year: number): BreedingRecord => ({
  id: newId('br'),
  year,
  group: `${year} Heifers Due`,
  cowId: '',
})

export function BreedingPage() {
  const { book, replaceBook, removeBreeding } = useBook()
  const [editing, setEditing] = useState<BreedingRecord | null>(null)

  return (
    <>
      <h2 className="page-title">Breeding Record — {book.year}</h2>
      <p className="lede">
        A.I. 1st and 2nd service, then pasture service. Due dates are service date + 283 days.
        {book.breeding.length} head on the 2026 heifers-due page.
      </p>
      <p>
        <button className="btn" type="button" onClick={() => setEditing(empty(book.year))}>
          Add breeding row
        </button>
      </p>
      {editing && (
        <BreedingForm
          record={toFormRecord(editing, book)}
          onCancel={() => setEditing(null)}
          onSave={(form) => {
            const cow = animalFromToken(form.cowId)
            replaceBook({
              ...book,
              animals: upsertAnimal(book.animals, cow),
              breeding: upsertById(book.breeding, { ...form, cowId: cow.id }),
            })
            setEditing(null)
          }}
        />
      )}
      <div className="table-wrap">
        <table className="ledger">
          <thead>
            <tr>
              <th>Cow I.D.</th>
              <th colSpan={3}>A.I. 1st service</th>
              <th colSpan={2}>A.I. 2nd service</th>
              <th colSpan={2}>Pasture service</th>
              <th></th>
            </tr>
            <tr>
              <th></th>
              <th>Sire</th>
              <th>Date</th>
              <th>Due</th>
              <th>Sire</th>
              <th>Date / due</th>
              <th>Sire</th>
              <th>Date / due</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {book.breeding.map((row) => {
              const cow = findAnimal(book.animals, row.cowId)
              return (
                <tr key={row.id}>
                  <td>{cow ? <AnimalChip animal={cow} /> : row.cowId}</td>
                  <td>{row.ai1?.sire}</td>
                  <td>{formatDisplayDate(row.ai1?.date)}</td>
                  <td className="due">
                    {row.ai1?.date ? formatDisplayDate(dueDateFromService(row.ai1.date)) : ''}
                  </td>
                  <td>
                    {row.ai2?.sire}
                    {row.ai2?.notes ? ` (${row.ai2.notes})` : ''}
                  </td>
                  <td>
                    {formatDisplayDate(row.ai2?.date)}
                    {row.ai2?.date ? (
                      <div className="muted due">{formatDisplayDate(dueDateFromService(row.ai2.date))}</div>
                    ) : null}
                  </td>
                  <td>
                    {row.pasture?.sire}
                    {row.pasture?.notes ? ` · ${row.pasture.notes}` : ''}
                  </td>
                  <td>
                    {formatDisplayDate(row.pasture?.date)}
                    {row.pasture?.date ? (
                      <div className="muted due">
                        {formatDisplayDate(dueDateFromService(row.pasture.date))}
                      </div>
                    ) : null}
                  </td>
                  <td className="row-actions">
                    <button className="btn secondary" type="button" onClick={() => setEditing(row)}>
                      Edit
                    </button>
                    <button className="btn danger" type="button" onClick={() => removeBreeding(row.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function toFormRecord(row: BreedingRecord, book: RecordBook): BreedingRecord {
  const cow = findAnimal(book.animals, row.cowId)
  return { ...row, cowId: cow ? animalShortLabel(cow) : row.cowId }
}

function BreedingForm({
  record,
  onSave,
  onCancel,
}: {
  record: BreedingRecord
  onSave: (record: BreedingRecord) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(record)
  const setService = (key: 'ai1' | 'ai2' | 'pasture', patch: Partial<ServiceEntry>) => {
    const current = draft[key] ?? { sire: '', date: '' }
    setDraft({ ...draft, [key]: { ...current, ...patch } })
  }
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
          Cow I.D.
          <input
            required
            value={draft.cowId}
            onChange={(event) => setDraft({ ...draft, cowId: event.target.value })}
            placeholder="BLK 455org"
          />
        </label>
        <label className="field">
          Group
          <input value={draft.group} onChange={(event) => setDraft({ ...draft, group: event.target.value })} />
        </label>
        <label className="field">
          1st sire
          <input value={draft.ai1?.sire ?? ''} onChange={(event) => setService('ai1', { sire: event.target.value })} />
        </label>
        <label className="field">
          1st date
          <input
            type="date"
            value={draft.ai1?.date ?? ''}
            onChange={(event) => setService('ai1', { date: event.target.value })}
          />
        </label>
        <label className="field">
          2nd sire
          <input value={draft.ai2?.sire ?? ''} onChange={(event) => setService('ai2', { sire: event.target.value })} />
        </label>
        <label className="field">
          2nd date
          <input
            type="date"
            value={draft.ai2?.date ?? ''}
            onChange={(event) => setService('ai2', { date: event.target.value })}
          />
        </label>
        <label className="field">
          Pasture sire
          <input
            value={draft.pasture?.sire ?? ''}
            onChange={(event) => setService('pasture', { sire: event.target.value })}
          />
        </label>
        <label className="field">
          Pasture date
          <input
            type="date"
            value={draft.pasture?.date ?? ''}
            onChange={(event) => setService('pasture', { date: event.target.value })}
          />
        </label>
        <label className="field span-2">
          Notes
          <input value={draft.notes ?? ''} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        </label>
      </div>
      {draft.ai1?.date && (
        <p className="due">Due from 1st AI: {formatDisplayDate(dueDateFromService(draft.ai1.date))}</p>
      )}
      <div className="row-actions">
        <button className="btn" type="submit">
          Save row
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
