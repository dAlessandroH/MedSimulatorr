import Papa from 'papaparse'
import type { Question } from './types'
import { hash, normalize, splitCategory } from './utils'

export interface ParsedCsv {
  questions: Omit<Question, 'deckId' | 'id' | 'createdAt'>[]
  errors: string[]
}

const OPTION_KEYS = ['opcion_a', 'opcion_b', 'opcion_c', 'opcion_d', 'opcion_e', 'opcion_f']

function cleanHeader(h: string) {
  return normalize(h.replace(/^﻿/, '')).replace(/[\s-]+/g, '_')
}

/**
 * Formato esperado:
 * pregunta,opcion_a,opcion_b,opcion_c,opcion_d,respuesta,categoria,explicacion
 * (opcion_e/opcion_f opcionales; respuesta como letra, número o texto de la opción)
 */
export function parseCsv(text: string): ParsedCsv {
  const res = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: cleanHeader,
  })
  const errors: string[] = []
  const fields = res.meta.fields ?? []
  if (!fields.includes('pregunta')) {
    errors.push('No se encontró la columna "pregunta". Revisa el encabezado del CSV.')
    return { questions: [], errors }
  }
  const optKeys = OPTION_KEYS.filter((k) => fields.includes(k))
  if (optKeys.length < 2) {
    errors.push('Se necesitan al menos dos columnas de opciones (opcion_a, opcion_b, …).')
    return { questions: [], errors }
  }

  const questions: ParsedCsv['questions'] = []
  res.data.forEach((row, i) => {
    const line = i + 2
    const text = (row.pregunta ?? '').trim()
    if (!text) return
    const options = optKeys.map((k) => (row[k] ?? '').trim()).filter((o) => o !== '')
    const raw = (row.respuesta ?? '').trim()
    let answer = -1
    const letter = raw.toLowerCase().replace(/[^a-f0-9]/g, '')
    if (/^[a-f]$/.test(letter)) answer = letter.charCodeAt(0) - 97
    else if (/^[1-6]$/.test(letter)) answer = Number(letter) - 1
    if (answer < 0 || answer >= options.length) {
      answer = options.findIndex((o) => normalize(o) === normalize(raw))
    }
    if (answer < 0) {
      errors.push(`Fila ${line}: respuesta "${raw}" no válida — omitida.`)
      return
    }
    const category = (row.categoria ?? '').trim() || 'General'
    const { topic, subtopic } = splitCategory(category)
    questions.push({
      text,
      options,
      answer,
      category,
      topic,
      subtopic,
      explanation: (row.explicacion ?? '').trim(),
    })
  })
  for (const e of res.errors.slice(0, 5)) errors.push(`Fila ${(e.row ?? 0) + 2}: ${e.message}`)
  return { questions, errors }
}

export function questionId(deckId: string, text: string) {
  return `${deckId}_${hash(normalize(text))}`
}

export function toCsv(questions: Question[]): string {
  return Papa.unparse(
    questions.map((q) => ({
      pregunta: q.text,
      opcion_a: q.options[0] ?? '',
      opcion_b: q.options[1] ?? '',
      opcion_c: q.options[2] ?? '',
      opcion_d: q.options[3] ?? '',
      respuesta: String.fromCharCode(97 + q.answer),
      categoria: q.category,
      explicacion: q.explanation,
    })),
  )
}
