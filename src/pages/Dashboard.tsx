import { ArrowRight, Brain, CalendarPlus, Flame, Target, Timer, TrendingUp, Upload, Zap } from 'lucide-react'
import { useMemo } from 'react'
import { useStore } from '../lib/store'
import { categoryStats, dailyPlan, examPlan, questionsInScope, streak, upcomingExams, type ExamPlan } from '../lib/planner'
import { navigate } from '../lib/router'
import { DAY, formatDate, formatLongDay, pct, plural } from '../lib/utils'
import { Badge, Button, Card, Empty, PageHeader, PriorityBadge, Progress, Ring, SectionTitle, Stat } from '../components/ui'

export const STATUS_META = {
  listo: { label: 'Listo', tone: 'green' as const, color: '#10b981' },
  'en-camino': { label: 'En camino', tone: 'amber' as const, color: '#f59e0b' },
  riesgo: { label: 'En riesgo', tone: 'red' as const, color: '#f43f5e' },
  pasado: { label: 'Presentado', tone: 'slate' as const, color: '#94a3b8' },
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

export function Dashboard() {
  const s = useStore()
  const now = Date.now()
  const total = Object.keys(s.questions).length

  const plan = useMemo(() => dailyPlan(s, now), [s.questions, s.cards, s.answers, s.exams, s.settings])
  const exams = useMemo(() => upcomingExams(s.exams, now).map((e) => examPlan(s, e, now)), [s.exams, s.questions, s.cards, s.answers])
  const weak = useMemo(() => {
    const cats = categoryStats(s, questionsInScope(s), now).filter((c) => c.answered >= 3)
    return cats.sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1)).slice(0, 5)
  }, [s.questions, s.cards, s.answers])
  const week = useMemo(() => {
    const since = now - 7 * DAY
    const a = s.answers.filter((x) => x.ts >= since)
    return { n: a.length, acc: a.length ? a.filter((x) => x.correct).length / a.length : NaN }
  }, [s.answers])
  const str = useMemo(() => streak(s.answers, now), [s.answers])

  if (!total) {
    return (
      <>
        <PageHeader title={`${greeting()} 👋`} subtitle={formatLongDay(now)} />
        <Empty
          icon={<Upload size={24} />}
          title="Empieza importando tus preguntas"
          text={
            <>
              Sube un CSV con las columnas <code className="rounded bg-slate-100 px-1">pregunta, opcion_a…opcion_d, respuesta, categoria, explicacion</code>.
              Después agrega la fecha de tu examen y MedSimulator armará tu plan diario con FSRS.
            </>
          }
          action={
            <Button variant="primary" onClick={() => navigate('/banco')}>
              <Upload size={16} /> Importar CSV
            </Button>
          }
        />
      </>
    )
  }

  const todayWork = plan.dueNow + plan.newRemaining
  const goalProgress = plan.answeredToday / Math.max(1, s.settings.dailyGoal)

  return (
    <>
      <PageHeader
        title={`${greeting()} 👋`}
        subtitle={formatLongDay(now).replace(/^./, (c) => c.toUpperCase())}
        actions={
          <>
            <Button onClick={() => navigate('/examenes', { nuevo: '1' })}>
              <CalendarPlus size={16} /> Agregar examen
            </Button>
            <Button onClick={() => navigate('/simulacro')}>
              <Timer size={16} /> Simulacro
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="relative overflow-hidden p-6 lg:col-span-2">
          <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-gradient-to-br from-brand-100 to-sky-100 opacity-70 blur-2xl" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium text-brand-600">
                <Zap size={16} /> Plan de hoy
              </div>
              <h2 className="text-3xl font-semibold tracking-tight">
                {todayWork ? plural(todayWork, 'pregunta pendiente', 'preguntas pendientes') : '¡Todo al día!'}
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone="sky" className="px-3 py-1 text-sm">
                  {plan.dueNow} repasos
                </Badge>
                <Badge tone="violet" className="px-3 py-1 text-sm">
                  {plan.newRemaining} nuevas
                </Badge>
                <Badge tone="slate" className="px-3 py-1 text-sm">
                  {plan.answeredToday} respondidas hoy
                </Badge>
              </div>
              {plan.examNewDemand > s.settings.newPerDay && (
                <p className="mt-3 text-xs text-ink-2">
                  Tus exámenes requieren <b>{plan.examNewDemand} nuevas/día</b> para cubrir todo el temario a tiempo (tu ajuste base es {s.settings.newPerDay}).
                </p>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="primary" size="lg" onClick={() => navigate('/estudiar', { go: '1' })}>
                  <Brain size={18} /> {todayWork ? 'Empezar sesión' : 'Repasar por adelantado'}
                </Button>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Ring value={goalProgress} size={128} stroke={10} color={goalProgress >= 1 ? '#10b981' : '#6366f1'}>
                <span className="text-2xl font-semibold tnum">{plan.answeredToday}</span>
                <span className="text-xs text-ink-3">de {s.settings.dailyGoal}</span>
              </Ring>
              <span className="text-xs text-ink-2">Meta diaria</span>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1 lg:gap-5">
          <Stat icon={<Flame size={14} className="text-orange-500" />} label="Racha" value={plural(str, 'día', 'días')} hint="Días seguidos estudiando" />
          <Stat
            icon={<TrendingUp size={14} className="text-emerald-500" />}
            label="Precisión 7 días"
            value={pct(week.acc)}
            hint={`${week.n} respuestas esta semana`}
          />
        </div>
      </div>

      <div className="mt-8">
        <SectionTitle
          right={
            <a href="#/examenes" className="text-xs font-medium text-brand-600 hover:underline">
              Ver todos
            </a>
          }
        >
          Próximos exámenes
        </SectionTitle>
        {exams.length === 0 ? (
          <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <div className="font-medium">No tienes exámenes programados</div>
              <div className="text-sm text-ink-2">Agrega la fecha y prioridad para que el plan diario se ajuste a ella.</div>
            </div>
            <Button variant="soft" onClick={() => navigate('/examenes', { nuevo: '1' })}>
              <CalendarPlus size={16} /> Agregar examen
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {exams.slice(0, 3).map((p) => (
              <ExamMini key={p.exam.id} p={p} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle
            right={
              weak.length > 0 && (
                <Button size="sm" variant="soft" onClick={() => navigate('/simulacro', { orden: 'debiles', cats: weak.map((w) => w.category).join('|') })}>
                  <Target size={14} /> Simulacro de débiles
                </Button>
              )
            }
          >
            Temas más débiles
          </SectionTitle>
          {weak.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-3">Responde algunas preguntas para detectar tus temas débiles.</p>
          ) : (
            <div className="space-y-3">
              {weak.map((w) => (
                <div key={w.category}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-ink">{w.subtopic || w.topic}</span>
                    <span className="shrink-0 font-semibold tnum">{pct(w.accuracy ?? 0)}</span>
                  </div>
                  <Progress value={w.accuracy ?? 0} color={(w.accuracy ?? 0) >= 0.7 ? 'bg-emerald-500' : (w.accuracy ?? 0) >= 0.5 ? 'bg-amber-400' : 'bg-rose-500'} />
                  <div className="mt-0.5 text-[11px] text-ink-3">
                    {w.topic} · {w.answered} respuestas
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle
            right={
              <a href="#/simulacro" className="text-xs font-medium text-brand-600 hover:underline">
                Nuevo simulacro
              </a>
            }
          >
            Simulacros recientes
          </SectionTitle>
          {s.sims.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-3">Aún no has hecho simulacros.</p>
          ) : (
            <div className="divide-y divide-line">
              {s.sims
                .slice(-5)
                .reverse()
                .map((sim) => {
                  const score = sim.correct / Math.max(1, sim.total)
                  return (
                    <a key={sim.id} href={`#/simulacro?ver=${sim.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                      <div
                        className={`flex h-10 w-12 items-center justify-center rounded-xl text-sm font-semibold tnum ${
                          score >= 0.8 ? 'bg-emerald-50 text-emerald-700' : score >= 0.6 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {Math.round(score * 100)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {sim.config.examId ? s.exams.find((e) => e.id === sim.config.examId)?.name ?? 'Simulacro' : 'Simulacro'}
                        </div>
                        <div className="text-xs text-ink-3">
                          {formatDate(sim.ts)} · {sim.correct}/{sim.total} correctas
                        </div>
                      </div>
                      <ArrowRight size={16} className="text-ink-3" />
                    </a>
                  )
                })}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

function ExamMini({ p }: { p: ExamPlan }) {
  const st = STATUS_META[p.status]
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <Ring value={p.projected} size={72} stroke={7} color={st.color}>
          <span className="text-sm font-semibold tnum">{Math.round(p.projected * 100)}%</span>
        </Ring>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{p.exam.name}</div>
          <div className="mt-0.5 text-sm text-ink-2">
            {p.daysLeft === 0 ? '¡Es hoy!' : p.daysLeft === 1 ? 'Mañana' : `En ${p.daysLeft} días`} · {formatDate(new Date(p.exam.date + 'T00:00').getTime())}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <PriorityBadge p={p.exam.priority} />
            <Badge tone={st.tone}>{st.label}</Badge>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 py-2">
          <div className="text-sm font-semibold tnum">
            {p.seen}/{p.total}
          </div>
          <div className="text-[11px] text-ink-3">vistas</div>
        </div>
        <div className="rounded-xl bg-slate-50 py-2">
          <div className="text-sm font-semibold tnum">{p.newPerDay}</div>
          <div className="text-[11px] text-ink-3">nuevas/día</div>
        </div>
        <div className="rounded-xl bg-slate-50 py-2">
          <div className="text-sm font-semibold tnum">{p.dueToday}</div>
          <div className="text-[11px] text-ink-3">repasos hoy</div>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button size="sm" variant="primary" className="flex-1" onClick={() => navigate('/estudiar', { examen: p.exam.id, go: '1' })}>
          <Brain size={14} /> Estudiar
        </Button>
        <Button size="sm" className="flex-1" onClick={() => navigate('/simulacro', { examen: p.exam.id })}>
          <Timer size={14} /> Simulacro
        </Button>
      </div>
    </Card>
  )
}
