import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type FSRS,
  type Grade,
} from 'ts-fsrs'
import type { Exam, Priority, StoredCard } from './types'
import { clamp, DAY, hash, parseDateKey, startOfDay } from './utils'

export { Rating, State }
export type { Grade }

const schedulers = new Map<string, FSRS>()

function scheduler(retention: number, maxInterval: number): FSRS {
  const key = `${retention.toFixed(3)}|${maxInterval}`
  let f = schedulers.get(key)
  if (!f) {
    f = fsrs(
      generatorParameters({
        request_retention: retention,
        maximum_interval: maxInterval,
        enable_fuzz: true,
        enable_short_term: true,
      }),
    )
    schedulers.set(key, f)
  }
  return f
}

const base = () => scheduler(0.9, 36500)

export function toCard(s: StoredCard): Card {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  }
}

export function fromCard(c: Card): StoredCard {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.getTime() : null,
  }
}

export function emptyCard(now = Date.now()): StoredCard {
  return fromCard(createEmptyCard(new Date(now)))
}

/** Probabilidad (0-1) de recordar la tarjeta en el instante `at` si no se vuelve a estudiar. */
export function retrievability(card: StoredCard | undefined, at = Date.now()): number {
  if (!card || card.state === State.New || !card.last_review) return 0
  return base().get_retrievability(toCard(card), new Date(Math.max(at, card.last_review)), false)
}

export function priorityRetention(base: number, p: Priority): number {
  const delta = p === 'alta' ? 0.03 : p === 'baja' ? -0.03 : 0
  return clamp(base + delta, 0.7, 0.97)
}

export interface ScheduleCtx {
  retention: number
  maxInterval: number
  examAware: boolean
  /** Examen más próximo que incluye la pregunta */
  exam?: Pick<Exam, 'date' | 'priority'> | null
  seed: string
}

/**
 * Programa la siguiente revisión con FSRS. Si la pregunta pertenece a un examen próximo y
 * el intervalo cae después del examen con una retención proyectada menor a la objetivo,
 * adelanta la revisión a 1–3 días antes del examen (repaso final).
 */
export function schedule(stored: StoredCard, grade: Grade, at: number, ctx: ScheduleCtx): StoredCard {
  // Si el reloj del sistema retrocede, FSRS rechazaría un intervalo negativo
  const now = Math.max(at, stored.last_review ?? 0)
  const retention = ctx.exam ? priorityRetention(ctx.retention, ctx.exam.priority) : ctx.retention
  const f = scheduler(retention, ctx.maxInterval)
  const { card } = f.next(toCard(stored), new Date(now), grade)
  let out = fromCard(card)

  if (ctx.examAware && ctx.exam && out.state === State.Review) {
    const examTs = parseDateKey(ctx.exam.date)
    const today = startOfDay(now)
    const daysLeft = Math.round((examTs - today) / DAY)
    if (daysLeft >= 3 && out.due >= examTs - DAY) {
      const rAtExam = f.get_retrievability(card, new Date(examTs), false)
      if (rAtExam < retention) {
        const spread = Math.min(3, daysLeft - 1)
        const back = 1 + (parseInt(hash(ctx.seed + grade), 36) % spread)
        const due = Math.max(today + DAY, examTs - back * DAY) + 6 * 3600_000
        out = { ...out, due, scheduled_days: Math.max(1, Math.round((due - now) / DAY)) }
      }
    }
  }
  return out
}

export function previewIntervals(stored: StoredCard, now: number, ctx: ScheduleCtx): Record<Grade, number> {
  const grades: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]
  const out = {} as Record<Grade, number>
  for (const g of grades) out[g] = schedule(stored, g, now, ctx).due - now
  return out
}

export const STATE_LABEL: Record<State, string> = {
  [State.New]: 'Nueva',
  [State.Learning]: 'Aprendiendo',
  [State.Review]: 'Repaso',
  [State.Relearning]: 'Reaprendiendo',
}

export const RATING_LABEL: Record<Grade, string> = {
  [Rating.Again]: 'Otra vez',
  [Rating.Hard]: 'Difícil',
  [Rating.Good]: 'Bien',
  [Rating.Easy]: 'Fácil',
}
