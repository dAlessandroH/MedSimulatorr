import { Brain, CalendarDays, CalendarPlus, Info, Pencil, Timer, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge, Button, Card, Chip, Empty, Field, fieldBase, inputCls, Modal, PageHeader, PriorityBadge, Progress, Ring, Segmented } from '../components/ui'
import { examPlan, type ExamPlan } from '../lib/planner'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import type { Exam, Priority } from '../lib/types'
import { dayKey, DAY, formatDate, parseDateKey, pct, uid } from '../lib/utils'
import { STATUS_META } from './Dashboard'

function blankExam(deckIds: string[]): Exam {
  return {
    id: uid(),
    name: '',
    date: dayKey(Date.now() + 14 * DAY),
    priority: 'media',
    deckIds,
    categories: [],
    targetScore: 80,
    notes: '',
    createdAt: Date.now(),
    realScore: null,
  }
}

export function Exams() {
  const s = useStore()
  const initialNew = new URLSearchParams(location.hash.split('?')[1] ?? '').get('nuevo') === '1'
  const [editing, setEditing] = useState<Exam | null>(initialNew ? blankExam(s.decks.map((d) => d.id)) : null)

  const plans = useMemo(
    () =>
      s.exams
        .map((e) => examPlan(s, e))
        .sort((a, b) => (a.daysLeft < 0 ? 1 : 0) - (b.daysLeft < 0 ? 1 : 0) || (a.daysLeft < 0 ? b.daysLeft - a.daysLeft : a.daysLeft - b.daysLeft)),
    [s.exams, s.questions, s.cards, s.answers],
  )

  return (
    <>
      <PageHeader
        title="Exámenes"
        subtitle="Agrega la fecha y prioridad de cada examen. El plan diario y FSRS se ajustan para que llegues con la mayor retención posible."
        actions={
          <Button variant="primary" onClick={() => setEditing(blankExam(s.decks.map((d) => d.id)))} disabled={!s.decks.length}>
            <CalendarPlus size={16} /> Nuevo examen
          </Button>
        }
      />

      {!s.decks.length ? (
        <Empty icon={<CalendarDays size={24} />} title="Primero importa un banco de preguntas" text="Los exámenes se construyen a partir de tus bancos (CSV)." action={<Button variant="primary" onClick={() => navigate('/banco')}>Ir al banco</Button>} />
      ) : !plans.length ? (
        <Empty
          icon={<CalendarDays size={24} />}
          title="Sin exámenes"
          text="Crea tu primer examen para recibir un plan de estudio con fecha límite."
          action={
            <Button variant="primary" onClick={() => setEditing(blankExam(s.decks.map((d) => d.id)))}>
              <CalendarPlus size={16} /> Nuevo examen
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {plans.map((p) => (
            <ExamCard key={p.exam.id} p={p} onEdit={() => setEditing(p.exam)} />
          ))}
        </div>
      )}

      <Card className="mt-6 flex gap-3 bg-brand-50/40 p-5 text-sm text-ink-2">
        <Info size={18} className="mt-0.5 shrink-0 text-brand-500" />
        <div className="space-y-1">
          <p>
            <b className="text-ink">Preparación proyectada</b>: probabilidad media (según FSRS) de recordar cada pregunta del examen el día del examen, si no estudiaras más. Las preguntas no vistas cuentan como 0.
          </p>
          <p>
            <b className="text-ink">Prioridad</b>: alta sube la retención objetivo (+3%) y sus preguntas van primero en la cola; baja la reduce (−3%). Si un repaso caería después del examen y tu retención ese día sería baja, FSRS lo adelanta a 1–3 días antes.
          </p>
        </div>
      </Card>

      {editing && <ExamEditor exam={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function ExamCard({ p, onEdit }: { p: ExamPlan; onEdit: () => void }) {
  const s = useStore()
  const st = STATUS_META[p.status]
  const past = p.daysLeft < 0
  const decks = s.decks.filter((d) => p.exam.deckIds.includes(d.id))
  const target = p.exam.targetScore / 100

  let advice: string
  if (past) advice = 'Examen presentado. Registra tu calificación real para compararla con tus simulacros.'
  else if (p.daysLeft === 0) advice = 'Hoy es el examen: haz un repaso ligero de tus marcadas y falladas, nada nuevo.'
  else if (p.unseen > 0)
    advice = `Ve ${p.newPerDay} preguntas nuevas al día para cubrir el temario antes del examen, más tus repasos diarios. ${
      p.daysLeft > 7 ? 'Haz un simulacro completo cada semana.' : 'Haz un simulacro cada 2 días.'
    }`
  else if (p.projected < target) advice = 'Ya viste todo el temario. Enfócate en repasos y simulacros de temas débiles para subir tu retención.'
  else advice = '¡Vas muy bien! Mantén tus repasos diarios y haz simulacros para practicar el tiempo.'

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        <Ring value={p.projected} size={112} stroke={10} color={st.color}>
          <span className="text-2xl font-semibold tnum">{Math.round(p.projected * 100)}%</span>
          <span className="text-[11px] text-ink-3">preparación</span>
        </Ring>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{p.exam.name}</h3>
            <PriorityBadge p={p.exam.priority} />
            <Badge tone={st.tone}>{st.label}</Badge>
          </div>
          <div className="mt-1 text-sm text-ink-2">
            {formatDate(parseDateKey(p.exam.date))} ·{' '}
            <b className="text-ink">
              {past ? `hace ${-p.daysLeft} días` : p.daysLeft === 0 ? 'hoy' : p.daysLeft === 1 ? 'mañana' : `faltan ${p.daysLeft} días`}
            </b>{' '}
            · meta {p.exam.targetScore}%
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {decks.map((d) => (
              <Badge key={d.id}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: d.color }} />
                {d.name}
              </Badge>
            ))}
            {p.exam.categories.length > 0 && <Badge tone="violet">{p.exam.categories.length} temas</Badge>}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Temario visto" value={`${p.seen}/${p.total}`} bar={p.total ? p.seen / p.total : 0} />
            <Metric label="Retención actual" value={pct(p.currentR)} hint="de lo ya visto" />
            <Metric label="Precisión 14 d" value={p.accuracy === null ? '—' : pct(p.accuracy)} hint={`${p.answeredRecent} respuestas`} />
            <Metric label="Nuevas / día" value={String(p.newPerDay)} hint={`${p.dueToday} repasos hoy`} />
          </div>
          <p className="mt-4 text-sm text-ink-2">{advice}</p>
          {p.exam.notes && <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-ink-2">{p.exam.notes}</p>}
          {past && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              Calificación real:
              <input
                type="number"
                min={0}
                max={100}
                className={fieldBase + ' w-24'}
                value={p.exam.realScore ?? ''}
                placeholder="—"
                onChange={(e) => s.saveExam({ ...p.exam, realScore: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-row gap-2 md:flex-col">
          {!past && (
            <>
              <Button variant="primary" onClick={() => navigate('/estudiar', { examen: p.exam.id, go: '1' })}>
                <Brain size={16} /> Estudiar
              </Button>
              <Button onClick={() => navigate('/simulacro', { examen: p.exam.id })}>
                <Timer size={16} /> Simulacro
              </Button>
            </>
          )}
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit} title="Editar">
              <Pencil size={15} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => confirm(`¿Eliminar el examen "${p.exam.name}"?`) && s.deleteExam(p.exam.id)} title="Eliminar">
              <Trash2 size={15} />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

function Metric({ label, value, hint, bar }: { label: string; value: string; hint?: string; bar?: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className="text-base font-semibold tnum">{value}</div>
      {bar !== undefined && <Progress value={bar} className="mt-1 h-1.5" />}
      {hint && <div className="text-[11px] text-ink-3">{hint}</div>}
    </div>
  )
}

function ExamEditor({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  const s = useStore()
  const [e, setE] = useState<Exam>(exam)
  const isNewExam = !s.exams.some((x) => x.id === exam.id)

  const topics = useMemo(() => {
    const m = new Map<string, Map<string, string>>()
    for (const q of Object.values(s.questions)) {
      if (!e.deckIds.includes(q.deckId)) continue
      if (!m.has(q.topic)) m.set(q.topic, new Map())
      m.get(q.topic)!.set(q.category, q.subtopic || q.category)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [s.questions, e.deckIds])

  const count = Object.values(s.questions).filter((q) => e.deckIds.includes(q.deckId) && (!e.categories.length || e.categories.includes(q.category))).length
  const valid = e.name.trim() && e.date && e.deckIds.length && count > 0

  const save = () => {
    if (!valid) return
    s.saveExam({ ...e, name: e.name.trim() })
    onClose()
    if (location.hash.includes('nuevo=1')) navigate('/examenes')
  }

  const toggleCat = (c: string) => setE({ ...e, categories: e.categories.includes(c) ? e.categories.filter((x) => x !== c) : [...e.categories, c] })

  return (
    <Modal open onClose={onClose} title={isNewExam ? 'Nuevo examen' : 'Editar examen'} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre">
          <input autoFocus className={inputCls} value={e.name} placeholder="Ej. Parcial Neuroanatomía" onChange={(x) => setE({ ...e, name: x.target.value })} />
        </Field>
        <Field label="Fecha">
          <input type="date" className={inputCls} value={e.date} onChange={(x) => setE({ ...e, date: x.target.value })} />
        </Field>
        <Field label="Prioridad">
          <Segmented<Priority>
            value={e.priority}
            onChange={(priority) => setE({ ...e, priority })}
            options={[
              { value: 'alta', label: 'Alta' },
              { value: 'media', label: 'Media' },
              { value: 'baja', label: 'Baja' },
            ]}
          />
        </Field>
        <Field label={`Calificación meta: ${e.targetScore}%`}>
          <input type="range" min={50} max={100} step={5} value={e.targetScore} className="mt-3 w-full" onChange={(x) => setE({ ...e, targetScore: Number(x.target.value) })} />
        </Field>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-sm font-medium">Bancos incluidos</div>
        <div className="flex flex-wrap gap-2">
          {s.decks.map((d) => (
            <Chip
              key={d.id}
              color={d.color}
              active={e.deckIds.includes(d.id)}
              onClick={() => setE({ ...e, deckIds: e.deckIds.includes(d.id) ? e.deckIds.filter((x) => x !== d.id) : [...e.deckIds, d.id] })}
            >
              {d.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">Temas que entran {e.categories.length ? `(${e.categories.length})` : '(todos)'}</span>
          {e.categories.length > 0 && (
            <button className="text-xs text-brand-600 hover:underline" onClick={() => setE({ ...e, categories: [] })}>
              Incluir todos
            </button>
          )}
        </div>
        <div className="scroll-thin max-h-56 space-y-3 overflow-y-auto rounded-2xl border border-line p-3">
          {topics.map(([topic, sub]) => {
            const list = [...sub.keys()]
            const all = list.every((c) => e.categories.includes(c))
            return (
              <div key={topic}>
                <button
                  className="mb-1.5 text-xs font-semibold text-ink-2 hover:text-brand-600"
                  onClick={() => setE({ ...e, categories: all ? e.categories.filter((c) => !list.includes(c)) : [...new Set([...e.categories, ...list])] })}
                >
                  {topic} {all ? '✓' : ''}
                </button>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((c) => (
                    <Chip key={c} active={e.categories.includes(c)} onClick={() => toggleCat(c)}>
                      <span className="text-xs">{sub.get(c)}</span>
                    </Chip>
                  ))}
                </div>
              </div>
            )
          })}
          {!topics.length && <p className="text-sm text-ink-3">Selecciona al menos un banco.</p>}
        </div>
      </div>

      <div className="mt-5">
        <Field label="Notas (opcional)">
          <textarea className={inputCls + ' h-20 py-2'} value={e.notes} placeholder="Aula, temario, profesor…" onChange={(x) => setE({ ...e, notes: x.target.value })} />
        </Field>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="text-sm text-ink-2">
          <b className="text-ink tnum">{count}</b> preguntas en este examen
        </span>
        <div className="flex gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save} disabled={!valid}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
