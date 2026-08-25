import type { RecordBook } from '../types.ts'
import { seedBook } from '../data/seed.ts'

export const STORAGE_KEY = 'hereford-record-book:v1'

export function loadBook(): RecordBook {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(seedBook)
    const parsed = JSON.parse(raw) as RecordBook
    if (parsed.version !== 1 || !Array.isArray(parsed.animals)) {
      return structuredClone(seedBook)
    }
    return parsed
  } catch {
    return structuredClone(seedBook)
  }
}

export function saveBook(book: RecordBook): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(book))
}

export function exportBook(book: RecordBook): string {
  return JSON.stringify(book, null, 2)
}

export function importBook(json: string): RecordBook {
  const parsed = JSON.parse(json) as RecordBook
  if (parsed.version !== 1 || !Array.isArray(parsed.animals)) {
    throw new Error('This file is not a record-book backup.')
  }
  return parsed
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
