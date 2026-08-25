import { useState } from 'react'
import { AnimalChip } from '../components/AnimalChip.tsx'
import { formatDisplayDate } from '../lib/dates.ts'
import { animalFromToken, animalShortLabel, findAnimal, newId, upsertAnimal } from '../lib/ids.ts'
import { useBook } from '../store.tsx'
import type { CowCalfRecord, Sex } from '../types.ts'

const empty = (): CowCalfRecord => ({
  id: newId('cc'),
  year: 2026,
  cowId: '',
  page: 16,
})

export function CowCalfPage() {
  const { book, replaceBook, removeCowCalf } = useBook()
  const [editing, setEditing] = useState<CowCalfRecord | null>(null)

  return (
    <>
      <h2 className="page-title">Cow-Calf Record</h2>
      <p className="lede">
        List cows by herd I.D. number. Page 16 from the 2026 book is loaded; page 17 was blank.
      </p>
      <p>
        <button className="btn" type="button" onClick={() => setEditing(empty())}>
          Add calf row
        </button>
      </p>
      {editing && (
        <CowCalfForm
          record={editing}
          onCancel={() => setEditing(null)}
          onSave={(record) => {
            const calf = record.calfId ? animalFromToken(record.calfId) : undefined
            const cow = animalFromToken(record.cowId)
            let animals = book.animals
            animals = upsertAnimal(animals, cow)
            if (calf) animals = upsertAnimal(animals, calf)
            replaceBook({
              ...book,
              animals,
              cowCalf: upsertById(book.cowCalf, {
                ...record,
                cowId: cow.id,
                calfId: calf?.id,
              }),
            })
            setEditing(null)
          }}
        />
      )}
      <div className="table-wrap">
        <table className="ledger">
          <thead>
            <tr>
              <th>Calf I.D.</th>
              <th>Cow I.D.</th>
              <th>Bred by sire</th>
              <th>Sex</th>
              <th>Calving date</th>
              <th>Birth wt</th>
              <th>Calv EZ</th>
              <th>Remarks</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {book.cowCalf.map((row) => {
              const cow = findAnimal(book.animals, row.cowId)
              const calf = row.calfId ? findAnimal(book.animals, row.calfId) : undefined
              return (
                <tr key={row.id}>
                  <td>{calf ? <AnimalChip animal={calf} /> : '—'}</td>
                  <td>{cow ? <AnimalChip animal={cow} /> : row.cowId}</td>
                  <td>{row.sireId ?? '—'}</td>
                  <td>{row.open ? 'open' : (row.sex ?? '—')}</td>
                  <td>{formatDisplayDate(row.calvingDate)}</td>
                  <td>{row.birthWeight ?? '—'}</td>
                  <td>{row.calvingEase ?? '—'}</td>
                  <td>{row.remarks}</td>
                  <td className="row-actions">
                    <button className="btn secondary" type="button" onClick={() => setEditing(displayRecord(row, book))}>
                      Edit
                    </button>
                    <button className="btn danger" type="button" onClick={() => removeCowCalf(row.id)}>
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

function displayRecord(row: CowCalfRecord, book: { animals: import('../types.ts').Animal[] }): CowCalfRecord {
  const cow = findAnimal(book.animals, row.cowId)
  const calf = row.calfId ? findAnimal(book.animals, row.calfId) : undefined
  return {
    ...row,
    cowId: cow ? animalShortLabel(cow) : row.cowId,
    calfId: calf ? animalShortLabel(calf) : row.calfId,
  }
}

function CowCalfForm({
  record,
  onSave,
  onCancel,
}: {
  record: CowCalfRecord
  onSave: (record: CowCalfRecord) => void
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
            value={draft.calfId ?? ''}
            onChange={(event) => setDraft({ ...draft, calfId: event.target.value })}
            placeholder="67y"
          />
        </label>
        <label className="field">
          Cow I.D.
          <input
            required
            value={draft.cowId}
            onChange={(event) => setDraft({ ...draft, cowId: event.target.value })}
            placeholder="67y or Helen"
          />
        </label>
        <label className="field">
          Sire I.D.
          <input
            value={draft.sireId ?? ''}
            onChange={(event) => setDraft({ ...draft, sireId: event.target.value })}
            placeholder="5/5 or Diablo 5/5"
          />
        </label>
        <label className="field">
          Sex
          <select
            value={draft.open ? 'open' : (draft.sex ?? '')}
            onChange={(event) => {
              if (event.target.value === 'open') setDraft({ ...draft, open: true, sex: undefined })
              else setDraft({ ...draft, open: false, sex: (event.target.value || undefined) as Sex })
            }}
          >
            <option value="">Unknown</option>
            <option value="F">F</option>
            <option value="M">M</option>
            <option value="open">Open</option>
          </select>
        </label>
        <label className="field">
          Calving date
          <input
            type="date"
            value={draft.calvingDate ?? ''}
            onChange={(event) => setDraft({ ...draft, calvingDate: event.target.value || undefined })}
          />
        </label>
        <label className="field">
          Birth weight
          <input
            type="number"
            value={draft.birthWeight ?? ''}
            onChange={(event) =>
              setDraft({
                ...draft,
                birthWeight: event.target.value ? Number(event.target.value) : undefined,
              })
            }
          />
        </label>
        <label className="field">
          Calv EZ
          <input
            type="number"
            value={draft.calvingEase ?? ''}
            onChange={(event) =>
              setDraft({
                ...draft,
                calvingEase: event.target.value ? Number(event.target.value) : undefined,
              })
            }
          />
        </label>
        <label className="field span-2">
          Remarks
          <input
            value={draft.remarks ?? ''}
            onChange={(event) => setDraft({ ...draft, remarks: event.target.value })}
          />
        </label>
      </div>
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
