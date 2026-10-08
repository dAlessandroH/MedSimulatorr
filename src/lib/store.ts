import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { del, get, set } from 'idb-keyval'
import { parseCsv, questionId } from './csv'
import { emptyCard, Rating, schedule, State, type Grade } from './fsrs'
import type {
  Answer,
  AnswerMode,
  Deck,
  Exam,
  PersistedData,
  Question,
  Settings,
  SimResult,
  StoredCard,
} from './types'
import { daysUntil, uid } from './utils'

export const DECK_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316']

export const DEFAULT_SETTINGS: Settings = {
  retention: 0.9,
  newPerDay: 20,
  maxInterval: 365,
  shuffleOptions: true,
  simUpdatesFsrs: true,
  examAware: true,
  dailyGoal: 50,
}

const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: async (name, value) => set(name, value),
  removeItem: async (name) => del(name),
}

export interface ImportResult {
  deckId: string
  added: number
  updated: number
  errors: string[]
}

export interface UndoInfo {
  qid: string
  prevCard: StoredCard | undefined
  answerId: string
}

interface Actions {
  importCsv(text: string, deckName: string, targetDeckId?: string | null): ImportResult
  renameDeck(id: string, name: string): void
  deleteDeck(id: string): void
  answer(input: {
    qid: string
    chosen: number
    timeMs: number
    mode: AnswerMode
    grade: Grade | null
    now?: number
  }): UndoInfo
  undo(info: UndoInfo): void
  saveSim(sim: SimResult, times: number[]): void
  deleteSim(id: string): void
  saveExam(exam: Exam): void
  deleteExam(id: string): void
  toggleFlag(qid: string): void
  toggleSuspend(qid: string): void
  resetCard(qid: string): void
  updateSettings(patch: Partial<Settings>): void
  replaceAll(data: PersistedData): void
  resetAll(): void
}

export type AppState = PersistedData & Actions & { hydrated: boolean }

const EMPTY: PersistedData = {
  decks: [],
  questions: {},
  cards: {},
  answers: [],
  exams: [],
  sims: [],
  settings: DEFAULT_SETTINGS,
}

/** Examen próximo más cercano (y de mayor prioridad en empate) que incluye la pregunta */
export function examForQuestion(exams: Exam[], q: Question, now = Date.now()): Exam | null {
  let best: Exam | null = null
  let bestDays = Infinity
  const rank = { alta: 0, media: 1, baja: 2 }
  for (const e of exams) {
    const d = daysUntil(e.date, now)
    if (d < 0) continue
    if (!examIncludes(e, q)) continue
    if (d < bestDays || (d === bestDays && best && rank[e.priority] < rank[best.priority])) {
      best = e
      bestDays = d
    }
  }
  return best
}

export function examIncludes(e: Exam, q: Question) {
  return e.deckIds.includes(q.deckId) && (e.categories.length === 0 || e.categories.includes(q.category))
}

export const useStore = create<AppState>()(
  persist(
    (setState, getState) => ({
      ...EMPTY,
      hydrated: false,

      importCsv(text, deckName, targetDeckId) {
        const { questions: parsed, errors } = parseCsv(text)
        const s = getState()
        let deck = targetDeckId ? s.decks.find((d) => d.id === targetDeckId) : undefined
        const decks = s.decks.slice()
        if (!deck) {
          deck = {
            id: uid(),
            name: deckName.trim() || 'Banco sin nombre',
            color: DECK_COLORS[decks.length % DECK_COLORS.length],
            createdAt: Date.now(),
          } satisfies Deck
          decks.push(deck)
        }
        const questions = { ...s.questions }
        let added = 0
        let updated = 0
        const base = Date.now()
        parsed.forEach((p, i) => {
          const id = questionId(deck!.id, p.text)
          const prev = questions[id]
          if (prev) {
            questions[id] = { ...prev, ...p }
            updated++
          } else {
            questions[id] = { ...p, id, deckId: deck!.id, createdAt: base + i }
            added++
          }
        })
        setState({ decks, questions })
        return { deckId: deck.id, added, updated, errors }
      },

      renameDeck(id, name) {
        setState((s) => ({ decks: s.decks.map((d) => (d.id === id ? { ...d, name } : d)) }))
      },

      deleteDeck(id) {
        setState((s) => {
          const questions = { ...s.questions }
          const cards = { ...s.cards }
          const removed = new Set<string>()
          for (const q of Object.values(questions)) {
            if (q.deckId === id) {
              removed.add(q.id)
              delete questions[q.id]
              delete cards[q.id]
            }
          }
          return {
            decks: s.decks.filter((d) => d.id !== id),
            questions,
            cards,
            answers: s.answers.filter((a) => !removed.has(a.qid)),
            exams: s.exams.map((e) => ({ ...e, deckIds: e.deckIds.filter((d) => d !== id) })),
          }
        })
      },

      answer({ qid, chosen, timeMs, mode, grade, now = Date.now() }) {
        const s = getState()
        const q = s.questions[qid]
        const prevCard = s.cards[qid]
        const current = prevCard ?? emptyCard(now)
        const correct = chosen === q.answer
        const entry: Answer = {
          id: uid(),
          qid,
          ts: now,
          correct,
          chosen,
          rating: grade,
          timeMs,
          mode,
          stateBefore: current.state,
        }
        const patch: Partial<PersistedData> = { answers: [...s.answers, entry] }
        if (grade !== null) {
          const next = schedule(current, grade, now, {
            retention: s.settings.retention,
            maxInterval: s.settings.maxInterval,
            examAware: s.settings.examAware,
            exam: examForQuestion(s.exams, q, now),
            seed: qid,
          })
          patch.cards = { ...s.cards, [qid]: next }
        }
        setState(patch)
        return { qid, prevCard, answerId: entry.id }
      },

      undo({ qid, prevCard, answerId }) {
        setState((s) => {
          const cards = { ...s.cards }
          if (prevCard) cards[qid] = prevCard
          else delete cards[qid]
          return { cards, answers: s.answers.filter((a) => a.id !== answerId) }
        })
      },

      saveSim(sim, times) {
        const s = getState()
        const now = sim.ts
        const answers = s.answers.slice()
        const cards = { ...s.cards }
        sim.questionIds.forEach((qid, i) => {
          const chosen = sim.answers[i]
          const q = s.questions[qid]
          if (chosen === null || !q) return
          const current = cards[qid] ?? emptyCard(now)
          const correct = chosen === q.answer
          const grade: Grade | null = s.settings.simUpdatesFsrs ? (correct ? Rating.Good : Rating.Again) : null
          answers.push({
            id: uid(),
            qid,
            ts: now + i,
            correct,
            chosen,
            rating: grade,
            timeMs: times[i] ?? 0,
            mode: 'simulacro',
            stateBefore: current.state,
          })
          if (grade !== null) {
            cards[qid] = schedule(current, grade, now, {
              retention: s.settings.retention,
              maxInterval: s.settings.maxInterval,
              examAware: s.settings.examAware,
              exam: examForQuestion(s.exams, q, now),
              seed: qid,
            })
          }
        })
        setState({ sims: [...s.sims, sim], answers, cards })
      },

      deleteSim(id) {
        setState((s) => ({ sims: s.sims.filter((x) => x.id !== id) }))
      },

      saveExam(exam) {
        setState((s) => {
          const exists = s.exams.some((e) => e.id === exam.id)
          return { exams: exists ? s.exams.map((e) => (e.id === exam.id ? exam : e)) : [...s.exams, exam] }
        })
      },

      deleteExam(id) {
        setState((s) => ({ exams: s.exams.filter((e) => e.id !== id) }))
      },

      toggleFlag(qid) {
        setState((s) => ({
          questions: { ...s.questions, [qid]: { ...s.questions[qid], flagged: !s.questions[qid].flagged } },
        }))
      },

      toggleSuspend(qid) {
        setState((s) => ({
          questions: { ...s.questions, [qid]: { ...s.questions[qid], suspended: !s.questions[qid].suspended } },
        }))
      },

      resetCard(qid) {
        setState((s) => {
          const cards = { ...s.cards }
          delete cards[qid]
          return { cards }
        })
      },

      updateSettings(patch) {
        setState((s) => ({ settings: { ...s.settings, ...patch } }))
      },

      replaceAll(data) {
        setState({ ...EMPTY, ...data, settings: { ...DEFAULT_SETTINGS, ...data.settings } })
      },

      resetAll() {
        setState({ ...EMPTY })
      },
    }),
    {
      name: 'medsimulator-v1',
      storage: createJSONStorage(() => idbStorage),
      partialize: (s): PersistedData => ({
        decks: s.decks,
        questions: s.questions,
        cards: s.cards,
        answers: s.answers,
        exams: s.exams,
        sims: s.sims,
        settings: s.settings,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PersistedData>
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } }
      },
      onRehydrateStorage: () => () => {
        useStore.setState({ hydrated: true })
      },
    },
  ),
)

export function exportData(): PersistedData {
  const s = useStore.getState()
  return {
    decks: s.decks,
    questions: s.questions,
    cards: s.cards,
    answers: s.answers,
    exams: s.exams,
    sims: s.sims,
    settings: s.settings,
  }
}

export const isNew = (c: StoredCard | undefined) => !c || c.state === State.New
