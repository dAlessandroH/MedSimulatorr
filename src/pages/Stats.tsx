import { Award, BarChart3, Clock, Flame, Repeat, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BarChart, CalendarHeatmap, PercentLine, StackedBar, VIZ } from '../components/charts'
import { Card, Empty, PageHeader, Progress, SectionTitle, Segmented, Stat, fieldBase } from '../components/ui'
import { retrievability, State } from '../lib/fsrs'
import { categoryStats, dailySeries, forecast, questionsInScope, streak, type Scope } from '../lib/planner'
import { isNew, useStore } from '../lib/store'
import { cx, DAY, dayKey, formatShort, pct } from '../lib/utils'

type Kind = 'todo' | 'examen' | 'banco'
type SortKey = 'debil' | 'nombre' | 'avance'

export function Stats() {
  const s = useStore()
  const [kind, setKind] = useState<Kind>('todo')
  const [id, setId] = useState('')
  const [range, setRange] = useState<'30' | '90'>('30')
  const [sort, setSort] = useState<SortKey>('debil')
  const now = Date.now()

  const scope: Scope = kind === 'examen' ? { examId: id } : kind === 'banco' ? { deckIds: [id] } : {}
  const qs = useMemo(() => questionsInScope(s, scope, true), [s.questions, kind, id])
  const qids = useMemo(() => new Set(qs.map((q) => q.id)), [qs])
  const answers = useMemo(() => s.answers.filter((a) => qids.has(a.qid)), [s.answers, qids])
  const days = Number(range)

  const kpi = useMemo(() => {
    const correct = answers.filter((a) => a.correct).length
    const since = now - 30 * DAY
    const rev = answers.filter((a) => a.ts >= since && a.stateBefore === State.Review)
    let mature = 0
    const states = { n: 0, l: 0, r: 0, rl: 0 }
    for (const q of qs) {
      const c = s.cards[q.id]
      if (isNew(c)) states.n++
      else if (c!.state === State.Learning) states.l++
      else if (c!.state === State.Relearning) states.rl++
      else states.r++
      if (c && c.stability >= 21) mature++
    }
    const timed = answers.filter((a) => a.timeMs > 0)
    return {
      total: answers.length,
      acc: answers.length ? correct / answers.length : NaN,
      trueRet: rev.length ? rev.filter((a) => a.correct).length / rev.length : NaN,
      revN: rev.length,
      avgTime: timed.length ? timed.reduce((x, a) => x + a.timeMs, 0) / timed.length / 1000 : NaN,
      mature,
      states,
      byMode: (['estudio', 'simulacro'] as const).map((m) => {
        const xs = answers.filter((a) => a.mode === m)
        return { m, n: xs.length, acc: xs.length ? xs.filter((a) => a.correct).length / xs.length : NaN }
      }),
    }
  }, [answers, qs, s.cards])

  const series = useMemo(() => dailySeries(s.answers, days, qids, now), [s.answers, qids, days])
  const heat = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of answers) m.set(dayKey(a.ts), (m.get(dayKey(a.ts)) ?? 0) + 1)
    return m
  }, [answers])
  const fc = useMemo(() => forecast(s, qs.filter((q) => !q.suspended), 30, now), [qs, s.cards])
  const cats = useMemo(() => {
    const list = categoryStats(s, qs, now)
    if (sort === 'nombre') return list.sort((a, b) => a.category.localeCompare(b.category))
    if (sort === 'avance') return list.sort((a, b) => b.seen / b.total - a.seen / a.total)
    return list.sort((a, b) => (a.accuracy ?? 2) - (b.accuracy ?? 2) || a.avgR - b.avgR)
  }, [qs, s.cards, s.answers, sort])
  const sims = useMemo(
    () => s.sims.filter((x) => (kind === 'examen' ? x.config.examId === id : kind === 'banco' ? x.questionIds.some((q) => qids.has(q)) : true)),
    [s.sims, kind, id, qids],
  )
  const avgR = useMemo(() => (qs.length ? qs.reduce((x, q) => x + retrievability(s.cards[q.id], now), 0) / qs.length : 0), [qs, s.cards])

  if (!s.answers.length) {
    return (
      <>
        <PageHeader title="Estadísticas" />
        <Empty icon={<BarChart3 size={24} />} title="Aún no hay datos" text="Responde preguntas en Estudiar o haz un simulacro para ver tus estadísticas." />
      </>
    )
  }

  const every = days > 30 ? 14 : 7
  return (
    <>
      <PageHeader
        title="Estadísticas"
        subtitle="Tu rendimiento, la memoria estimada por FSRS y la carga de repasos que viene."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={kind}
              onChange={(k) => {
                setKind(k)
                setId(k === 'examen' ? s.exams[0]?.id ?? '' : k === 'banco' ? s.decks[0]?.id ?? '' : '')
              }}
              options={[
                { value: 'todo', label: 'Todo' },
                { value: 'examen', label: 'Examen' },
                { value: 'banco', label: 'Banco' },
              ]}
            />
            {kind !== 'todo' && (
              <select className={fieldBase + ' w-auto'} value={id} onChange={(e) => setId(e.target.value)}>
                {(kind === 'examen' ? s.exams : s.decks).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={<Repeat size={14} />} label="Respondidas" value={kpi.total.toLocaleString('es-MX')} hint={`${qs.length} preguntas en alcance`} />
        <Stat icon={<Target size={14} />} label="Precisión global" value={pct(kpi.acc)} hint={kpi.byMode.map((m) => `${m.m}: ${pct(m.acc)}`).join(' · ')} />
        <Stat icon={<Award size={14} />} label="Retención real" value={pct(kpi.trueRet)} hint={`Repasos 30 d (${kpi.revN}) · objetivo ${pct(s.settings.retention)}`} />
        <Stat icon={<BarChart3 size={14} />} label="Memoria actual" value={pct(avgR)} hint="Retención media FSRS (no vistas = 0)" />
        <Stat icon={<Clock size={14} />} label="Tiempo / pregunta" value={isFinite(kpi.avgTime) ? `${kpi.avgTime.toFixed(0)} s` : '—'} hint="Promedio" />
        <Stat icon={<Flame size={14} />} label="Dominadas" value={kpi.mature} hint="Estabilidad ≥ 21 días" />
      </div>

      <Card className="mt-5 p-5">
        <SectionTitle right={<span className="text-xs text-ink-3">Racha actual: {streak(answers, now)} días</span>}>Actividad (últimas 26 semanas)</SectionTitle>
        <CalendarHeatmap counts={heat} />
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle
            right={
              <Segmented
                value={range}
                onChange={setRange}
                options={[
                  { value: '30', label: '30 d' },
                  { value: '90', label: '90 d' },
                ]}
              />
            }
          >
            Preguntas respondidas por día
          </SectionTitle>
          <BarChart
            labelEvery={every}
            data={series.map((d) => ({
              key: d.day,
              label: formatShort(d.ts),
              title: formatShort(d.ts),
              value: d.count,
              detail: d.count ? `${d.correct} correctas` : undefined,
            }))}
          />
        </Card>
        <Card className="p-5">
          <SectionTitle>Precisión diaria</SectionTitle>
          <PercentLine
            labelEvery={every}
            data={series.map((d) => ({
              key: d.day,
              label: formatShort(d.ts),
              title: formatShort(d.ts),
              value: d.count ? d.correct / d.count : null,
              detail: d.count ? `${d.correct}/${d.count}` : undefined,
            }))}
          />
        </Card>
        <Card className="p-5">
          <SectionTitle right={<span className="text-xs text-ink-3">{fc.reduce((x, d) => x + d.count, 0)} en 30 días</span>}>Pronóstico de repasos</SectionTitle>
          <BarChart
            color={VIZ.s1}
            labelEvery={7}
            data={fc.map((d, i) => ({
              key: String(d.ts),
              label: i === 0 ? 'Hoy' : formatShort(d.ts),
              title: i === 0 ? 'Hoy (incluye atrasadas)' : formatShort(d.ts),
              value: d.count,
            }))}
          />
        </Card>
        <Card className="p-5">
          <SectionTitle>Estado de las preguntas (FSRS)</SectionTitle>
          <div className="pt-2">
            <StackedBar
              parts={[
                { label: 'Nuevas', value: kpi.states.n, color: VIZ.s1 },
                { label: 'Aprendiendo', value: kpi.states.l, color: VIZ.s2 },
                { label: 'En repaso', value: kpi.states.r, color: VIZ.s3 },
                { label: 'Reaprendiendo', value: kpi.states.rl, color: VIZ.s4 },
              ]}
            />
          </div>
          <div className="mt-6">
            <SectionTitle>Simulacros</SectionTitle>
            {sims.length < 1 ? (
              <p className="py-4 text-sm text-ink-3">Sin simulacros en este alcance.</p>
            ) : (
              <PercentLine
                height={150}
                labelEvery={Math.max(1, Math.ceil(sims.length / 6))}
                target={kind === 'examen' ? (s.exams.find((e) => e.id === id)?.targetScore ?? 80) / 100 : undefined}
                data={sims.map((x, i) => ({
                  key: x.id,
                  label: formatShort(x.ts),
                  title: `Simulacro ${i + 1} · ${formatShort(x.ts)}`,
                  value: x.correct / Math.max(1, x.total),
                  detail: `${x.correct}/${x.total}`,
                }))}
              />
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-5 p-5">
        <SectionTitle
          right={
            <Segmented
              value={sort}
              onChange={setSort}
              options={[
                { value: 'debil', label: 'Más débiles' },
                { value: 'avance', label: 'Avance' },
                { value: 'nombre', label: 'A–Z' },
              ]}
            />
          }
        >
          Por tema
        </SectionTitle>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-3">
                <th className="py-2 pr-3 font-medium">Tema</th>
                <th className="px-3 py-2 text-right font-medium">Preguntas</th>
                <th className="w-40 px-3 py-2 font-medium">Vistas</th>
                <th className="px-3 py-2 text-right font-medium">Precisión</th>
                <th className="w-40 px-3 py-2 font-medium">Memoria FSRS</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.category} className="border-b border-line/60 last:border-0">
                  <td className="py-2.5 pr-3">
                    <div className="font-medium text-ink">{c.subtopic || c.topic}</div>
                    {c.subtopic && <div className="text-xs text-ink-3">{c.topic}</div>}
                  </td>
                  <td className="px-3 text-right tnum">{c.total}</td>
                  <td className="px-3">
                    <div className="flex items-center gap-2">
                      <Progress value={c.seen / c.total} className="h-1.5" />
                      <span className="w-10 text-right text-xs tnum">{pct(c.seen / c.total)}</span>
                    </div>
                  </td>
                  <td className="px-3 text-right">
                    <span
                      className={cx(
                        'font-semibold tnum',
                        c.accuracy === null ? 'text-ink-3' : c.accuracy >= 0.8 ? 'text-emerald-700' : c.accuracy >= 0.6 ? 'text-amber-700' : 'text-rose-700',
                      )}
                    >
                      {c.accuracy === null ? '—' : pct(c.accuracy)}
                    </span>
                    {c.answered > 0 && <span className="ml-1 text-xs text-ink-3">({c.answered})</span>}
                  </td>
                  <td className="px-3">
                    <div className="flex items-center gap-2">
                      <Progress value={c.avgR} className="h-1.5" color="bg-sky-500" />
                      <span className="w-10 text-right text-xs tnum">{pct(c.avgR)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
