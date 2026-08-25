import type { Animal, AnimalStatus, RecordBook } from '../types.ts'

export function animalStatus(book: RecordBook, animalId: string): AnimalStatus {
  const culls = book.culls.filter((c) => c.animalId === animalId)
  if (culls.some((c) => c.diedOn)) return 'dead'
  if (book.sales.some((s) => s.calfId === animalId)) return 'sold'
  if (culls.some((c) => !c.recovered)) return 'culled'
  if (book.cowCalf.some((r) => r.cowId === animalId && r.open)) return 'open'
  return 'active'
}

export function statusLabel(status: AnimalStatus): string {
  switch (status) {
    case 'dead':
      return 'Died'
    case 'sold':
      return 'Sold'
    case 'culled':
      return 'Cull'
    case 'open':
      return 'Open'
    default:
      return 'In herd'
  }
}

export function fallbackAnimal(id: string): Animal {
  return { id, number: id }
}
