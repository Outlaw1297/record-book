import { AnimalChip, StatusBadge } from '../components/AnimalChip.tsx'
import { dueDateFromService, formatDisplayDate } from '../lib/dates.ts'
import { findAnimal } from '../lib/ids.ts'
import { animalStatus } from '../lib/status.ts'
import { useBook } from '../store.tsx'

export function AnimalPage({ animalId }: { animalId: string }) {
  const { book } = useBook()
  const animal = findAnimal(book.animals, animalId)
  if (!animal) {
    return (
      <>
        <h2 className="page-title">Unknown animal</h2>
        <p>No record for `{animalId}`.</p>
      </>
    )
  }

  const status = animalStatus(book, animal.id)
  const calves = book.cowCalf.filter((r) => r.cowId === animal.id || r.calfId === animal.id)
  const breedings = book.breeding.filter((r) => r.cowId === animal.id)
  const culls = book.culls.filter((r) => r.animalId === animal.id || r.damId === animal.id)
  const pastures = book.pastures.filter((p) => p.members.some((m) => m.animalId === animal.id))
  const sales = book.sales.filter((s) => s.calfId === animal.id)

  return (
    <>
      <h2 className="page-title">
        <AnimalChip animal={animal} toAnimal={false} /> {animal.breed ? animal.breed : null}
      </h2>
      <p className="lede">
        <StatusBadge status={status} /> Tag {animal.tagColor ?? 'unmarked'}
        {animal.sex ? ` · ${animal.sex}` : ''}
      </p>
      {breedings.length > 0 && (
        <section>
          <h3>Breeding</h3>
          <ul>
            {breedings.map((row) => (
              <li key={row.id}>
                {row.group}: 1st AI {row.ai1?.sire} {formatDisplayDate(row.ai1?.date)}
                {row.ai1?.date ? ` · due ${formatDisplayDate(dueDateFromService(row.ai1.date))}` : ''}
                {row.ai2 ? ` · 2nd ${row.ai2.sire} ${formatDisplayDate(row.ai2.date)}` : ''}
                {row.pasture
                  ? ` · pasture ${row.pasture.sire} ${formatDisplayDate(row.pasture.date)}`
                  : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
      {calves.length > 0 && (
        <section>
          <h3>Cow-calf</h3>
          <ul>
            {calves.map((row) => (
              <li key={row.id}>
                {row.open ? 'Open' : `${row.sex ?? ''} calf`} {formatDisplayDate(row.calvingDate)}
                {row.birthWeight ? ` · ${row.birthWeight} lb` : ''} {row.remarks}
              </li>
            ))}
          </ul>
        </section>
      )}
      {culls.length > 0 && (
        <section>
          <h3>Cull notes</h3>
          <ul>
            {culls.map((row) => (
              <li key={row.id}>
                p{row.page} {row.source}: {row.reason}
                {row.diedOn ? ` · died ${formatDisplayDate(row.diedOn)}` : ''}
                {row.recovered ? ' · ok now' : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
      {pastures.length > 0 && (
        <section>
          <h3>Pasture exposure</h3>
          <ul>
            {pastures.map((row) => (
              <li key={row.id}>
                {row.pasture} {row.listingTitle} {formatDisplayDate(row.dateIn)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {sales.length > 0 && (
        <section>
          <h3>Sales</h3>
          <ul>
            {sales.map((row) => (
              <li key={row.id}>
                {formatDisplayDate(row.date)} {row.soldTo} {row.price != null ? `$${row.price}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
