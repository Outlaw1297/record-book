import { useEffect, useState } from 'react'
import { Layout } from './components/Layout.tsx'
import { parseHash } from './lib/routes.ts'
import type { Route } from './types.ts'
import { BookProvider } from './store.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { HerdPage } from './pages/HerdPage.tsx'
import { AnimalPage } from './pages/AnimalPage.tsx'
import { CowCalfPage } from './pages/CowCalfPage.tsx'
import { BreedingPage } from './pages/BreedingPage.tsx'
import { PasturePage } from './pages/PasturePage.tsx'
import { CullsPage } from './pages/CullsPage.tsx'
import { SalesPage } from './pages/SalesPage.tsx'
import { GestationPage } from './pages/GestationPage.tsx'

export default function App() {
  return (
    <BookProvider>
      <RoutedApp />
    </BookProvider>
  )
}

function RoutedApp() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    if (!window.location.hash) window.location.hash = '#/'
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <Layout route={route}>
      <Page route={route} />
    </Layout>
  )
}

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case 'herd':
      return <HerdPage />
    case 'animal':
      return <AnimalPage animalId={route.animalId ?? ''} />
    case 'cow-calf':
      return <CowCalfPage />
    case 'breeding':
      return <BreedingPage />
    case 'pasture':
      return <PasturePage />
    case 'culls':
      return <CullsPage />
    case 'sales':
      return <SalesPage />
    case 'gestation':
      return <GestationPage />
    default:
      return <HomePage />
  }
}
