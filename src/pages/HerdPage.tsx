import { useMemo, useState } from 'react'
import { AnimalChip, StatusBadge } from '../components/AnimalChip.tsx'
import { animalLabel, animalFromToken } from '../lib/ids.ts'
import { animalStatus } from '../lib/status.ts'
import { useBook } from '../store.tsx'
import { TAG_COLORS } from '../types.ts'

export function HerdPage() {
  const { book, upsertAnAnimal } = useBook()
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return book.animals
      .map((animal) => ({ animal, status: animalStatus(book, animal.id) }))
      .filter(({ animal, status }) => {
        if (!q) return true
        const hay = `${animalLabel(animal)} ${status} ${animal.id}`.toLowerCase()
        return hay.includes(q)
      })
  }, [book, query])

  return (
    <>
      <h2 className="page-title">Herd</h2>
      <p className="lede">
        IDs are number + tag color, the same way they are written in the book (242y, 528 pk, BLK
        455org). Circled and × marks live on the cull list.
      </p>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search number, color, breed, name…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim()) return
            upsertAnAnimal(animalFromToken(draft))
            setDraft('')
          }}
        >
          <input
            type="text"
            placeholder="Add ID, e.g. BWF 410w"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />{' '}
          <button className="btn" type="submit">
            Add animal
          </button>
        </form>
      </div>
      <div className="table-wrap">
        <table className="ledger">
          <thead>
            <tr>
              <th>I.D.</th>
              <th>Breed</th>
              <th>Tag</th>
              <th>Sex</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ animal, status }) => (
              <tr key={animal.id}>
                <td>
                  <AnimalChip animal={animal} />
                </td>
                <td>{animal.breed ?? '—'}</td>
                <td>{animal.tagColor ? TAG_COLORS[animal.tagColor].label : '—'}</td>
                <td>{animal.sex ?? '—'}</td>
                <td>
                  <StatusBadge status={status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
