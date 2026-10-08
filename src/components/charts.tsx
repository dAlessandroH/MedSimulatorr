import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { DAY, dayKey, formatShort, startOfDay } from '../lib/utils'

/* Paleta de gráficos (referencia dataviz validada) */
export const VIZ = {
  s1: '#2a78d6',
  s2: '#eb6834',
  s3: '#1baf7a',
  s4: '#eda100',
  grid: '#e1e0d9',
  axis: '#898781',
  ink2: '#52514e',
  seq: ['#eef0f5', '#b7d3f6', '#86b6ef', '#5598e7', '#2a78d6', '#1c5cab'],
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

interface Tip {
  x: number
  y: number
  content: ReactNode
}

function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null
  const left = Math.min(Math.max(tip.x, 70), width - 70)
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg"
      style={{ left, top: tip.y - 8 }}
    >
      {tip.content}
    </div>
  )
}

function niceMax(v: number) {
  if (v <= 4) return 4
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  const step = n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * p
}

export interface BarDatum {
  key: string
  label: string
  title: string
  value: number
  detail?: string
}

/** Barras verticales de una sola serie. */
export function BarChart({
  data,
  height = 180,
  color = VIZ.s1,
  labelEvery = 1,
  unit = '',
}: {
  data: BarDatum[]
  height?: number
  color?: string
  labelEvery?: number
  unit?: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)
  const [hover, setHover] = useState(-1)
  const padL = 32
  const padB = 22
  const padT = 8
  const h = height - padB - padT
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)))
  const slot = (width - padL) / Math.max(1, data.length)
  const bw = Math.max(2, Math.min(28, slot - 2))
  const ticks = [0, max / 2, max]
  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => (setTip(null), setHover(-1))}>
      <svg width={width} height={height} role="img">
        {ticks.map((t) => {
          const y = padT + h - (t / max) * h
          return (
            <g key={t}>
              <line x1={padL} x2={width} y1={y} y2={y} stroke={t === 0 ? '#c3c2b7' : VIZ.grid} strokeWidth={1} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={10} fill={VIZ.axis} className="tnum">
                {Math.round(t)}
              </text>
            </g>
          )
        })}
        {data.map((d, i) => {
          const bh = (d.value / max) * h
          const x = padL + i * slot + (slot - bw) / 2
          const y = padT + h - bh
          const r = Math.min(4, bw / 2, bh)
          return (
            <g key={d.key}>
              {bh > 0 && (
                <path
                  d={`M${x},${padT + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${padT + h} Z`}
                  fill={color}
                  opacity={hover === -1 || hover === i ? 1 : 0.55}
                />
              )}
              <rect
                x={padL + i * slot}
                y={padT}
                width={slot}
                height={h}
                fill="transparent"
                onMouseMove={() => {
                  setHover(i)
                  setTip({
                    x: x + bw / 2,
                    y: Math.min(y, padT + h - 4),
                    content: (
                      <>
                        <div className="text-sm font-semibold text-ink tnum">
                          {d.value}
                          {unit}
                        </div>
                        <div className="text-ink-2">{d.title}</div>
                        {d.detail && <div className="text-ink-3">{d.detail}</div>}
                      </>
                    ),
                  })
                }}
              />
              {i % labelEvery === 0 && (
                <text x={padL + i * slot + slot / 2} y={height - 6} textAnchor="middle" fontSize={10} fill={VIZ.axis}>
                  {d.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

export interface LinePoint {
  key: string
  label: string
  title: string
  value: number | null
  detail?: string
}

/** Línea de una sola serie en escala 0–100%. */
export function PercentLine({
  data,
  height = 180,
  color = VIZ.s1,
  labelEvery = 1,
  target,
}: {
  data: LinePoint[]
  height?: number
  color?: string
  labelEvery?: number
  target?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hi, setHi] = useState(-1)
  const padL = 36
  const padR = 8
  const padB = 22
  const padT = 10
  const h = height - padB - padT
  const n = data.length
  const xOf = (i: number) => padL + (n <= 1 ? (width - padL - padR) / 2 : (i / (n - 1)) * (width - padL - padR))
  const yOf = (v: number) => padT + h - v * h
  const segs: string[] = []
  let cur = ''
  data.forEach((d, i) => {
    if (d.value === null) {
      if (cur) segs.push(cur)
      cur = ''
      return
    }
    cur += `${cur ? 'L' : 'M'}${xOf(i)},${yOf(d.value)} `
  })
  if (cur) segs.push(cur)
  const p = hi >= 0 ? data[hi] : null
  return (
    <div
      ref={ref}
      className="relative w-full"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const i = Math.round(((x - padL) / Math.max(1, width - padL - padR)) * (n - 1))
        setHi(Math.max(0, Math.min(n - 1, i)))
      }}
      onMouseLeave={() => setHi(-1)}
    >
      <svg width={width} height={height} role="img">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={yOf(t)} y2={yOf(t)} stroke={t === 0 ? '#c3c2b7' : VIZ.grid} />
            <text x={padL - 6} y={yOf(t) + 3} textAnchor="end" fontSize={10} fill={VIZ.axis} className="tnum">
              {t * 100}%
            </text>
          </g>
        ))}
        {target !== undefined && (
          <g>
            <line x1={padL} x2={width - padR} y1={yOf(target)} y2={yOf(target)} stroke={VIZ.axis} strokeWidth={1} opacity={0.6} />
            <text x={width - padR} y={yOf(target) - 4} textAnchor="end" fontSize={10} fill={VIZ.ink2}>
              meta {Math.round(target * 100)}%
            </text>
          </g>
        )}
        {segs.map((s, i) => (
          <path key={i} d={s} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {data.map((d, i) =>
          d.value === null ? null : (
            <circle key={d.key} cx={xOf(i)} cy={yOf(d.value)} r={hi === i ? 5 : 3} fill={color} stroke="white" strokeWidth={2} />
          ),
        )}
        {p && <line x1={xOf(hi)} x2={xOf(hi)} y1={padT} y2={padT + h} stroke={VIZ.axis} strokeWidth={1} opacity={0.5} />}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.key} x={xOf(i)} y={height - 6} textAnchor={n > 1 && i === 0 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'} fontSize={10} fill={VIZ.axis}>
              {d.label}
            </text>
          ) : null,
        )}
      </svg>
      {p && (
        <Tooltip
          width={width}
          tip={{
            x: xOf(hi),
            y: p.value === null ? padT + h / 2 : yOf(p.value),
            content: (
              <>
                <div className="text-sm font-semibold text-ink tnum">{p.value === null ? 'Sin datos' : `${Math.round(p.value * 100)}%`}</div>
                <div className="text-ink-2">{p.title}</div>
                {p.detail && <div className="text-ink-3">{p.detail}</div>}
              </>
            ),
          }}
        />
      )}
    </div>
  )
}

/** Mapa de calor tipo calendario (actividad diaria). */
export function CalendarHeatmap({ counts, weeks = 26 }: { counts: Map<string, number>; weeks?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)
  const today = startOfDay()
  const dow = (new Date(today).getDay() + 6) % 7 // lunes = 0
  const start = today - (weeks - 1) * 7 * DAY - dow * DAY
  const padL = 22
  const padT = 16
  const cell = Math.max(8, Math.min(16, (width - padL) / weeks - 3))
  const gap = 3
  const max = Math.max(1, ...counts.values())
  const level = (n: number) => (n === 0 ? 0 : Math.min(5, 1 + Math.floor((n / max) * 4.999)))
  const cells: ReactNode[] = []
  const months: ReactNode[] = []
  let lastMonth = -1
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const ts = start + (w * 7 + d) * DAY
      if (ts > today) continue
      const n = counts.get(dayKey(ts)) ?? 0
      const x = padL + w * (cell + gap)
      const y = padT + d * (cell + gap)
      if (d === 0) {
        const m = new Date(ts).getMonth()
        if (m !== lastMonth) {
          lastMonth = m
          months.push(
            <text key={`m${w}`} x={x} y={10} fontSize={10} fill={VIZ.axis}>
              {new Intl.DateTimeFormat('es-MX', { month: 'short' }).format(ts)}
            </text>,
          )
        }
      }
      cells.push(
        <rect
          key={ts}
          x={x}
          y={y}
          width={cell}
          height={cell}
          rx={3}
          fill={VIZ.seq[level(n)]}
          onMouseEnter={() =>
            setTip({
              x: x + cell / 2,
              y,
              content: (
                <>
                  <div className="text-sm font-semibold text-ink tnum">{n} preguntas</div>
                  <div className="text-ink-2">{formatShort(ts)}</div>
                </>
              ),
            })
          }
        />,
      )
    }
  }
  const height = padT + 7 * (cell + gap)
  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height + 4} role="img">
        {months}
        {['L', '', 'M', '', 'V', '', 'D'].map((l, i) => (
          <text key={i} x={0} y={padT + i * (cell + gap) + cell - 2} fontSize={9} fill={VIZ.axis}>
            {l}
          </text>
        ))}
        {cells}
      </svg>
      <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-ink-3">
        Menos
        {VIZ.seq.map((c) => (
          <span key={c} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c }} />
        ))}
        Más
      </div>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

/** Barra horizontal apilada con leyenda (parte de un todo). */
export function StackedBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  const [hi, setHi] = useState<number | null>(null)
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-slate-100">
        {total > 0 &&
          parts.map((p, i) =>
            p.value ? (
              <div
                key={p.label}
                className="h-full transition-opacity first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(p.value / total) * 100}%`, background: p.color, opacity: hi === null || hi === i ? 1 : 0.5 }}
                onMouseEnter={() => setHi(i)}
                onMouseLeave={() => setHi(null)}
                title={`${p.label}: ${p.value}`}
              />
            ) : null,
          )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2">
        {parts.map((p, i) => (
          <div key={p.label} className="flex items-center gap-2 text-xs" onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
            <span className="whitespace-nowrap text-ink-2">{p.label}</span>
            <span className="ml-auto font-semibold text-ink tnum">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
