import { Check, Flag, X } from 'lucide-react'
import type { Question } from '../lib/types'
import { cx, LETTERS } from '../lib/utils'
import { useStore } from '../lib/store'
import { Badge } from './ui'

export function QuestionView({
  q,
  order,
  selected,
  revealed,
  onSelect,
  showExplanation = true,
}: {
  q: Question
  /** Orden de presentación: order[i] = índice original de la opción mostrada en posición i */
  order: number[]
  selected: number | null
  revealed: boolean
  onSelect?: (original: number) => void
  showExplanation?: boolean
}) {
  const deck = useStore((s) => s.decks.find((d) => d.id === q.deckId))
  const toggleFlag = useStore((s) => s.toggleFlag)
  const flagged = useStore((s) => s.questions[q.id]?.flagged)

  return (
    <div className="fade-in" key={q.id}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {deck && (
          <Badge>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: deck.color }} />
            {deck.name}
          </Badge>
        )}
        <Badge tone="brand">{q.topic}</Badge>
        {q.subtopic && <Badge tone="violet">{q.subtopic}</Badge>}
        <button
          onClick={() => toggleFlag(q.id)}
          className={cx(
            'ml-auto inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs transition',
            flagged ? 'bg-amber-50 text-amber-700' : 'text-ink-3 hover:bg-slate-100 hover:text-ink-2',
          )}
          title="Marcar para repasar (tecla M)"
        >
          <Flag size={14} fill={flagged ? 'currentColor' : 'none'} />
          {flagged ? 'Marcada' : 'Marcar'}
        </button>
      </div>

      <h2 className="text-lg leading-relaxed font-medium text-ink sm:text-xl">{q.text}</h2>

      <div className="mt-6 space-y-2.5">
        {order.map((orig, i) => {
          const isSel = selected === orig
          const isCorrect = orig === q.answer
          const state = revealed ? (isCorrect ? 'correct' : isSel ? 'wrong' : 'dim') : isSel ? 'selected' : 'idle'
          return (
            <button
              key={orig}
              disabled={!onSelect}
              onClick={() => onSelect?.(orig)}
              className={cx(
                'group flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-all',
                onSelect && 'cursor-pointer',
                state === 'idle' && 'border-line bg-white hover:border-brand-200 hover:bg-brand-50/40',
                state === 'selected' && 'border-brand-500 bg-brand-50 ring-4 ring-brand-100',
                state === 'correct' && 'border-emerald-300 bg-emerald-50',
                state === 'wrong' && 'border-rose-300 bg-rose-50',
                state === 'dim' && 'border-line bg-white opacity-60',
              )}
            >
              <span
                className={cx(
                  'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold',
                  state === 'idle' && 'bg-slate-100 text-ink-2 group-hover:bg-brand-100 group-hover:text-brand-700',
                  state === 'selected' && 'bg-brand-500 text-white',
                  state === 'correct' && 'bg-emerald-500 text-white',
                  state === 'wrong' && 'bg-rose-500 text-white',
                  state === 'dim' && 'bg-slate-100 text-ink-3',
                )}
              >
                {state === 'correct' ? <Check size={15} strokeWidth={3} /> : state === 'wrong' ? <X size={15} strokeWidth={3} /> : LETTERS[i]}
              </span>
              <span className="pt-0.5 text-[15px] leading-relaxed text-ink">{q.options[orig]}</span>
            </button>
          )
        })}
      </div>

      {revealed && showExplanation && (
        <div
          className={cx(
            'fade-in mt-5 rounded-2xl border p-4',
            selected === q.answer ? 'border-emerald-200 bg-emerald-50/60' : 'border-rose-200 bg-rose-50/60',
          )}
        >
          <div className={cx('mb-1.5 flex items-center gap-2 text-sm font-semibold', selected === q.answer ? 'text-emerald-700' : 'text-rose-700')}>
            {selected === null ? 'Sin responder' : selected === q.answer ? '¡Correcto!' : 'Incorrecto'}
            <span className="font-normal text-ink-2">
              · Respuesta: {LETTERS[order.indexOf(q.answer)]}) {q.options[q.answer]}
            </span>
          </div>
          {q.explanation && <p className="text-sm leading-relaxed text-ink-2">{q.explanation}</p>}
        </div>
      )}
    </div>
  )
}

export function makeOrder(q: Question, shuffleIt: boolean): number[] {
  const idx = q.options.map((_, i) => i)
  // No mezclar si hay opciones que dependen de su posición ("Todas las anteriores", "A y B"…)
  const positional = q.options.some((o) => /(todas|ninguna|ambas) (las|de las)? ?anteriores|^ambas|^[a-d] y [a-d]\b/i.test(o.trim()))
  if (!shuffleIt || positional) return idx
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx
}
