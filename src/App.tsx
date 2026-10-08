import {
  BarChart3,
  Brain,
  CalendarDays,
  LayoutDashboard,
  Library,
  Settings as SettingsIcon,
  Timer,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useRoute } from './lib/router'
import { useStore } from './lib/store'
import { upcomingExams } from './lib/planner'
import { cx, daysUntil } from './lib/utils'
import { Dashboard } from './pages/Dashboard'
import { Study } from './pages/Study'
import { Simulator } from './pages/Simulator'
import { Exams } from './pages/Exams'
import { Bank } from './pages/Bank'
import { Stats } from './pages/Stats'
import { SettingsPage } from './pages/Settings'
import { PRIORITY_META } from './components/ui'

const NAV: { path: string; label: string; icon: ReactNode }[] = [
  { path: '/', label: 'Inicio', icon: <LayoutDashboard size={18} /> },
  { path: '/estudiar', label: 'Estudiar', icon: <Brain size={18} /> },
  { path: '/simulacro', label: 'Simulacro', icon: <Timer size={18} /> },
  { path: '/examenes', label: 'Exámenes', icon: <CalendarDays size={18} /> },
  { path: '/banco', label: 'Banco', icon: <Library size={18} /> },
  { path: '/estadisticas', label: 'Estadísticas', icon: <BarChart3 size={18} /> },
  { path: '/ajustes', label: 'Ajustes', icon: <SettingsIcon size={18} /> },
]

export default function App() {
  const hydrated = useStore((s) => s.hydrated)
  const route = useRoute()

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
      </div>
    )
  }

  let page: ReactNode
  switch (route.path) {
    case '/estudiar':
      page = <Study params={route.params} />
      break
    case '/simulacro':
      page = <Simulator params={route.params} />
      break
    case '/examenes':
      page = <Exams />
      break
    case '/banco':
      page = <Bank />
      break
    case '/estadisticas':
      page = <Stats />
      break
    case '/ajustes':
      page = <SettingsPage />
      break
    default:
      page = <Dashboard />
  }

  return (
    <div className="flex min-h-full">
      <Sidebar active={route.path} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav active={route.path} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-10" key={route.path}>
          {page}
        </main>
      </div>
    </div>
  )
}

function Sidebar({ active }: { active: string }) {
  const exams = useStore((s) => s.exams)
  const next = upcomingExams(exams).slice(0, 3)
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-white/70 px-4 py-6 backdrop-blur md:flex">
      <a href="#/" className="mb-8 flex items-center gap-2.5 px-2">
        <img src="./favicon.svg" alt="" className="h-8 w-8" />
        <div>
          <div className="text-[15px] font-semibold leading-tight">MedSimulator</div>
          <div className="text-[11px] text-ink-3">Simuladores de examen</div>
        </div>
      </a>
      <nav className="space-y-1">
        {NAV.map((n) => (
          <a
            key={n.path}
            href={`#${n.path}`}
            className={cx(
              'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
              active === n.path ? 'bg-brand-50 text-brand-700' : 'text-ink-2 hover:bg-slate-100 hover:text-ink',
            )}
          >
            {n.icon}
            {n.label}
          </a>
        ))}
      </nav>
      {next.length > 0 && (
        <div className="mt-auto">
          <div className="mb-2 px-2 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Próximos exámenes</div>
          <div className="space-y-1.5">
            {next.map((e) => {
              const d = daysUntil(e.date)
              return (
                <a key={e.id} href="#/examenes" className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-slate-100">
                  <span className={cx('h-2 w-2 shrink-0 rounded-full', PRIORITY_META[e.priority].dot)} />
                  <span className="truncate text-ink-2">{e.name}</span>
                  <span className="ml-auto shrink-0 text-xs font-semibold text-ink tnum">{d === 0 ? 'Hoy' : `${d} d`}</span>
                </a>
              )
            })}
          </div>
        </div>
      )}
    </aside>
  )
}

function MobileNav({ active }: { active: string }) {
  return (
    <div className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-line bg-white/90 px-3 py-2 backdrop-blur md:hidden">
      {NAV.map((n) => (
        <a
          key={n.path}
          href={`#${n.path}`}
          className={cx(
            'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium',
            active === n.path ? 'bg-brand-50 text-brand-700' : 'text-ink-2',
          )}
        >
          {n.icon}
          {n.label}
        </a>
      ))}
    </div>
  )
}
