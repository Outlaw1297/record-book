import { dueDateFromService } from './dates.ts'

export { dueDateFromService }

export function gestationTable(serviceYear: number, leapFebruary = false) {
  const rows: {
    serviceMonth: number
    dueMonth: number
    days: { serviceDay: number; dueDay: number; dueMonth: number }[]
  }[] = []

  for (let month = 0; month < 12; month++) {
    const daysInService = daysForMonth(month, leapFebruary)
    const days: { serviceDay: number; dueDay: number; dueMonth: number }[] = []
    for (let day = 1; day <= daysInService; day++) {
      const iso = `${serviceYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const due = dueDateFromService(iso)
      const [, dm, dd] = due.split('-').map(Number)
      days.push({ serviceDay: day, dueDay: dd!, dueMonth: dm! - 1 })
    }
    const dueMonth = days[0]?.dueMonth ?? (month + 9) % 12
    rows.push({ serviceMonth: month, dueMonth, days })
  }

  return rows
}

function daysForMonth(month: number, leapFebruary: boolean): number {
  const lengths = [31, leapFebruary ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return lengths[month]!
}
