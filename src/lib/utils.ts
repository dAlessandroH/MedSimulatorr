export const DAY = 86_400_000

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** Hash FNV-1a corto y estable para ids de preguntas */
export function hash(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function startOfDay(ts: number = Date.now()): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "2026-10-20" → timestamp local 00:00 */
export function parseDateKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

export function daysUntil(dateKey: string, now = Date.now()): number {
  return Math.round((parseDateKey(dateKey) - startOfDay(now)) / DAY)
}

const fmtDate = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtShort = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })
const fmtWeekday = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

export const formatDate = (ts: number) => fmtDate.format(ts)
export const formatShort = (ts: number) => fmtShort.format(ts)
export const formatLongDay = (ts: number) => fmtWeekday.format(ts)

export function formatInterval(ms: number): string {
  const min = ms / 60_000
  if (min < 1) return '<1 min'
  if (min < 60) return `${Math.round(min)} min`
  const h = min / 60
  if (h < 24) return `${Math.round(h)} h`
  const d = h / 24
  if (d < 30) return `${Math.round(d)} d`
  const mo = d / 30.44
  if (mo < 12) return `${mo.toFixed(mo < 3 ? 1 : 0)} m`
  return `${(d / 365).toFixed(1)} a`
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return `${m}:${String(r).padStart(2, '0')}`
}

export function pct(n: number, digits = 0): string {
  if (!isFinite(n)) return '—'
  return `${(n * 100).toFixed(digits)}%`
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export function splitCategory(cat: string): { topic: string; subtopic: string } {
  const idx = cat.indexOf(' - ')
  if (idx === -1) return { topic: cat.trim() || 'General', subtopic: '' }
  return { topic: cat.slice(0, idx).trim(), subtopic: cat.slice(idx + 3).trim() }
}

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}
