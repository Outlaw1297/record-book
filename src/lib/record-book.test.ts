import { describe, expect, it } from 'vitest'
import { dueDateFromService, parseISODate } from './dates.ts'
import { animalFromToken, parseAnimalToken } from './ids.ts'
import { gestationTable } from './gestation.ts'
import { seedBook } from '../data/seed.ts'

describe('gestation', () => {
  it('adds 283 days from January 1 to October 11 (paper table)', () => {
    expect(dueDateFromService('2026-01-01')).toBe('2026-10-11')
  })

  it('adds 283 days from April 2 2026 to January 10 2027', () => {
    expect(dueDateFromService('2026-04-02')).toBe('2027-01-10')
  })

  it('uses local calendar dates, not UTC', () => {
    const date = parseISODate('2026-07-19')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(6)
    expect(date.getDate()).toBe(19)
  })

  it('builds a JAN→OCT table matching the notebook header rule', () => {
    const table = gestationTable(2026, false)
    const jan = table[0]!
    expect(jan.days[0]).toEqual({ serviceDay: 1, dueDay: 11, dueMonth: 9 })
    expect(jan.days[20]).toEqual({ serviceDay: 21, dueDay: 31, dueMonth: 9 })
    expect(jan.days[21]).toEqual({ serviceDay: 22, dueDay: 1, dueMonth: 10 })
  })
})

describe('animal ids', () => {
  it('parses number + single-letter tag color', () => {
    expect(parseAnimalToken('242y')).toMatchObject({
      number: '242',
      tagColor: 'yellow',
    })
    expect(animalFromToken('242y').id).toBe('242-yellow')
  })

  it('parses breed + number + color word/code', () => {
    expect(animalFromToken('BLK 455org')).toMatchObject({
      id: '455-orange',
      number: '455',
      tagColor: 'orange',
      breed: 'BLK',
    })
    expect(animalFromToken('BWF 400pk').id).toBe('400-pink')
    expect(animalFromToken('BWF 48blue').id).toBe('48-blue')
  })

  it('reads circled and leading x marks', () => {
    expect(parseAnimalToken('(412)')).toMatchObject({ circled: true, number: '412' })
    expect(parseAnimalToken('x 227w')).toMatchObject({
      markedX: true,
      number: '227',
      tagColor: 'white',
    })
  })
})

describe('notebook seed', () => {
  it('links every record to a known animal id', () => {
    const ids = new Set(seedBook.animals.map((a) => a.id))
    const missing: string[] = []
    for (const row of seedBook.cowCalf) {
      if (row.cowId && !ids.has(row.cowId) && !['open'].includes(row.cowId)) missing.push(row.cowId)
      if (row.calfId && !ids.has(row.calfId)) missing.push(`calf:${row.calfId}`)
    }
    for (const row of seedBook.breeding) {
      if (!ids.has(row.cowId)) missing.push(row.cowId)
    }
    for (const pasture of seedBook.pastures) {
      for (const member of pasture.members) {
        if (!ids.has(member.animalId)) missing.push(member.animalId)
      }
    }
    for (const cull of seedBook.culls) {
      if (!ids.has(cull.animalId)) missing.push(cull.animalId)
    }
    expect(missing).toEqual([])
  })

  it('has 14 heifers on the 2026 breeding page and the p111 cull list', () => {
    expect(seedBook.breeding.filter((r) => r.group === '2026 Heifers Due')).toHaveLength(14)
    expect(seedBook.culls.filter((c) => c.page === 111)).toHaveLength(23)
  })
})
