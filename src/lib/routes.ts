export type { Route } from '../types.ts'
import type { PageName, Route } from '../types.ts'

const PAGES = new Set<PageName>([
  'home',
  'herd',
  'animal',
  'cow-calf',
  'breeding',
  'pasture',
  'culls',
  'sales',
  'gestation',
])

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '').replace(/^\/+/, '')
  if (!raw) return { page: 'home' }
  const [first, second] = raw.split('/')
  if (first === 'herd' && second) return { page: 'animal', animalId: decodeURIComponent(second) }
  if (first && PAGES.has(first as PageName)) return { page: first as PageName }
  return { page: 'home' }
}

export function toHash(route: Route): string {
  if (route.page === 'home') return '#/'
  if (route.page === 'animal' && route.animalId) {
    return `#/herd/${encodeURIComponent(route.animalId)}`
  }
  return `#/${route.page}`
}

export function navigate(route: Route): void {
  const next = toHash(route)
  if (window.location.hash !== next) window.location.hash = next
}
