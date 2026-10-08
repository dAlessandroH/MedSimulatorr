import { ChevronDown, Download, FileUp, Flag, Library, Pause, Pencil, RotateCcw, Search, Trash2, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Badge, Button, Card, Empty, fieldBase, inputCls, PageHeader, Progress, SectionTitle } from '../components/ui'
import { toCsv } from '../lib/csv'
import { retrievability, STATE_LABEL, State } from '../lib/fsrs'
import { accuracyMap, lastAnswerMap } from '../lib/planner'
import { isNew, useStore, type ImportResult } from '../lib/store'
import type { Question } from '../lib/types'
import { cx, formatDate, formatInterval, LETTERS, normalize, pct } from '../lib/utils'

async function readFileText(f: File): Promise<string> {
  const buf = await f.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(buf)
  // CSV guardados desde Excel en Windows suelen venir en Windows-1252
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8
}

function download(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

type StateFilter = 'todas' | 'nuevas' | 'aprendiendo' | 'repaso' | 'falladas' | 'marcadas' | 'suspendidas'

export function Bank() {
  const s = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [target, setTarget] = useState<string>('auto')
  const [drag, setDrag] = useState(false)
  const [results, setResults] = useState<(ImportResult & { file: string })[]>([])

  const handleFiles = async (files: FileList | File[]) => {
    const out: (ImportResult & { file: string })[] = []
    for (const f of [...files]) {
      if (!/\.(csv|txt)$/i.test(f.name)) continue
      const text = await readFileText(f)
      const name = f.name.replace(/\.(csv|txt)$/i, '').trim()
      const st = useStore.getState()
      const existing = target === 'auto' ? st.decks.find((d) => normalize(d.name) === normalize(name))?.id : target === 'new' ? null : target
      out.push({ ...st.importCsv(text, name, existing ?? null), file: f.name })
    }
    setResults(out)
  }

  const deckStats = useMemo(() => {
    const acc = accuracyMap(s.answers)
    return s.decks.map((d) => {
      const qs = Object.values(s.questions).filter((q) => q.deckId === d.id)
      let seen = 0
      let c = 0
      let t = 0
      const cats = new Set<string>()
      for (const q of qs) {
        cats.add(q.category)
        if (!isNew(s.cards[q.id])) seen++
        const a = acc.get(q.id)
        if (a) {
          c += a.c
          t += a.t
        }
      }
      return { deck: d, total: qs.length, seen, acc: t ? c / t : null, cats: cats.size, qs }
    })
  }, [s.decks, s.questions, s.cards, s.answers])

  return (
    <>
      <PageHeader title="Banco de preguntas" subtitle="Importa tus CSV. Si vuelves a importar el mismo archivo, las preguntas se actualizan sin perder tu progreso." />

      <Card
        className={cx('border-2 border-dashed p-8 text-center transition', drag ? 'border-brand-500 bg-brand-50/60' : 'border-line')}
      >
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            handleFiles(e.dataTransfer.files)
          }}
        >
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
            <FileUp size={26} />
          </div>
          <div className="font-semibold">Arrastra tus archivos CSV aquí</div>
          <p className="mt-1 text-sm text-ink-2">
            Columnas: <code className="rounded bg-slate-100 px-1 text-xs">pregunta, opcion_a, opcion_b, opcion_c, opcion_d, respuesta, categoria, explicacion</code>
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <select className={fieldBase + ' w-auto'} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="auto">Banco según nombre del archivo</option>
              <option value="new">Siempre crear banco nuevo</option>
              {s.decks.map((d) => (
                <option key={d.id} value={d.id}>
                  Agregar a: {d.name}
                </option>
              ))}
            </select>
            <Button variant="primary" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Elegir archivos
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.txt"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      </Card>

      {results.length > 0 && (
        <div className="mt-4 space-y-2">
          {results.map((r, i) => (
            <Card key={i} className={cx('p-4 text-sm', r.added + r.updated === 0 ? 'border-rose-200 bg-rose-50/50' : 'border-emerald-200 bg-emerald-50/50')}>
              <div className="font-medium">
                {r.file}: {r.added} nuevas, {r.updated} actualizadas
              </div>
              {r.errors.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-rose-700">
                  {r.errors.slice(0, 6).map((e, k) => (
                    <li key={k}>{e}</li>
                  ))}
                  {r.errors.length > 6 && <li>…y {r.errors.length - 6} más</li>}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {s.decks.length === 0 ? (
        <div className="mt-6">
          <Empty icon={<Library size={24} />} title="Aún no hay bancos" text="Importa tu primer CSV para empezar a practicar." />
        </div>
      ) : (
        <>
          <div className="mt-8">
            <SectionTitle>Bancos ({s.decks.length})</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {deckStats.map(({ deck, total, seen, acc, cats, qs }) => (
                <Card key={deck.id} className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: deck.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{deck.name}</div>
                      <div className="text-xs text-ink-3">
                        {total} preguntas · {cats} temas · {formatDate(deck.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs text-ink-2">
                      <span>Vistas</span>
                      <span className="tnum">
                        {seen}/{total}
                      </span>
                    </div>
                    <Progress value={total ? seen / total : 0} />
                    <div className="mt-2 text-xs text-ink-2">Precisión: <b className="text-ink">{acc === null ? '—' : pct(acc)}</b></div>
                  </div>
                  <div className="mt-4 flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Renombrar"
                      onClick={() => {
                        const n = prompt('Nuevo nombre del banco', deck.name)
                        if (n?.trim()) s.renameDeck(deck.id, n.trim())
                      }}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" title="Exportar CSV" onClick={() => download(`${deck.name}.csv`, toCsv(qs))}>
                      <Download size={14} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto hover:text-rose-600"
                      title="Eliminar banco"
                      onClick={() => confirm(`¿Eliminar "${deck.name}" con sus ${total} preguntas y todo su progreso? No se puede deshacer.`) && s.deleteDeck(deck.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
          <QuestionBrowser />
        </>
      )}
    </>
  )
}

const PAGE = 40

function QuestionBrowser() {
  const s = useStore()
  const [query, setQuery] = useState('')
  const [deck, setDeck] = useState('')
  const [topic, setTopic] = useState('')
  const [state, setState] = useState<StateFilter>('todas')
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState<string | null>(null)

  const topics = useMemo(() => [...new Set(Object.values(s.questions).map((q) => q.topic))].sort(), [s.questions])
  const last = useMemo(() => lastAnswerMap(s.answers), [s.answers])
  const acc = useMemo(() => accuracyMap(s.answers), [s.answers])

  const list = useMemo(() => {
    const nq = normalize(query)
    return Object.values(s.questions)
      .filter((q) => {
        if (deck && q.deckId !== deck) return false
        if (topic && q.topic !== topic) return false
        if (nq && !normalize(q.text + ' ' + q.category + ' ' + q.options.join(' ')).includes(nq)) return false
        const c = s.cards[q.id]
        switch (state) {
          case 'nuevas':
            return isNew(c)
          case 'aprendiendo':
            return !!c && (c.state === State.Learning || c.state === State.Relearning)
          case 'repaso':
            return !!c && c.state === State.Review
          case 'falladas':
            return last.get(q.id)?.correct === false
          case 'marcadas':
            return !!q.flagged
          case 'suspendidas':
            return !!q.suspended
        }
        return true
      })
      .sort((a, b) => a.createdAt - b.createdAt)
  }, [s.questions, s.cards, query, deck, topic, state, last])

  return (
    <div className="mt-10">
      <SectionTitle>Explorar preguntas</SectionTitle>
      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
            <input className={inputCls + ' pl-9'} placeholder="Buscar en preguntas, opciones o temas…" value={query} onChange={(e) => (setQuery(e.target.value), setLimit(PAGE))} />
          </div>
          <select className={fieldBase + ' w-auto'} value={deck} onChange={(e) => setDeck(e.target.value)}>
            <option value="">Todos los bancos</option>
            {s.decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select className={fieldBase + ' w-auto'} value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">Todos los temas</option>
            {topics.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select className={fieldBase + ' w-auto'} value={state} onChange={(e) => setState(e.target.value as StateFilter)}>
            <option value="todas">Todos los estados</option>
            <option value="nuevas">Nuevas</option>
            <option value="aprendiendo">Aprendiendo</option>
            <option value="repaso">En repaso</option>
            <option value="falladas">Última vez falladas</option>
            <option value="marcadas">Marcadas</option>
            <option value="suspendidas">Suspendidas</option>
          </select>
        </div>
        <div className="mt-3 text-xs text-ink-3">{list.length} preguntas</div>
      </Card>

      <div className="mt-3 space-y-2">
        {list.slice(0, limit).map((q) => (
          <QuestionRow key={q.id} q={q} open={open === q.id} onToggle={() => setOpen(open === q.id ? null : q.id)} acc={acc.get(q.id)} />
        ))}
      </div>
      {list.length > limit && (
        <div className="mt-4 text-center">
          <Button onClick={() => setLimit(limit + PAGE)}>Mostrar más ({list.length - limit} restantes)</Button>
        </div>
      )}
    </div>
  )
}

function QuestionRow({ q, open, onToggle, acc }: { q: Question; open: boolean; onToggle: () => void; acc?: { c: number; t: number } }) {
  const s = useStore()
  const c = s.cards[q.id]
  const now = Date.now()
  const r = retrievability(c, now)
  return (
    <Card className={cx('overflow-hidden', q.suspended && 'opacity-60')}>
      <button className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left hover:bg-slate-50/60" onClick={onToggle}>
        <div className="min-w-0 flex-1">
          <div className={cx('text-sm text-ink', !open && 'line-clamp-2')}>{q.text}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="brand">{q.topic}</Badge>
            {q.subtopic && <span className="text-xs text-ink-3">{q.subtopic}</span>}
            {q.flagged && (
              <Badge tone="amber">
                <Flag size={10} fill="currentColor" /> Marcada
              </Badge>
            )}
            {q.suspended && <Badge>Suspendida</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={isNew(c) ? 'violet' : c!.state === State.Review ? 'sky' : 'red'}>{STATE_LABEL[c?.state ?? State.New]}</Badge>
          {acc && (
            <span className="text-[11px] text-ink-3 tnum">
              {acc.c}/{acc.t} ✓
            </span>
          )}
        </div>
        <ChevronDown size={16} className={cx('mt-1 shrink-0 text-ink-3 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-line bg-slate-50/50 px-4 py-4">
          <ol className="space-y-1.5">
            {q.options.map((o, i) => (
              <li key={i} className={cx('flex gap-2 rounded-xl px-3 py-1.5 text-sm', i === q.answer ? 'bg-emerald-50 text-emerald-800' : 'text-ink-2')}>
                <b>{LETTERS[i]})</b> {o}
              </li>
            ))}
          </ol>
          {q.explanation && <p className="mt-3 text-sm leading-relaxed text-ink-2">{q.explanation}</p>}
          {c && !isNew(c) && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
              <Info label="Próximo repaso" value={c.due <= now ? 'Pendiente' : `en ${formatInterval(c.due - now)}`} />
              <Info label="Retención hoy" value={pct(r)} />
              <Info label="Estabilidad" value={`${c.stability.toFixed(1)} d`} />
              <Info label="Dificultad" value={`${c.difficulty.toFixed(1)}/10`} />
              <Info label="Repasos / olvidos" value={`${c.reps} / ${c.lapses}`} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant={q.flagged ? 'soft' : 'secondary'} onClick={() => s.toggleFlag(q.id)}>
              <Flag size={14} /> {q.flagged ? 'Desmarcar' : 'Marcar'}
            </Button>
            <Button size="sm" onClick={() => s.toggleSuspend(q.id)}>
              <Pause size={14} /> {q.suspended ? 'Reactivar' : 'Suspender'}
            </Button>
            {c && (
              <Button size="sm" variant="danger" onClick={() => confirm('¿Reiniciar el progreso FSRS de esta pregunta?') && s.resetCard(q.id)}>
                <RotateCcw size={14} /> Reiniciar
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-2.5 py-1.5">
      <div className="text-ink-3">{label}</div>
      <div className="font-semibold text-ink tnum">{value}</div>
    </div>
  )
}

export { download }
