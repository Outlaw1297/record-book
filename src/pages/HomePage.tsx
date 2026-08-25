import { AnimalChip, StatusBadge } from '../components/AnimalChip.tsx'
import { dueDateFromService, formatDisplayDate } from '../lib/dates.ts'
import { findAnimal } from '../lib/ids.ts'
import { animalStatus } from '../lib/status.ts'
import { navigate } from '../lib/routes.ts'
import { useBook } from '../store.tsx'

export function HomePage() {
  const { book } = useBook()
  const dead = book.culls.filter((c) => c.diedOn).length
  const recovered = book.culls.filter((c) => c.recovered).length
  const dueRows = book.breeding
    .map((row) => {
      const animal = findAnimal(book.animals, row.cowId)
      return {
        row,
        animal,
        firstDue: row.ai1?.date ? dueDateFromService(row.ai1.date) : undefined,
      }
    })
    .sort((a, b) => (a.firstDue ?? '').localeCompare(b.firstDue ?? ''))

  return (
    <>
      <h2 className="page-title">{book.year} record book</h2>
      <p className="lede">
        Seeded from the red spiral AHA Cow Herd Breeding and Calving Record Book pages you
        photographed. Add, edit, or back up anything that was hard to read.
      </p>
      <div className="stats">
        <div className="stat">
          <b>{book.animals.length}</b>
          <span>Animals in the book</span>
        </div>
        <div className="stat">
          <b>{book.breeding.length}</b>
          <span>Heifers / breeding rows</span>
        </div>
        <div className="stat">
          <b>{book.cowCalf.filter((r) => !r.open).length}</b>
          <span>Calves on p16</span>
        </div>
        <div className="stat">
          <b>{book.culls.filter((c) => c.page === 111).length}</b>
          <span>2026 cull list</span>
        </div>
        <div className="stat">
          <b>{dead}</b>
          <span>Deaths noted</span>
        </div>
        <div className="stat">
          <b>{recovered}</b>
          <span>Culls marked ok now</span>
        </div>
      </div>
      <div className="grid-2">
        <section className="card">
          <h3>Heifers due (1st AI + 283)</h3>
          <p className="muted">
            April 2026 services calve mid-January 2027. Last pasture/AI service due dates are on
            the Breeding page.
          </p>
          <div className="table-wrap">
            <table className="ledger" style={{ minWidth: 420 }}>
              <thead>
                <tr>
                  <th>Cow</th>
                  <th>1st AI</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {dueRows.map(({ row, animal, firstDue }) => (
                  <tr key={row.id}>
                    <td>{animal ? <AnimalChip animal={animal} /> : row.cowId}</td>
                    <td>{formatDisplayDate(row.ai1?.date)}</td>
                    <td className="due">{formatDisplayDate(firstDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <h3>Watch list</h3>
          <WatchList />
          <p>
            <button className="btn" type="button" onClick={() => navigate({ page: 'culls' })}>
              Open cull list
            </button>
          </p>
        </section>
      </div>
    </>
  )
}

function WatchList() {
  const { book } = useBook()
  const rows = book.culls
    .filter((c) => c.page === 111)
    .slice(0, 8)
    .map((cull) => ({
      cull,
      animal: findAnimal(book.animals, cull.animalId),
      status: animalStatus(book, cull.animalId),
    }))

  return (
    <ul style={{ paddingLeft: 18 }}>
      {rows.map(({ cull, animal, status }) => (
        <li key={cull.id} style={{ marginBottom: 8 }}>
          {animal ? <AnimalChip animal={animal} circled={cull.circled} markedX={cull.markedX} /> : cull.animalId}{' '}
          <StatusBadge status={status} /> {cull.reason}
          {cull.recovered ? <span className="badge ok">ok now</span> : null}
        </li>
      ))}
    </ul>
  )
}
