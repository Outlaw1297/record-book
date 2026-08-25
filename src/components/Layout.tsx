import type { ReactNode } from 'react'
import type { Route } from '../types.ts'
import { navigate } from '../lib/routes.ts'
import { useBook } from '../store.tsx'

const LINKS: { label: string; route: Route }[] = [
  { label: 'Home', route: { page: 'home' } },
  { label: 'Herd', route: { page: 'herd' } },
  { label: 'Cow-Calf', route: { page: 'cow-calf' } },
  { label: 'Breeding', route: { page: 'breeding' } },
  { label: 'Pasture', route: { page: 'pasture' } },
  { label: 'Culls', route: { page: 'culls' } },
  { label: 'Sales', route: { page: 'sales' } },
  { label: 'Gestation', route: { page: 'gestation' } },
]

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const { book, exportJson, importJson, resetToNotebook } = useBook()

  return (
    <div className="app-shell">
      <header className="masthead">
        <div className="masthead-kicker">American Hereford Association style</div>
        <h1>Cow Herd Breeding &amp; Calving Record Book</h1>
        <p>
          {book.year} herd book · due date = service + 283 days · records stay on this device
        </p>
      </header>
      <nav className="nav">
        {LINKS.map((link) => {
          const active =
            route.page === link.route.page ||
            (link.route.page === 'herd' && route.page === 'animal')
          return (
            <a
              key={link.label}
              href={link.route.page === 'home' ? '#/' : `#/${link.route.page}`}
              className={active ? 'active' : undefined}
              onClick={(event) => {
                event.preventDefault()
                navigate(link.route)
              }}
            >
              {link.label}
            </a>
          )
        })}
      </nav>
      <main className="sheet">{children}</main>
      <p className="footer-note">
        Backup:{' '}
        <button className="btn secondary" type="button" onClick={exportJson}>
          Download JSON
        </button>{' '}
        <label className="btn secondary">
          Import
          <input
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              void file.text().then((text) => {
                try {
                  importJson(text)
                } catch (error) {
                  window.alert(error instanceof Error ? error.message : 'Could not import.')
                }
              })
            }}
          />
        </label>{' '}
        <button
          className="btn secondary"
          type="button"
          onClick={() => {
            if (window.confirm('Replace all records with the 2026 notebook pages?')) {
              resetToNotebook()
            }
          }}
        >
          Restore notebook pages
        </button>
      </p>
    </div>
  )
}
