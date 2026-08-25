import { BREEDS, TAG_COLORS, type Animal, type TagColor } from '../types.ts'

const COLOR_ALIASES: Record<string, TagColor> = {
  y: 'yellow',
  yellow: 'yellow',
  w: 'white',
  white: 'white',
  g: 'green',
  green: 'green',
  pk: 'pink',
  pink: 'pink',
  k: 'pink',
  teal: 'teal',
  purple: 'purple',
  pur: 'purple',
  purp: 'purple',
  org: 'orange',
  orange: 'orange',
  blue: 'blue',
  by: 'yellow',
}

const BREED_SET = new Set(BREEDS.map((b) => b.toUpperCase()))

export interface ParsedAnimalToken {
  number: string
  tagColor?: TagColor
  breed?: string
  name?: string
  circled: boolean
  markedX: boolean
}

export function animalIdFromParts(number: string, tagColor?: TagColor, name?: string): string {
  const n = number.trim().toLowerCase().replace(/\s+/g, '-')
  if (tagColor) return `${n}-${tagColor}`
  if (name) {
    const nm = name.trim().toLowerCase().replace(/\s+/g, '-')
    if (nm !== n) return `${n}-${nm}`
  }
  return n
}

export function parseAnimalToken(raw: string): ParsedAnimalToken {
  const circled = /\(.*\)/.test(raw)
  const markedX = /^\s*x\b/i.test(raw.trim())
  let text = raw
    .trim()
    .replace(/^\s*x\s+/i, '')
    .replace(/[()]/g, '')
    .trim()

  let breed: string | undefined
  const tokens = text.split(/\s+/)
  if (tokens[0] && BREED_SET.has(tokens[0].toUpperCase())) {
    const match = BREEDS.find((b) => b.toUpperCase() === tokens[0]!.toUpperCase())
    breed = match ?? tokens[0]!.toUpperCase()
    tokens.shift()
    text = tokens.join(' ')
  }

  const colorMatch = text.match(
    /^(.*?)\s*(yellow|white|green|pink|teal|purple|purp|pur|orange|org|blue|pk|by|[ywg])$/i,
  )
  if (colorMatch) {
    const number = colorMatch[1]!.trim()
    const colorKey = colorMatch[2]!.toLowerCase()
    const tagColor = COLOR_ALIASES[colorKey]
    return { number, tagColor, breed, circled, markedX }
  }

  const glued = text.match(/^(\d+[A-Za-z]?)(yellow|white|green|pink|teal|purple|purp|org|blue|pk|by|[ywg])$/i)
  if (glued) {
    return {
      number: glued[1]!,
      tagColor: COLOR_ALIASES[glued[2]!.toLowerCase()],
      breed,
      circled,
      markedX,
    }
  }

  if (/^[A-Za-z][A-Za-z\s'-]*$/.test(text) && !/\d/.test(text)) {
    return { number: text, name: text, breed, circled, markedX }
  }

  return { number: text, breed, circled, markedX }
}

export function parsedToAnimal(parsed: ParsedAnimalToken): Animal {
  return {
    id: animalIdFromParts(parsed.number, parsed.tagColor, parsed.name),
    number: parsed.number,
    tagColor: parsed.tagColor,
    breed: parsed.breed,
    name: parsed.name,
  }
}

export function animalFromToken(raw: string): Animal {
  return parsedToAnimal(parseAnimalToken(raw))
}

export function colorLabel(color?: TagColor): string {
  return color ? TAG_COLORS[color].label : ''
}

export function animalLabel(animal: Animal): string {
  const colorCode = animal.tagColor ? TAG_COLORS[animal.tagColor].code : ''
  const glued = colorCode.length <= 1
  const idPart = colorCode ? `${animal.number}${glued ? '' : ' '}${colorCode}` : animal.number
  const name = animal.name && animal.name.toLowerCase() !== animal.number.toLowerCase() ? ` ${animal.name}` : ''
  const breed = animal.breed ? `${animal.breed} ` : ''
  return `${breed}${idPart}${name}`.trim()
}

export function animalShortLabel(animal: Animal): string {
  const color = animal.tagColor ? TAG_COLORS[animal.tagColor].code : ''
  const spacer = color.length > 1 ? ' ' : ''
  return `${animal.number}${spacer}${color}`.trim()
}

export function findAnimal(animals: Animal[], id: string): Animal | undefined {
  return animals.find((a) => a.id === id)
}

export function upsertAnimal(animals: Animal[], incoming: Animal): Animal[] {
  const existing = animals.find((a) => a.id === incoming.id)
  if (!existing) return [...animals, incoming]
  const merged: Animal = {
    ...existing,
    ...incoming,
    breed: incoming.breed ?? existing.breed,
    name: incoming.name ?? existing.name,
    sex: incoming.sex ?? existing.sex,
    tagColor: incoming.tagColor ?? existing.tagColor,
  }
  return animals.map((a) => (a.id === incoming.id ? merged : a))
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}
