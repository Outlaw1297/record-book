export const TAG_COLORS = {
  yellow: { code: 'y', label: 'Yellow', hex: '#e6c229', ink: '#3d3208' },
  white: { code: 'w', label: 'White', hex: '#f7f3e8', ink: '#3a3428' },
  green: { code: 'g', label: 'Green', hex: '#2f7d32', ink: '#f4f1e8' },
  pink: { code: 'pk', label: 'Pink', hex: '#e07aa5', ink: '#3a1424' },
  teal: { code: 'teal', label: 'Teal', hex: '#1f8a7a', ink: '#f4f1e8' },
  purple: { code: 'purple', label: 'Purple', hex: '#6b3fa0', ink: '#f4f1e8' },
  orange: { code: 'org', label: 'Orange', hex: '#e07a2f', ink: '#3a220c' },
  blue: { code: 'blue', label: 'Blue', hex: '#2c5aa0', ink: '#f4f1e8' },
} as const

export type TagColor = keyof typeof TAG_COLORS

export const BREEDS = ['BLK', 'BWF', 'BBF', 'RWF', 'Red', 'BHFD'] as const
export type Breed = (typeof BREEDS)[number]

export type Sex = 'M' | 'F'
export type AnimalStatus = 'active' | 'open' | 'culled' | 'sold' | 'dead'
export type ListingKind = 'cows' | 'bulls' | 'culls'

export interface Animal {
  id: string
  number: string
  tagColor?: TagColor
  breed?: string
  name?: string
  sex?: Sex
}

export interface CowCalfRecord {
  id: string
  page?: number
  year: number
  calfId?: string
  cowId: string
  sireId?: string
  sex?: Sex
  calvingDate?: string
  birthWeight?: number
  calvingEase?: number
  remarks?: string
  open?: boolean
}

export interface ServiceEntry {
  sire: string
  date: string
  notes?: string
}

export interface BreedingRecord {
  id: string
  year: number
  group: string
  cowId: string
  ai1?: ServiceEntry
  ai2?: ServiceEntry
  pasture?: ServiceEntry
  notes?: string
}

export interface PastureMember {
  animalId: string
  notes?: string
  epd?: number
  circled?: boolean
}

export interface PastureExposure {
  id: string
  page?: number
  year: number
  pasture: string
  dateIn?: string
  dateOut?: string
  bullNote?: string
  listingTitle?: string
  listingKind: ListingKind
  members: PastureMember[]
  notes?: string
}

export interface CullRecord {
  id: string
  year: number
  source: string
  page?: number
  animalId: string
  reason: string
  circled?: boolean
  markedX?: boolean
  diedOn?: string
  damId?: string
  recovered?: boolean
}

export interface SaleRecord {
  id: string
  year: number
  calfId: string
  sex?: Sex
  soldTo: string
  date?: string
  price?: number
}

export interface RecordBook {
  version: 1
  year: number
  animals: Animal[]
  cowCalf: CowCalfRecord[]
  breeding: BreedingRecord[]
  pastures: PastureExposure[]
  culls: CullRecord[]
  sales: SaleRecord[]
}

export type PageName =
  | 'home'
  | 'herd'
  | 'animal'
  | 'cow-calf'
  | 'breeding'
  | 'pasture'
  | 'culls'
  | 'sales'
  | 'gestation'

export interface Route {
  page: PageName
  animalId?: string
}
