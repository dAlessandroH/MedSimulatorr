import { ArrowLeft, Brain, CheckCircle2, Clock, Keyboard, Plus, RotateCcw, Sparkles, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { makeOrder, QuestionView } from '../components/QuestionView'
import { Badge, Button, Card, Chip, Empty, PageHeader, Progress, Segmented } from '../components/ui'
import { emptyCard, previewIntervals, Rating, RATING_LABEL, State, type Grade } from '../lib/fsrs'
import { buildStudyQueue, dailyPlan, interleave, questionsInScope, upcomingExams, weakestSeen, type Scope } from '../lib/planner'
import { navigate } from '../lib/router'
import { examForQuestion, isNew, useStore, type UndoInfo } from '../lib/store'
import { cx, formatDuration, formatInterval, pct } from '../lib/utils'

type ScopeKind = 'todo' | 'examen' | 'banco' | 'tema'

function scopeFromParams(p: URLSearchParams): { kind: ScopeKind; id: string } {
  if (p.get('examen')) return { kind: 'examen', id: p.get('examen')! }
  if (p.get('banco')) return { kind: 'banco', id: p.get('banco')! }
  if (p.get('tema')) return { kind: 'tema', id: p.get('tema')! }
  return { kind: 'todo', id: '' }
}

function toScope(kind: ScopeKind, id: string, topicCats: (t: string) => string[]): Scope {
  if (kind === 'examen') return { examId: id }
  if (kind === 'banco') return { deckIds: [id] }
  if (kind === 'tema') return { categories: topicCats(id) }
  return {}
}

export function Study({ params }: { params: URLSearchParams }) {
  const s = useStore()
  const init = scopeFromParams(params)
  const [kind, setKind] = useState<ScopeKind>(init.kind)
  const [id, setId] = useState(init.id)
  const [queue, setQueue] = useState<string[] | null>(null)

  const topics = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const q of Object.values(s.questions)) {
      if (!m.has(q.topic)) m.set(q.topic, new Set())
      m.get(q.topic)!.add(q.category)
    }
    return m
  }, [s.questions])
  const topicCats = useCallback((t: string) => [...(topics.get(t) ?? [])], [topics])
  const scope = useMemo(() => toScope(kind, id, topicCats), [kind, id, topicCats])

  const plan = dailyPlan(s)
  const q = useMemo(() => buildStudyQueue(s, scope, plan.newRemaining), [scope, s.cards, s.questions, s.exams, plan.newRemaining])
  const poolSize = useMemo(() => questionsInScope(s, scope).length, [scope, s.questions])

  const start = (ids: string[]) => setQueue(ids)

  useEffect(() => {
    if (params.get('go') === '1' && queue === null) {
      const ids = interleave(q)
      start(ids.length ? ids : weakestSeen(s, scope, 20, new Set()))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (queue) {
    return (
      <Session
        initial={queue}
        scope={scope}
        onExit={() => {
          setQueue(null)
          navigate('/estudiar', { [kind === 'todo' ? 'x' : kind]: id || null })
        }}
      />
    )
  }

  const total = Object.keys(s.questions).length
  if (!total) {
    return (
      <>
        <PageHeader title="Estudiar" />
        <Empty icon={<Brain size={24} />} title="No hay preguntas" text="Importa un CSV en el Banco para empezar." action={<Button variant="primary" onClick={() => navigate('/banco')}>Ir al banco</Button>} />
      </>
    )
  }

  const work = q.learning.length + q.review.length + q.fresh.length
  return (
    <>
      <PageHeader title="Estudiar con FSRS" subtitle="Repaso espaciado: las preguntas vuelven justo antes de que las olvides, priorizando tus exámenes próximos." />
      <Card className="p-6">
        <div className="mb-3 text-sm font-medium">¿Qué quieres estudiar?</div>
        <Segmented
          value={kind}
          onChange={(k) => {
            setKind(k)
            setId(k === 'examen' ? upcomingExams(s.exams)[0]?.id ?? '' : k === 'banco' ? s.decks[0]?.id ?? '' : k === 'tema' ? [...topics.keys()][0] ?? '' : '')
          }}
          options={[
            { value: 'todo', label: 'Todo' },
            { value: 'examen', label: 'Por examen' },
            { value: 'banco', label: 'Por banco' },
            { value: 'tema', label: 'Por tema' },
          ]}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {kind === 'examen' &&
            (s.exams.length ? (
              s.exams.map((e) => (
                <Chip key={e.id} active={id === e.id} onClick={() => setId(e.id)}>
                  {e.name}
                </Chip>
              ))
            ) : (
              <span className="text-sm text-ink-3">No hay exámenes. Agrégalos en la sección Exámenes.</span>
            ))}
          {kind === 'banco' &&
            s.decks.map((d) => (
              <Chip key={d.id} active={id === d.id} onClick={() => setId(d.id)} color={d.color}>
                {d.name}
              </Chip>
            ))}
          {kind === 'tema' &&
            [...topics.keys()].sort().map((t) => (
              <Chip key={t} active={id === t} onClick={() => setId(t)}>
                {t}
              </Chip>
            ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Counter label="Aprendiendo" value={q.learning.length} cls="text-rose-600" />
          <Counter label="Repasos" value={q.review.length} cls="text-sky-600" />
          <Counter label="Nuevas hoy" value={q.fresh.length} cls="text-violet-600" hint={`${q.newAvailable} sin ver en total`} />
          <Counter label="Preguntas en alcance" value={poolSize} cls="text-ink" />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" size="lg" disabled={!work} onClick={() => start(interleave(q))}>
            <Brain size={18} /> Empezar ({work})
          </Button>
          <Button
            size="lg"
            disabled={!q.newAvailable}
            onClick={() => start(buildStudyQueue(s, scope, q.fresh.length + 10).fresh)}
            title="Agrega preguntas nuevas extra a las de hoy"
          >
            <Plus size={18} /> Solo nuevas (+10)
          </Button>
          <Button size="lg" onClick={() => start(weakestSeen(s, scope, 20, new Set()))} disabled={poolSize - q.newAvailable <= 0}>
            <Sparkles size={18} /> Repasar 20 más débiles
          </Button>
        </div>
        {!work && <p className="mt-3 text-sm text-ink-2">No tienes pendientes en este alcance. Puedes adelantar repasos de tus preguntas más débiles o ver nuevas extra.</p>}
      </Card>

      <Card className="mt-5 p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Keyboard size={16} className="text-ink-3" /> Atajos de teclado
        </div>
        <div className="grid gap-1 text-sm text-ink-2 sm:grid-cols-2">
          <span><Kbd>1</Kbd>–<Kbd>4</Kbd> o <Kbd>A</Kbd>–<Kbd>D</Kbd> elegir respuesta</span>
          <span><Kbd>Espacio</Kbd> / <Kbd>Enter</Kbd> continuar (calificación sugerida)</span>
          <span><Kbd>1</Kbd> Otra vez · <Kbd>2</Kbd> Difícil · <Kbd>3</Kbd> Bien · <Kbd>4</Kbd> Fácil (tras responder)</span>
          <span><Kbd>M</Kbd> marcar · <Kbd>⌘/Ctrl</Kbd>+<Kbd>Z</Kbd> deshacer</span>
        </div>
      </Card>
    </>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="mx-0.5 rounded-md border border-line bg-white px-1.5 py-0.5 font-sans text-[11px] text-ink shadow-[0_1px_0_#e7e9f0]">{children}</kbd>
}

function Counter({ label, value, cls, hint }: { label: string; value: number; cls: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <div className={cx('text-2xl font-semibold tnum', cls)}>{value}</div>
      <div className="text-xs text-ink-2">{label}</div>
      {hint && <div className="text-[11px] text-ink-3">{hint}</div>}
    </div>
  )
}

interface Snapshot {
  queue: string[]
  pos: number
  undo: UndoInfo
  stats: { answered: number; correct: number }
}

function Session({ initial, scope, onExit }: { initial: string[]; scope: Scope; onExit: () => void }) {
  const s = useStore()
  const [queue, setQueue] = useState(initial)
  const [pos, setPos] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [stats, setStats] = useState({ answered: 0, correct: 0 })
  const [history, setHistory] = useState<Snapshot[]>([])
  const shownAt = useRef(Date.now())
  const sessionStart = useRef(Date.now())
  const [answerTime, setAnswerTime] = useState(0)

  const qid = queue[pos]
  const q = qid ? s.questions[qid] : undefined
  const order = useMemo(() => (q ? makeOrder(q, s.settings.shuffleOptions) : []), [qid, pos])
  const revealed = selected !== null
  const correct = revealed && q ? selected === q.answer : false
  const card = qid ? s.cards[qid] : undefined

  useEffect(() => {
    shownAt.current = Date.now()
    setSelected(null)
  }, [qid, pos])

  const intervals = useMemo(() => {
    if (!q || !revealed) return null
    return previewIntervals(card ?? emptyCard(), Date.now(), {
      retention: s.settings.retention,
      maxInterval: s.settings.maxInterval,
      examAware: s.settings.examAware,
      exam: examForQuestion(s.exams, q),
      seed: q.id,
    })
  }, [revealed, qid])

  const choose = (orig: number) => {
    if (revealed || !q) return
    setAnswerTime(Math.min(300_000, Date.now() - shownAt.current))
    setSelected(orig)
  }

  const rate = (grade: Grade) => {
    if (!q || selected === null) return
    const undo = s.answer({ qid: q.id, chosen: selected, timeMs: answerTime, mode: 'estudio', grade })
    const after = useStore.getState().cards[q.id]
    const snap: Snapshot = { queue, pos, undo, stats }
    setHistory((h) => [...h.slice(-30), snap])
    setStats((st) => ({ answered: st.answered + 1, correct: st.correct + (selected === q.answer ? 1 : 0) }))
    let next = queue
    // Las tarjetas en aprendizaje con un paso corto vuelven a aparecer en esta sesión
    if (after && after.state !== State.Review && after.due - Date.now() < 30 * 60_000) {
      const at = Math.min(queue.length, pos + 1 + Math.max(3, Math.round((after.due - Date.now()) / 60_000 / 2)))
      next = [...queue.slice(0, at), q.id, ...queue.slice(at)]
      setQueue(next)
    }
    setPos(pos + 1)
  }

  const undo = () => {
    const last = history[history.length - 1]
    if (!last) return
    s.undo(last.undo)
    setHistory((h) => h.slice(0, -1))
    setQueue(last.queue)
    setPos(last.pos)
    setStats(last.stats)
  }

  const suggested: Grade = correct ? Rating.Good : Rating.Again

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'm' && q) return s.toggleFlag(q.id)
      if (!revealed) {
        const n = '1234'.indexOf(k) >= 0 ? Number(k) - 1 : 'abcdef'.indexOf(k)
        if (n >= 0 && n < order.length) choose(order[n])
      } else {
        if (k === ' ' || k === 'enter') {
          e.preventDefault()
          rate(suggested)
        } else if (k.length === 1 && (correct ? '1234' : '1').includes(k)) rate(Number(k) as Grade)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const remaining = queue.slice(pos)
  const counts = useMemo(() => {
    let l = 0,
      r = 0,
      n = 0
    for (const id of new Set(remaining)) {
      const c = s.cards[id]
      if (isNew(c)) n++
      else if (c!.state === State.Review) r++
      else l++
    }
    return { l, r, n }
  }, [queue, pos, s.cards])

  if (!q) {
    return <SessionDone stats={stats} elapsed={(Date.now() - sessionStart.current) / 1000} scope={scope} onMore={(ids) => (setQueue(ids), setPos(0), setHistory([]))} onExit={onExit} onUndo={history.length ? undo : undefined} />
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onExit}>
          <ArrowLeft size={16} /> Salir
        </Button>
        <div className="flex-1">
          <Progress value={pos / Math.max(1, queue.length)} />
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold tnum">
          <span className="text-rose-600" title="Aprendiendo">{counts.l}</span>
          <span className="text-sky-600" title="Repasos">{counts.r}</span>
          <span className="text-violet-600" title="Nuevas">{counts.n}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={undo} disabled={!history.length} title="Deshacer (⌘Z)">
          <Undo2 size={16} />
        </Button>
      </div>

      <Card className="p-6 sm:p-8">
        <div className="mb-3 flex items-center gap-2 text-xs text-ink-3">
          {isNew(card) ? <Badge tone="violet">Nueva</Badge> : card!.state === State.Review ? <Badge tone="sky">Repaso</Badge> : <Badge tone="red">Aprendiendo</Badge>}
          {card && !isNew(card) && (
            <span>
              {card.reps} repasos · {card.lapses} olvidos
            </span>
          )}
        </div>
        <QuestionView q={q} order={order} selected={selected} revealed={revealed} onSelect={revealed ? undefined : choose} />
      </Card>

      {revealed && intervals && (
        <div className="fade-in mt-4">
          {correct ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <RateBtn grade={Rating.Again} label="Lo adiviné" ms={intervals[Rating.Again]} onClick={rate} tone="rose" k="1" />
              <RateBtn grade={Rating.Hard} label={RATING_LABEL[Rating.Hard]} ms={intervals[Rating.Hard]} onClick={rate} tone="amber" k="2" />
              <RateBtn grade={Rating.Good} label={RATING_LABEL[Rating.Good]} ms={intervals[Rating.Good]} onClick={rate} tone="emerald" k="3" primary />
              <RateBtn grade={Rating.Easy} label={RATING_LABEL[Rating.Easy]} ms={intervals[Rating.Easy]} onClick={rate} tone="sky" k="4" />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" size="lg" className="flex-1" onClick={() => rate(Rating.Again)}>
                Continuar · vuelve en {formatInterval(intervals[Rating.Again])}
              </Button>
              <span className="text-xs text-ink-3">
                <Kbd>Espacio</Kbd> para continuar
              </span>
            </div>
          )}
        </div>
      )}
      <div className="mt-4 flex items-center justify-center gap-4 text-xs text-ink-3">
        <span className="flex items-center gap-1">
          <CheckCircle2 size={13} /> {stats.correct}/{stats.answered} correctas
        </span>
        <span className="flex items-center gap-1">
          <Clock size={13} /> {formatDuration((Date.now() - sessionStart.current) / 1000)}
        </span>
      </div>
    </div>
  )
}

function RateBtn({
  grade,
  label,
  ms,
  onClick,
  tone,
  k,
  primary,
}: {
  grade: Grade
  label: string
  ms: number
  onClick: (g: Grade) => void
  tone: 'rose' | 'amber' | 'emerald' | 'sky'
  k: string
  primary?: boolean
}) {
  const tones = {
    rose: 'hover:border-rose-300 hover:bg-rose-50 text-rose-700',
    amber: 'hover:border-amber-300 hover:bg-amber-50 text-amber-700',
    emerald: 'hover:border-emerald-300 hover:bg-emerald-50 text-emerald-700',
    sky: 'hover:border-sky-300 hover:bg-sky-50 text-sky-700',
  }
  return (
    <button
      onClick={() => onClick(grade)}
      className={cx(
        'flex cursor-pointer flex-col items-center rounded-2xl border bg-white px-3 py-2.5 transition active:scale-[0.98]',
        primary ? 'border-emerald-300 ring-4 ring-emerald-50' : 'border-line',
        tones[tone],
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs text-ink-3">
        {formatInterval(ms)} · <span className="font-mono">{k}</span>
      </span>
    </button>
  )
}

function SessionDone({
  stats,
  elapsed,
  scope,
  onMore,
  onExit,
  onUndo,
}: {
  stats: { answered: number; correct: number }
  elapsed: number
  scope: Scope
  onMore: (ids: string[]) => void
  onExit: () => void
  onUndo?: () => void
}) {
  const s = useStore()
  const more = buildStudyQueue(s, scope, 10)
  return (
    <div className="mx-auto max-w-xl">
      <Card className="fade-in p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
          <CheckCircle2 size={32} />
        </div>
        <h2 className="text-2xl font-semibold">¡Sesión terminada!</h2>
        <p className="mt-1 text-sm text-ink-2">FSRS ya programó cada pregunta para su próximo repaso.</p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-slate-50 py-3">
            <div className="text-xl font-semibold tnum">{stats.answered}</div>
            <div className="text-xs text-ink-3">respondidas</div>
          </div>
          <div className="rounded-2xl bg-slate-50 py-3">
            <div className="text-xl font-semibold tnum">{pct(stats.correct / Math.max(1, stats.answered))}</div>
            <div className="text-xs text-ink-3">precisión</div>
          </div>
          <div className="rounded-2xl bg-slate-50 py-3">
            <div className="text-xl font-semibold tnum">{formatDuration(elapsed)}</div>
            <div className="text-xs text-ink-3">tiempo</div>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          {more.learning.length + more.review.length > 0 && (
            <Button variant="primary" onClick={() => onMore(interleave({ ...more, fresh: [] }))}>
              <RotateCcw size={16} /> Continuar con pendientes ({more.learning.length + more.review.length})
            </Button>
          )}
          {more.newAvailable > 0 && (
            <Button onClick={() => onMore(more.fresh)}>
              <Plus size={16} /> Estudiar {Math.min(10, more.newAvailable)} nuevas más
            </Button>
          )}
          <Button onClick={() => onMore(weakestSeen(s, scope, 20, new Set()))}>
            <Sparkles size={16} /> Repasar 20 más débiles
          </Button>
          <div className="flex gap-2">
            {onUndo && (
              <Button variant="ghost" className="flex-1" onClick={onUndo}>
                <Undo2 size={16} /> Deshacer última
              </Button>
            )}
            <Button variant="ghost" className="flex-1" onClick={onExit}>
              Volver
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
