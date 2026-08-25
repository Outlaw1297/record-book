export const GESTATION_DAYS = 283

/** Parse YYYY-MM-DD as a local calendar date (no UTC shift). */
export function parseISODate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) {
    throw new Error(`Invalid date: ${value}`)
  }
  return new Date(year, month - 1, day)
}

export function formatISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDisplayDate(value?: string): string {
  if (!value) return ''
  const date = parseISODate(value)
  return date.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  })
}

export function dueDateFromService(serviceDate: string): string {
  const date = parseISODate(serviceDate)
  date.setDate(date.getDate() + GESTATION_DAYS)
  return formatISODate(date)
}

export function addDays(isoDate: string, days: number): string {
  const date = parseISODate(isoDate)
  date.setDate(date.getDate() + days)
  return formatISODate(date)
}

export function monthName(monthIndex: number): string {
  return [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ][monthIndex] ?? ''
}

export function shortMonth(monthIndex: number): string {
  return ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][
    monthIndex
  ] ?? ''
}

export function daysInMonth(monthIndex: number, year = 2026): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}
