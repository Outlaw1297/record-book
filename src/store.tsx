import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { seedBook } from './data/seed.ts'
import { downloadText, exportBook, importBook, loadBook, saveBook } from './lib/storage.ts'
import { upsertAnimal } from './lib/ids.ts'
import type {
  Animal,
  BreedingRecord,
  CowCalfRecord,
  CullRecord,
  PastureExposure,
  RecordBook,
  SaleRecord,
} from './types.ts'

interface BookContextValue {
  book: RecordBook
  replaceBook: (next: RecordBook) => void
  upsertAnAnimal: (animal: Animal) => void
  saveCowCalf: (record: CowCalfRecord) => void
  removeCowCalf: (id: string) => void
  saveBreeding: (record: BreedingRecord) => void
  removeBreeding: (id: string) => void
  savePasture: (record: PastureExposure) => void
  removePasture: (id: string) => void
  saveCull: (record: CullRecord) => void
  removeCull: (id: string) => void
  saveSale: (record: SaleRecord) => void
  removeSale: (id: string) => void
  resetToNotebook: () => void
  exportJson: () => void
  importJson: (text: string) => void
}

const BookContext = createContext<BookContextValue | null>(null)

export function BookProvider({ children }: { children: ReactNode }) {
  const [book, setBook] = useState<RecordBook>(() => loadBook())

  useEffect(() => {
    saveBook(book)
  }, [book])

  const replaceBook = useCallback((next: RecordBook) => setBook(next), [])

  const upsertAnAnimal = useCallback((animal: Animal) => {
    setBook((current) => ({ ...current, animals: upsertAnimal(current.animals, animal) }))
  }, [])

  const value = useMemo<BookContextValue>(
    () => ({
      book,
      replaceBook,
      upsertAnAnimal,
      saveCowCalf: (record) =>
        setBook((current) => ({
          ...current,
          cowCalf: upsertById(current.cowCalf, record),
        })),
      removeCowCalf: (id) =>
        setBook((current) => ({ ...current, cowCalf: current.cowCalf.filter((r) => r.id !== id) })),
      saveBreeding: (record) =>
        setBook((current) => ({
          ...current,
          breeding: upsertById(current.breeding, record),
        })),
      removeBreeding: (id) =>
        setBook((current) => ({
          ...current,
          breeding: current.breeding.filter((r) => r.id !== id),
        })),
      savePasture: (record) =>
        setBook((current) => ({
          ...current,
          pastures: upsertById(current.pastures, record),
        })),
      removePasture: (id) =>
        setBook((current) => ({
          ...current,
          pastures: current.pastures.filter((r) => r.id !== id),
        })),
      saveCull: (record) =>
        setBook((current) => ({ ...current, culls: upsertById(current.culls, record) })),
      removeCull: (id) =>
        setBook((current) => ({ ...current, culls: current.culls.filter((r) => r.id !== id) })),
      saveSale: (record) =>
        setBook((current) => ({ ...current, sales: upsertById(current.sales, record) })),
      removeSale: (id) =>
        setBook((current) => ({ ...current, sales: current.sales.filter((r) => r.id !== id) })),
      resetToNotebook: () => setBook(structuredClone(seedBook)),
      exportJson: () =>
        downloadText(`record-book-${book.year}.json`, exportBook(book)),
      importJson: (text) => setBook(importBook(text)),
    }),
    [book, replaceBook, upsertAnAnimal],
  )

  return <BookContext.Provider value={value}>{children}</BookContext.Provider>
}

function upsertById<T extends { id: string }>(list: T[], record: T): T[] {
  const index = list.findIndex((item) => item.id === record.id)
  if (index === -1) return [...list, record]
  const next = [...list]
  next[index] = record
  return next
}

export function useBook(): BookContextValue {
  const value = useContext(BookContext)
  if (!value) throw new Error('useBook must be used inside BookProvider')
  return value
}
