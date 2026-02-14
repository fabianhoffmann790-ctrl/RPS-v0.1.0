import { useEffect, useMemo, useState } from 'react'
import DashboardPage from './pages/DashboardPage'
import ExportImportPage from './pages/ExportImportPage'
import HistoriePage from './pages/HistoriePage'
import StammdatenPage from './pages/StammdatenPage'
import { useAppStore } from './store/appStore'

type RoutePath = '/' | '/stammdaten' | '/historie' | '/export-import'

const navItems: { to: RoutePath; label: string }[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/stammdaten', label: 'Stammdaten' },
  { to: '/historie', label: 'Historie' },
  { to: '/export-import', label: 'Export-Import' },
]

const allowedPaths = new Set<RoutePath>(navItems.map((item) => item.to))

const normalizePath = (value: string): RoutePath => {
  return allowedPaths.has(value as RoutePath) ? (value as RoutePath) : '/'
}

function App() {
  const [path, setPath] = useState<RoutePath>(() => normalizePath(window.location.pathname))
  const {
    state: {
      meta: { lastError },
    },
    clearError,
  } = useAppStore()

  useEffect(() => {
    const onPopState = () => {
      setPath(normalizePath(window.location.pathname))
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = (to: RoutePath) => {
    if (to === path) return
    window.history.pushState({}, '', to)
    setPath(to)
  }

  const page = useMemo(() => {
    switch (path) {
      case '/stammdaten':
        return <StammdatenPage />
      case '/historie':
        return <HistoriePage />
      case '/export-import':
        return <ExportImportPage />
      case '/':
      default:
        return <DashboardPage />
    }
  }, [path])

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="border-b border-slate-700 bg-slate-800/90 px-6 py-4">
        <nav className="flex flex-wrap items-center gap-3" aria-label="Hauptnavigation">
          {navItems.map((item) => (
            <button
              key={item.to}
              type="button"
              onClick={() => navigate(item.to)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold uppercase tracking-wide transition ${
                path === item.to
                  ? 'bg-cyan-500 text-slate-900'
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6 md:p-8">
        {lastError ? (
          <div className="rounded-lg border border-red-500 bg-red-950/60 px-4 py-3 text-sm">
            <div className="flex items-start justify-between gap-4">
              <p>Aktion blockiert: {lastError}</p>
              <button className="text-xs font-semibold" onClick={clearError} type="button">
                Schließen
              </button>
            </div>
          </div>
        ) : null}
        {page}
      </main>
    </div>
  )
}

export default App
