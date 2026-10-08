import type { Rating, State } from 'ts-fsrs'

export type Priority = 'alta' | 'media' | 'baja'

export interface Deck {
  id: string
  name: string
  color: string
  createdAt: number
}

export interface Question {
  id: string
  deckId: string
  text: string
  options: string[]
  answer: number
  /** Categoría completa tal como viene en el CSV */
  category: string
  /** Parte antes de " - " (p. ej. "Médula Espinal") */
  topic: string
  /** Parte después de " - " (p. ej. "Anatomía general") */
  subtopic: string
  explanation: string
  createdAt: number
  flagged?: boolean
  suspended?: boolean
}

/** Tarjeta FSRS serializada (fechas en ms) */
export interface StoredCard {
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: State
  last_review: number | null
}

export type AnswerMode = 'estudio' | 'simulacro'

export interface Answer {
  id: string
  qid: string
  ts: number
  correct: boolean
  chosen: number
  rating: Rating | null
  timeMs: number
  mode: AnswerMode
  stateBefore: State
}

export interface Exam {
  id: string
  name: string
  /** YYYY-MM-DD */
  date: string
  priority: Priority
  deckIds: string[]
  /** Categorías incluidas (vacío = todas las de los bancos) */
  categories: string[]
  targetScore: number
  notes: string
  createdAt: number
  /** Calificación real obtenida (opcional, tras presentarlo) */
  realScore?: number | null
}

export type SimOrder = 'aleatorio' | 'debiles' | 'falladas' | 'nuevas' | 'marcadas'

export interface SimConfig {
  deckIds: string[]
  categories: string[]
  examId: string | null
  count: number
  minutes: number
  order: SimOrder
}

export interface SimResult {
  id: string
  ts: number
  config: SimConfig
  questionIds: string[]
  /** Índice elegido (en el orden original de opciones) o null */
  answers: (number | null)[]
  correct: number
  total: number
  durationSec: number
}

export interface Settings {
  retention: number
  newPerDay: number
  maxInterval: number
  shuffleOptions: boolean
  simUpdatesFsrs: boolean
  examAware: boolean
  dailyGoal: number
}

export interface PersistedData {
  decks: Deck[]
  questions: Record<string, Question>
  cards: Record<string, StoredCard>
  answers: Answer[]
  exams: Exam[]
  sims: SimResult[]
  settings: Settings
}
