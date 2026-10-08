import { AlertTriangle, ArrowLeft, ArrowRight, Bookmark, CheckCircle2, Clock, Play, RotateCcw, Timer, Trash2, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { makeOrder, QuestionView } from '../components/QuestionView'
import { Badge, Button, Card, Chip, Empty, Field, inputCls, Modal, PageHeader, Progress, Ring, SectionTitle, Segmented } from '../components/ui'
import { questionsInScope, selectSimQuestions } from '../lib/planner'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import type { SimConfig, SimOrder, SimResult } from '../lib/types'
import { cx, formatDate, formatDuration, LETTERS, pct, uid } from '../lib/utils'

const RUN_KEY = 'medsimulator-sim-en-curso'

interface RunState {
  config: SimConfig
  ids: string[]
  orders: number[][]
  answers: (number | null)[]
  marked: boolean[]
  times: number[]
  pos: number
  startedAt: number
  /** Segundos transcurridos acumulados (permite pausar al recargar) */
  elapsed: number
}

function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY)
    return raw ? (JSON.parse(raw) as RunState) : null
  } catch {
    return null
  }
}
function saveRun(r: RunState | null) {
  try {
    if (r) localStorage.setItem(RUN_KEY, JSON.stringify(r))
    else localStorage.removeItem(RUN_KEY)
  } catch {
    /* almacenamiento no disponible */
  }
}

export function Simulator({ params }: { params: URLSearchParams }) {
  const s = useStore()
  const viewId = params.get('ver')
  const [run, setRun] = useState<RunState | null>(null)
  const [pending, setPending] = useState(loadRun)

  if (viewId) {
    const sim = s.sims.find((x) => x.id === viewId)
    if (sim && !run)
      return (
        <Results
          sim={sim}
          onRepeat={(r) => {
            saveRun(r)
            setRun(r)
            navigate('/simulacro')
          }}
        />
      )
  }
  if (run) {
    return (
      <Runner
        initial={run}
        onFinish={(sim) => {
          saveRun(null)
          setRun(null)
          navigate('/simulacro', { ver: sim.id })
        }}
        onAbort={() => {
          saveRun(null)
          setRun(null)
        }}
      />
    )
  }
  if (!Object.keys(s.questions).length) {
    return (
      <>
        <PageHeader title="Simulacro" />
        <Empty icon={<Timer size={24} />} title="No hay preguntas" text="Importa un CSV en el Banco para crear simulacros." action={<Button variant="primary" onClick={() => navigate('/banco')}>Ir al banco</Button>} />
      </>
    )
  }
  return (
    <Config
      params={params}
      pending={pending}
      onStart={setRun}
      onDiscard={() => {
        saveRun(null)
        setPending(null)
      }}
    />
  )
}

function Config({
  params,
  pending,
  onStart,
  onDiscard,
}: {
  params: URLSearchParams
  pending: RunState | null
  onStart: (r: RunState) => void
  onDiscard: () => void
}) {
  const s = useStore()
  const [examId, setExamId] = useState<string | null>(params.get('examen'))
  const [deckIds, setDeckIds] = useState<string[]>([])
  const [cats, setCats] = useState<string[]>(params.get('cats')?.split('|').filter(Boolean) ?? [])
  const [count, setCount] = useState(Number(params.get('n')) || 20)
  const [perQ, setPerQ] = useState(1)
  const [timed, setTimed] = useState(true)
  const [order, setOrder] = useState<SimOrder>((params.get('orden') as SimOrder) || 'aleatorio')

  const topics = useMemo(() => {
    const m = new Map<string, Map<string, string>>()
    const pool = questionsInScope(s, { deckIds: deckIds.length ? deckIds : null })
    for (const q of pool) {
      if (!m.has(q.topic)) m.set(q.topic, new Map())
      m.get(q.topic)!.set(q.category, q.subtopic || q.category)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [s.questions, deckIds])

  const config: SimConfig = {
    examId,
    deckIds: examId ? [] : deckIds,
    categories: examId ? [] : cats,
    count,
    minutes: timed ? Math.round(count * perQ) : 0,
    order,
  }
  const available = useMemo(() => selectSimQuestions(s, { ...config, count: 100000 }).length, [examId, deckIds, cats, order, s.questions, s.answers])

  const start = () => {
    const ids = selectSimQuestions(s, config)
    if (!ids.length) return
    const r: RunState = {
      config: { ...config, count: ids.length },
      ids,
      orders: ids.map((id) => makeOrder(s.questions[id], s.settings.shuffleOptions)),
      answers: ids.map(() => null),
      marked: ids.map(() => false),
      times: ids.map(() => 0),
      pos: 0,
      startedAt: Date.now(),
      elapsed: 0,
    }
    saveRun(r)
    onStart(r)
  }

  const toggleTopic = (catsOfTopic: string[]) => {
    const all = catsOfTopic.every((c) => cats.includes(c))
    setCats(all ? cats.filter((c) => !catsOfTopic.includes(c)) : [...new Set([...cats, ...catsOfTopic])])
  }

  return (
    <>
      <PageHeader title="Simulacro de examen" subtitle="Responde sin ver las respuestas, con tiempo, como en el examen real. Al final verás tu calificación y las explicaciones." />

      {pending && (
        <Card className="mb-5 flex flex-wrap items-center gap-4 border-amber-200 bg-amber-50/50 p-4">
          <AlertTriangle size={20} className="text-amber-600" />
          <div className="flex-1 text-sm">
            Tienes un simulacro en curso ({pending.answers.filter((a) => a !== null).length}/{pending.ids.length} respondidas).
          </div>
          <Button size="sm" variant="primary" onClick={() => onStart(pending)}>
            Continuar
          </Button>
          <Button size="sm" variant="ghost" onClick={onDiscard}>
            Descartar
          </Button>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="space-y-6 p-6 lg:col-span-2">
          <div>
            <div className="mb-2 text-sm font-medium">Examen</div>
            <div className="flex flex-wrap gap-2">
              <Chip active={!examId} onClick={() => setExamId(null)}>
                Personalizado
              </Chip>
              {s.exams.map((e) => (
                <Chip key={e.id} active={examId === e.id} onClick={() => setExamId(e.id)}>
                  {e.name}
                </Chip>
              ))}
            </div>
          </div>

          {!examId && (
            <>
              <div>
                <div className="mb-2 text-sm font-medium">Bancos</div>
                <div className="flex flex-wrap gap-2">
                  {s.decks.map((d) => (
                    <Chip
                      key={d.id}
                      color={d.color}
                      active={deckIds.includes(d.id)}
                      onClick={() => setDeckIds(deckIds.includes(d.id) ? deckIds.filter((x) => x !== d.id) : [...deckIds, d.id])}
                    >
                      {d.name}
                    </Chip>
                  ))}
                  <span className="self-center text-xs text-ink-3">{deckIds.length ? '' : 'Todos'}</span>
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Temas</span>
                  {cats.length > 0 && (
                    <button className="text-xs text-brand-600 hover:underline" onClick={() => setCats([])}>
                      Quitar filtros
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {topics.map(([topic, sub]) => {
                    const catList = [...sub.keys()]
                    const sel = catList.filter((c) => cats.includes(c)).length
                    return (
                      <div key={topic}>
                        <Chip active={sel === catList.length} onClick={() => toggleTopic(catList)}>
                          {topic} <span className="text-ink-3">{sel ? `${sel}/${catList.length}` : catList.length}</span>
                        </Chip>
                        {sel > 0 && (
                          <div className="mt-2 ml-4 flex flex-wrap gap-1.5">
                            {catList.map((c) => (
                              <Chip key={c} active={cats.includes(c)} onClick={() => setCats(cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c])}>
                                <span className="text-xs">{sub.get(c)}</span>
                              </Chip>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {!cats.length && <p className="mt-2 text-xs text-ink-3">Sin filtro: se incluyen todos los temas.</p>}
              </div>
            </>
          )}

          <div>
            <div className="mb-2 text-sm font-medium">Selección de preguntas</div>
            <Segmented
              value={order}
              onChange={setOrder}
              options={[
                { value: 'aleatorio', label: 'Aleatorio' },
                { value: 'debiles', label: 'Más débiles' },
                { value: 'falladas', label: 'Falladas' },
                { value: 'nuevas', label: 'No vistas' },
                { value: 'marcadas', label: 'Marcadas' },
              ]}
            />
          </div>
        </Card>

        <Card className="flex flex-col p-6">
          <Field label="Número de preguntas">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {[10, 20, 50, 100].map((n) => (
                <Chip key={n} active={count === n} onClick={() => setCount(n)}>
                  {n}
                </Chip>
              ))}
            </div>
            <input type="number" min={1} className={inputCls} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} />
          </Field>
          <div className="mt-5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} /> Con tiempo límite
            </label>
            {timed && (
              <div className="mt-2">
                <input type="range" min={0.5} max={3} step={0.25} value={perQ} onChange={(e) => setPerQ(Number(e.target.value))} className="w-full" />
                <div className="text-xs text-ink-2">
                  {perQ} min por pregunta → <b>{formatDuration(Math.round(count * perQ) * 60)}</b>
                </div>
              </div>
            )}
          </div>
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-2">Disponibles</span>
              <span className="font-semibold tnum">{available}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-ink-2">En este simulacro</span>
              <span className="font-semibold tnum">{Math.min(count, available)}</span>
            </div>
          </div>
          <Button variant="primary" size="lg" className="mt-5" disabled={!available} onClick={start}>
            <Play size={18} /> Comenzar simulacro
          </Button>
          {s.settings.simUpdatesFsrs && <p className="mt-2 text-center text-[11px] text-ink-3">Las respuestas también actualizan tu programación FSRS.</p>}
        </Card>
      </div>

      <History />
    </>
  )
}

function History() {
  const s = useStore()
  if (!s.sims.length) return null
  return (
    <div className="mt-8">
      <SectionTitle>Historial</SectionTitle>
      <Card className="divide-y divide-line">
        {s.sims
          .slice()
          .reverse()
          .map((sim) => {
            const score = sim.correct / Math.max(1, sim.total)
            const exam = sim.config.examId ? s.exams.find((e) => e.id === sim.config.examId) : null
            return (
              <div key={sim.id} className="flex items-center gap-4 px-5 py-3">
                <div
                  className={cx(
                    'flex h-10 w-12 items-center justify-center rounded-xl text-sm font-semibold tnum',
                    score >= 0.8 ? 'bg-emerald-50 text-emerald-700' : score >= 0.6 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700',
                  )}
                >
                  {Math.round(score * 100)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{exam?.name ?? 'Simulacro personalizado'}</div>
                  <div className="text-xs text-ink-3">
                    {formatDate(sim.ts)} · {sim.correct}/{sim.total} · {formatDuration(sim.durationSec)}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => navigate('/simulacro', { ver: sim.id })}>
                  Revisar
                </Button>
                <button
                  className="rounded-lg p-1.5 text-ink-3 hover:bg-rose-50 hover:text-rose-600"
                  title="Eliminar del historial"
                  onClick={() => confirm('¿Eliminar este simulacro del historial?') && s.deleteSim(sim.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )
          })}
      </Card>
    </div>
  )
}

function Runner({ initial, onFinish, onAbort }: { initial: RunState; onFinish: (s: SimResult) => void; onAbort: () => void }) {
  const s = useStore()
  const [r, setR] = useState(initial)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [tick, setTick] = useState(0)
  const lastTick = useRef(Date.now())
  const finished = useRef(false)

  // Reloj: acumula tiempo total y tiempo por pregunta
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now()
      const dt = (now - lastTick.current) / 1000
      lastTick.current = now
      setR((prev) => {
        const times = prev.times.slice()
        times[prev.pos] += dt * 1000
        return { ...prev, elapsed: prev.elapsed + dt, times }
      })
      setTick((x) => x + 1)
    }, 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (tick % 5 === 0) saveRun(r)
  }, [tick])

  const limit = r.config.minutes * 60
  const left = limit ? limit - r.elapsed : Infinity

  const finish = () => {
    if (finished.current) return
    finished.current = true
    const correct = r.ids.reduce((n, id, i) => n + (r.answers[i] === s.questions[id]?.answer ? 1 : 0), 0)
    const sim: SimResult = {
      id: uid(),
      ts: Date.now(),
      config: r.config,
      questionIds: r.ids,
      answers: r.answers,
      correct,
      total: r.ids.length,
      durationSec: Math.round(r.elapsed),
    }
    s.saveSim(sim, r.times)
    onFinish(sim)
  }

  useEffect(() => {
    if (left <= 0) finish()
  }, [left])

  const go = (pos: number) => setR((p) => ({ ...p, pos: Math.max(0, Math.min(p.ids.length - 1, pos)) }))
  const pick = (orig: number) =>
    setR((p) => {
      const answers = p.answers.slice()
      answers[p.pos] = answers[p.pos] === orig ? null : orig
      const next = { ...p, answers }
      saveRun(next)
      return next
    })
  const toggleMark = () =>
    setR((p) => {
      const marked = p.marked.slice()
      marked[p.pos] = !marked[p.pos]
      return { ...p, marked }
    })

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || confirmEnd) return
      const k = e.key.toLowerCase()
      if (k === 'arrowright' || k === 'enter') go(r.pos + 1)
      else if (k === 'arrowleft') go(r.pos - 1)
      else if (k === 'f') toggleMark()
      else {
        const n = '1234'.indexOf(k) >= 0 ? Number(k) - 1 : 'abcdef'.indexOf(k)
        if (n >= 0 && n < r.orders[r.pos].length && k.length === 1) pick(r.orders[r.pos][n])
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const q = s.questions[r.ids[r.pos]]
  const answered = r.answers.filter((a) => a !== null).length

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => confirm('¿Abandonar el simulacro? No se guardará.') && onAbort()}>
          <ArrowLeft size={16} /> Abandonar
        </Button>
        <div className="flex-1">
          <Progress value={answered / r.ids.length} />
        </div>
        <span className="text-sm text-ink-2 tnum">
          {answered}/{r.ids.length}
        </span>
        <div
          className={cx(
            'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold tnum',
            left < 60 ? 'bg-rose-50 text-rose-700' : left < 300 ? 'bg-amber-50 text-amber-700' : 'bg-white text-ink border border-line',
          )}
        >
          <Clock size={15} />
          {limit ? formatDuration(left) : formatDuration(r.elapsed)}
        </div>
        <Button variant="primary" size="sm" onClick={() => setConfirmEnd(true)}>
          Terminar
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
        <Card className="p-6 sm:p-8">
          <div className="mb-3 flex items-center justify-between text-xs text-ink-3">
            <span>
              Pregunta {r.pos + 1} de {r.ids.length}
            </span>
            <button onClick={toggleMark} className={cx('flex items-center gap-1 rounded-lg px-2 py-1', r.marked[r.pos] ? 'bg-amber-50 text-amber-700' : 'hover:bg-slate-100')}>
              <Bookmark size={14} fill={r.marked[r.pos] ? 'currentColor' : 'none'} /> Revisar después (F)
            </button>
          </div>
          {q ? <QuestionView q={q} order={r.orders[r.pos]} selected={r.answers[r.pos]} revealed={false} onSelect={pick} /> : <p>Pregunta eliminada.</p>}
          <div className="mt-6 flex justify-between">
            <Button onClick={() => go(r.pos - 1)} disabled={r.pos === 0}>
              <ArrowLeft size={16} /> Anterior
            </Button>
            {r.pos < r.ids.length - 1 ? (
              <Button variant="soft" onClick={() => go(r.pos + 1)}>
                Siguiente <ArrowRight size={16} />
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setConfirmEnd(true)}>
                Terminar <CheckCircle2 size={16} />
              </Button>
            )}
          </div>
        </Card>

        <Card className="h-fit p-4 lg:sticky lg:top-6">
          <div className="mb-3 text-xs font-medium text-ink-2">Navegador</div>
          <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-5">
            {r.ids.map((_, i) => (
              <button
                key={i}
                onClick={() => go(i)}
                className={cx(
                  'relative h-8 rounded-lg text-xs font-medium tnum transition cursor-pointer',
                  i === r.pos ? 'ring-2 ring-brand-500 ring-offset-1' : '',
                  r.answers[i] !== null ? 'bg-brand-500 text-white' : 'bg-slate-100 text-ink-2 hover:bg-slate-200',
                )}
              >
                {i + 1}
                {r.marked[i] && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-400" />}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-1 text-[11px] text-ink-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-brand-500" /> Respondida
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Para revisar
            </div>
          </div>
        </Card>
      </div>

      <Modal open={confirmEnd} onClose={() => setConfirmEnd(false)} title="¿Terminar simulacro?">
        <p className="text-sm text-ink-2">
          Respondiste <b>{answered}</b> de <b>{r.ids.length}</b> preguntas.
          {answered < r.ids.length && ' Las preguntas sin responder cuentan como incorrectas.'}
          {r.marked.some(Boolean) && ` Tienes ${r.marked.filter(Boolean).length} marcadas para revisar.`}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmEnd(false)}>Seguir respondiendo</Button>
          <Button variant="primary" onClick={finish}>
            Terminar y calificar
          </Button>
        </div>
      </Modal>
    </div>
  )
}

type Filter = 'todas' | 'incorrectas' | 'correctas' | 'sin'

function Results({ sim, onRepeat }: { sim: SimResult; onRepeat: (r: RunState) => void }) {
  const s = useStore()
  const [filter, setFilter] = useState<Filter>('incorrectas')
  const exam = sim.config.examId ? s.exams.find((e) => e.id === sim.config.examId) : null
  const score = sim.correct / Math.max(1, sim.total)
  const target = (exam?.targetScore ?? 80) / 100
  const unanswered = sim.answers.filter((a) => a === null).length

  const byTopic = useMemo(() => {
    const m = new Map<string, { c: number; t: number }>()
    sim.questionIds.forEach((id, i) => {
      const q = s.questions[id]
      if (!q) return
      const x = m.get(q.category) ?? { c: 0, t: 0 }
      x.t++
      if (sim.answers[i] === q.answer) x.c++
      m.set(q.category, x)
    })
    return [...m.entries()].sort((a, b) => a[1].c / a[1].t - b[1].c / b[1].t)
  }, [sim])

  const items = sim.questionIds
    .map((id, i) => ({ q: s.questions[id], chosen: sim.answers[i], i }))
    .filter((x) => x.q)
    .filter((x) =>
      filter === 'todas' ? true : filter === 'correctas' ? x.chosen === x.q.answer : filter === 'sin' ? x.chosen === null : x.chosen !== x.q.answer,
    )

  const wrongIds = sim.questionIds.filter((id, i) => s.questions[id] && sim.answers[i] !== s.questions[id].answer)

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/simulacro')}>
          <ArrowLeft size={16} /> Simulacros
        </Button>
        <span className="text-sm text-ink-3">{formatDate(sim.ts)}</span>
      </div>
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <Ring value={score} size={140} stroke={11} color={score >= target ? '#10b981' : score >= target * 0.8 ? '#f59e0b' : '#f43f5e'}>
            <span className="text-3xl font-semibold tnum">{Math.round(score * 100)}</span>
            <span className="text-xs text-ink-3">de 100</span>
          </Ring>
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl font-semibold">{exam?.name ?? 'Simulacro personalizado'}</h1>
            <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
              <Badge tone={score >= target ? 'green' : 'red'}>
                {score >= target ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {score >= target ? 'Meta alcanzada' : 'Debajo de la meta'} ({Math.round(target * 100)}%)
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Mini label="Correctas" value={sim.correct} cls="text-emerald-600" />
              <Mini label="Incorrectas" value={sim.total - sim.correct - unanswered} cls="text-rose-600" />
              <Mini label="Sin responder" value={unanswered} cls="text-ink-2" />
              <Mini label="Tiempo" value={formatDuration(sim.durationSec)} cls="text-ink" />
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {wrongIds.length > 0 && (
            <Button
              variant="primary"
              onClick={() => {
                const cfg: SimConfig = { ...sim.config, count: wrongIds.length, minutes: sim.config.minutes ? wrongIds.length : 0 }
                const r: RunState = {
                  config: cfg,
                  ids: wrongIds,
                  orders: wrongIds.map((id) => makeOrder(s.questions[id], s.settings.shuffleOptions)),
                  answers: wrongIds.map(() => null),
                  marked: wrongIds.map(() => false),
                  times: wrongIds.map(() => 0),
                  pos: 0,
                  startedAt: Date.now(),
                  elapsed: 0,
                }
                onRepeat(r)
              }}
            >
              <RotateCcw size={16} /> Repetir las {wrongIds.length} que no acertaste
            </Button>
          )}
          <Button onClick={() => navigate('/simulacro')}>
            <Timer size={16} /> Nuevo simulacro
          </Button>
        </div>
      </Card>

      <Card className="mt-5 p-6">
        <SectionTitle>Resultado por tema</SectionTitle>
        <div className="space-y-3">
          {byTopic.map(([cat, x]) => {
            const v = x.c / x.t
            return (
              <div key={cat}>
                <div className="mb-1 flex justify-between gap-3 text-sm">
                  <span className="truncate">{cat}</span>
                  <span className="shrink-0 font-semibold tnum">
                    {x.c}/{x.t} · {pct(v)}
                  </span>
                </div>
                <Progress value={v} color={v >= 0.8 ? 'bg-emerald-500' : v >= 0.6 ? 'bg-amber-400' : 'bg-rose-500'} />
              </div>
            )
          })}
        </div>
      </Card>

      <div className="mt-8 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Revisión</h2>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'incorrectas', label: `Incorrectas (${sim.total - sim.correct})` },
            { value: 'correctas', label: `Correctas (${sim.correct})` },
            { value: 'sin', label: `Sin responder (${unanswered})` },
            { value: 'todas', label: 'Todas' },
          ]}
        />
      </div>
      <div className="space-y-4">
        {items.map(({ q, chosen, i }) => (
          <Card key={q.id + i} className="p-6">
            <div className="mb-2 text-xs font-medium text-ink-3">
              Pregunta {i + 1}
              {chosen !== null && chosen !== q.answer && <> · Elegiste {LETTERS[chosen]}</>}
            </div>
            <QuestionView q={q} order={q.options.map((_, k) => k)} selected={chosen} revealed />
          </Card>
        ))}
        {!items.length && <p className="py-8 text-center text-sm text-ink-3">Nada que mostrar con este filtro.</p>}
      </div>
    </div>
  )
}

function Mini({ label, value, cls }: { label: string; value: React.ReactNode; cls: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-2 text-center">
      <div className={cx('text-lg font-semibold tnum', cls)}>{value}</div>
      <div className="text-[11px] text-ink-3">{label}</div>
    </div>
  )
}
