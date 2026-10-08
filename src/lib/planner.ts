import { retrievability, State } from './fsrs'
import { examForQuestion, examIncludes, isNew, type AppState } from './store'
import type { Answer, Exam, Question, SimConfig, StoredCard } from './types'
import { DAY, dayKey, daysUntil, parseDateKey, shuffle, startOfDay } from './utils'

type Data = Pick<AppState, 'questions' | 'cards' | 'answers' | 'exams' | 'settings' | 'decks'>

export interface Scope {
  deckIds?: string[] | null
  categories?: string[] | null
  examId?: string | null
}

const PRIORITY_RANK = { alta: 0, media: 1, baja: 2 } as const

export function questionsInScope(d: Data, scope: Scope = {}, includeSuspended = false): Question[] {
  const exam = scope.examId ? d.exams.find((e) => e.id === scope.examId) : null
  const decks = scope.deckIds?.length ? new Set(scope.deckIds) : null
  const cats = scope.categories?.length ? new Set(scope.categories) : null
  return Object.values(d.questions)
    .filter(
      (q) =>
        (includeSuspended || !q.suspended) &&
        (!exam || examIncludes(exam, q)) &&
        (!decks || decks.has(q.deckId)) &&
        (!cats || cats.has(q.category)),
    )
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function examQuestions(d: Data, exam: Exam): Question[] {
  return questionsInScope(d, { examId: exam.id })
}

export function upcomingExams(exams: Exam[], now = Date.now()): Exam[] {
  return exams
    .filter((e) => daysUntil(e.date, now) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
}

/** Preguntas nuevas introducidas hoy (en cualquier modo que actualice FSRS) */
export function newIntroducedToday(answers: Answer[], now = Date.now()): number {
  const t0 = startOfDay(now)
  const set = new Set<string>()
  for (let i = answers.length - 1; i >= 0; i--) {
    const a = answers[i]
    if (a.ts < t0) break
    if (a.stateBefore === State.New && a.rating !== null) set.add(a.qid)
  }
  return set.size
}

export function answersToday(answers: Answer[], now = Date.now()): Answer[] {
  const t0 = startOfDay(now)
  const out: Answer[] = []
  for (let i = answers.length - 1; i >= 0; i--) {
    if (answers[i].ts < t0) break
    out.push(answers[i])
  }
  return out
}

function isDue(c: StoredCard | undefined, now: number): boolean {
  if (!c || c.state === State.New) return false
  if (c.state === State.Review) return c.due <= startOfDay(now) + DAY - 1
  return c.due <= now + 20 * 60_000
}

export interface ExamPlan {
  exam: Exam
  daysLeft: number
  total: number
  seen: number
  unseen: number
  /** Nuevas por día necesarias para cubrir todo el temario un día antes */
  newPerDay: number
  dueToday: number
  /** Retención media proyectada el día del examen (no vistas cuentan 0) */
  projected: number
  /** Retención media actual de las preguntas vistas */
  currentR: number
  accuracy: number | null
  answeredRecent: number
  status: 'listo' | 'en-camino' | 'riesgo' | 'pasado'
}

export function examPlan(d: Data, exam: Exam, now = Date.now()): ExamPlan {
  const qs = examQuestions(d, exam)
  const daysLeft = daysUntil(exam.date, now)
  const examTs = parseDateKey(exam.date) + 8 * 3600_000
  let seen = 0
  let sumProj = 0
  let sumCur = 0
  let dueToday = 0
  const ids = new Set<string>()
  for (const q of qs) {
    ids.add(q.id)
    const c = d.cards[q.id]
    if (isNew(c)) continue
    seen++
    sumProj += retrievability(c, examTs)
    sumCur += retrievability(c, now)
    if (isDue(c, now)) dueToday++
  }
  const since = now - 14 * DAY
  let rc = 0
  let rt = 0
  for (let i = d.answers.length - 1; i >= 0; i--) {
    const a = d.answers[i]
    if (a.ts < since) break
    if (!ids.has(a.qid)) continue
    rt++
    if (a.correct) rc++
  }
  const unseen = qs.length - seen
  const projected = qs.length ? sumProj / qs.length : 0
  const target = exam.targetScore / 100
  return {
    exam,
    daysLeft,
    total: qs.length,
    seen,
    unseen,
    newPerDay: daysLeft < 0 ? 0 : Math.ceil(unseen / Math.max(1, daysLeft - 1)),
    dueToday,
    projected,
    currentR: seen ? sumCur / seen : 0,
    accuracy: rt ? rc / rt : null,
    answeredRecent: rt,
    status: daysLeft < 0 ? 'pasado' : projected >= target ? 'listo' : projected >= target * 0.75 ? 'en-camino' : 'riesgo',
  }
}

export interface DailyPlan {
  dueNow: number
  newLimit: number
  newDone: number
  newRemaining: number
  answeredToday: number
  correctToday: number
  /** Nuevas/día exigidas por los exámenes (sin solaparse) */
  examNewDemand: number
}

/** Límite diario de nuevas: el mayor entre el ajuste y lo que exigen los exámenes próximos. */
export function dailyPlan(d: Data, now = Date.now()): DailyPlan {
  const upcoming = upcomingExams(d.exams, now)
  const unseenByExam = new Map<string, number>()
  let dueNow = 0
  let unseen = 0
  for (const q of Object.values(d.questions)) {
    if (q.suspended) continue
    const c = d.cards[q.id]
    if (isDue(c, now)) dueNow++
    if (isNew(c)) unseen++
    if (isNew(c) && upcoming.length) {
      const e = examForQuestion(upcoming, q, now)
      if (e) unseenByExam.set(e.id, (unseenByExam.get(e.id) ?? 0) + 1)
    }
  }
  let examNewDemand = 0
  for (const e of upcoming) {
    const u = unseenByExam.get(e.id) ?? 0
    if (u) examNewDemand += Math.ceil(u / Math.max(1, daysUntil(e.date, now) - 1))
  }
  const newLimit = Math.max(d.settings.newPerDay, examNewDemand)
  const newDone = newIntroducedToday(d.answers, now)
  const today = answersToday(d.answers, now)
  return {
    dueNow,
    newLimit,
    newDone,
    newRemaining: Math.min(unseen, Math.max(0, newLimit - newDone)),
    answeredToday: today.length,
    correctToday: today.filter((a) => a.correct).length,
    examNewDemand,
  }
}

function urgency(d: Data, q: Question, now: number): [number, number] {
  const e = examForQuestion(d.exams, q, now)
  if (!e) return [9999, 3]
  return [daysUntil(e.date, now), PRIORITY_RANK[e.priority]]
}

export interface StudyQueue {
  learning: string[]
  review: string[]
  fresh: string[]
  newAvailable: number
}

export function buildStudyQueue(d: Data, scope: Scope, newLimit: number, now = Date.now()): StudyQueue {
  const pool = questionsInScope(d, scope)
  const learning: Question[] = []
  const review: { q: Question; u: [number, number]; r: number }[] = []
  const fresh: { q: Question; u: [number, number] }[] = []
  for (const q of pool) {
    const c = d.cards[q.id]
    if (isNew(c)) fresh.push({ q, u: urgency(d, q, now) })
    else if (isDue(c, now)) {
      if (c!.state === State.Review) review.push({ q, u: urgency(d, q, now), r: retrievability(c, now) })
      else learning.push(q)
    }
  }
  learning.sort((a, b) => d.cards[a.id].due - d.cards[b.id].due)
  review.sort((a, b) => a.u[0] - b.u[0] || a.u[1] - b.u[1] || a.r - b.r)
  fresh.sort((a, b) => a.u[0] - b.u[0] || a.u[1] - b.u[1] || a.q.createdAt - b.q.createdAt)
  return {
    learning: learning.map((q) => q.id),
    review: review.map((x) => x.q.id),
    fresh: fresh.slice(0, Math.max(0, newLimit)).map((x) => x.q.id),
    newAvailable: fresh.length,
  }
}

/** Intercala nuevas entre repasos de forma uniforme, con las de aprendizaje al inicio. */
export function interleave(q: StudyQueue): string[] {
  const out = [...q.learning]
  const { review, fresh } = q
  if (!review.length) return out.concat(fresh)
  if (!fresh.length) return out.concat(review)
  const total = review.length + fresh.length
  let ri = 0
  let fi = 0
  for (let i = 0; i < total; i++) {
    const wantFresh = fi < Math.floor(((i + 1) * fresh.length) / total)
    if ((wantFresh && fi < fresh.length) || ri >= review.length) out.push(fresh[fi++])
    else out.push(review[ri++])
  }
  return out
}

/** Preguntas vistas con menor retención actual (para repasar por adelantado). */
export function weakestSeen(d: Data, scope: Scope, n: number, exclude: Set<string>, now = Date.now()): string[] {
  return questionsInScope(d, scope)
    .filter((q) => !isNew(d.cards[q.id]) && !exclude.has(q.id))
    .map((q) => ({ id: q.id, r: retrievability(d.cards[q.id], now) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, n)
    .map((x) => x.id)
}

export function lastAnswerMap(answers: Answer[]): Map<string, Answer> {
  const m = new Map<string, Answer>()
  for (const a of answers) m.set(a.qid, a)
  return m
}

export function accuracyMap(answers: Answer[]): Map<string, { c: number; t: number }> {
  const m = new Map<string, { c: number; t: number }>()
  for (const a of answers) {
    const x = m.get(a.qid) ?? { c: 0, t: 0 }
    x.t++
    if (a.correct) x.c++
    m.set(a.qid, x)
  }
  return m
}

export function selectSimQuestions(d: Data, cfg: SimConfig, now = Date.now()): string[] {
  const pool = questionsInScope(d, { deckIds: cfg.deckIds, categories: cfg.categories, examId: cfg.examId })
  let list: Question[]
  switch (cfg.order) {
    case 'debiles': {
      const acc = accuracyMap(d.answers)
      list = pool
        .map((q) => {
          const c = d.cards[q.id]
          const a = acc.get(q.id)
          const r = isNew(c) ? 0.45 : retrievability(c, now)
          const accu = a ? a.c / a.t : 0.5
          return { q, score: (1 - r) * 0.6 + (1 - accu) * 0.4 + Math.random() * 0.08 }
        })
        .sort((a, b) => b.score - a.score)
        .map((x) => x.q)
      break
    }
    case 'falladas': {
      const last = lastAnswerMap(d.answers)
      list = shuffle(pool.filter((q) => last.get(q.id)?.correct === false))
      break
    }
    case 'nuevas': {
      const answered = new Set(d.answers.map((a) => a.qid))
      list = shuffle(pool.filter((q) => !answered.has(q.id)))
      break
    }
    case 'marcadas':
      list = shuffle(pool.filter((q) => q.flagged))
      break
    default:
      list = shuffle(pool)
  }
  return list.slice(0, cfg.count).map((q) => q.id)
}

export interface CategoryStat {
  category: string
  topic: string
  subtopic: string
  total: number
  seen: number
  answered: number
  correct: number
  accuracy: number | null
  avgR: number
}

export function categoryStats(d: Data, qs: Question[], now = Date.now()): CategoryStat[] {
  const acc = accuracyMap(d.answers)
  const map = new Map<string, CategoryStat & { sumR: number }>()
  for (const q of qs) {
    let s = map.get(q.category)
    if (!s) {
      s = {
        category: q.category,
        topic: q.topic,
        subtopic: q.subtopic,
        total: 0,
        seen: 0,
        answered: 0,
        correct: 0,
        accuracy: null,
        avgR: 0,
        sumR: 0,
      }
      map.set(q.category, s)
    }
    s.total++
    const c = d.cards[q.id]
    if (!isNew(c)) {
      s.seen++
      s.sumR += retrievability(c, now)
    }
    const a = acc.get(q.id)
    if (a) {
      s.answered += a.t
      s.correct += a.c
    }
  }
  return [...map.values()].map(({ sumR, ...s }) => ({
    ...s,
    accuracy: s.answered ? s.correct / s.answered : null,
    avgR: s.total ? sumR / s.total : 0,
  }))
}

export function dailySeries(answers: Answer[], days: number, qids?: Set<string>, now = Date.now()) {
  const t0 = startOfDay(now) - (days - 1) * DAY
  const map = new Map<string, { count: number; correct: number; timeMs: number }>()
  for (let i = 0; i < days; i++) map.set(dayKey(t0 + i * DAY), { count: 0, correct: 0, timeMs: 0 })
  for (const a of answers) {
    if (a.ts < t0) continue
    if (qids && !qids.has(a.qid)) continue
    const x = map.get(dayKey(a.ts))
    if (!x) continue
    x.count++
    x.timeMs += a.timeMs
    if (a.correct) x.correct++
  }
  return [...map.entries()].map(([day, v], i) => ({ day, ts: t0 + i * DAY, ...v }))
}

export function forecast(d: Data, qs: Question[], days: number, now = Date.now()) {
  const t0 = startOfDay(now)
  const arr = Array.from({ length: days }, (_, i) => ({ ts: t0 + i * DAY, count: 0 }))
  for (const q of qs) {
    const c = d.cards[q.id]
    if (isNew(c)) continue
    const idx = Math.max(0, Math.floor((c!.due - t0) / DAY))
    if (idx < days) arr[idx].count++
  }
  return arr
}

export function streak(answers: Answer[], now = Date.now()): number {
  const days = new Set(answers.map((a) => dayKey(a.ts)))
  let n = 0
  let t = startOfDay(now)
  if (!days.has(dayKey(t))) t -= DAY
  while (days.has(dayKey(t))) {
    n++
    t -= DAY
  }
  return n
}
