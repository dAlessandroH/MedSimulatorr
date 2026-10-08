import { Download, HardDrive, ShieldAlert, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, Card, Field, inputCls, PageHeader, SectionTitle, Toggle } from '../components/ui'
import { exportData, useStore } from '../lib/store'
import type { PersistedData } from '../lib/types'
import { dayKey, formatDate } from '../lib/utils'
import { download } from './Bank'

const LAST_BACKUP = 'medsimulator-ultimo-respaldo'

export function SettingsPage() {
  const s = useStore()
  const st = s.settings
  const fileRef = useRef<HTMLInputElement>(null)
  const [usage, setUsage] = useState<{ used: number; quota: number; persisted: boolean } | null>(null)
  const [lastBackup, setLastBackup] = useState<number | null>(() => {
    try {
      return Number(localStorage.getItem(LAST_BACKUP)) || null
    } catch {
      return null
    }
  })

  useEffect(() => {
    ;(async () => {
      const est = await navigator.storage?.estimate?.()
      const persisted = (await navigator.storage?.persisted?.()) ?? false
      if (est) setUsage({ used: est.usage ?? 0, quota: est.quota ?? 0, persisted })
    })().catch(() => {})
  }, [])

  const backup = () => {
    download(`medsimulator-respaldo-${dayKey(Date.now())}.json`, JSON.stringify(exportData()), 'application/json')
    const t = Date.now()
    setLastBackup(t)
    try {
      localStorage.setItem(LAST_BACKUP, String(t))
    } catch {
      /* ignorar */
    }
  }

  const restore = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as PersistedData
      if (!data.questions || !Array.isArray(data.decks)) throw new Error('formato')
      if (!confirm(`¿Reemplazar todos tus datos actuales con el respaldo "${f.name}"?`)) return
      s.replaceAll(data)
      alert('Respaldo restaurado.')
    } catch {
      alert('El archivo no es un respaldo válido de MedSimulator.')
    }
  }

  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <SectionTitle>FSRS</SectionTitle>
          <div className="space-y-5">
            <Field label={`Retención deseada: ${Math.round(st.retention * 100)}%`} hint="Probabilidad de recordar cada pregunta al momento de repasarla. Más alta = más repasos. 90% es lo recomendado.">
              <input type="range" min={0.8} max={0.97} step={0.01} value={st.retention} className="w-full" onChange={(e) => s.updateSettings({ retention: Number(e.target.value) })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nuevas por día (base)" hint="Se aumenta automáticamente si tus exámenes lo requieren.">
                <input type="number" min={0} className={inputCls} value={st.newPerDay} onChange={(e) => s.updateSettings({ newPerDay: Math.max(0, Number(e.target.value) || 0) })} />
              </Field>
              <Field label="Intervalo máximo (días)">
                <input type="number" min={7} className={inputCls} value={st.maxInterval} onChange={(e) => s.updateSettings({ maxInterval: Math.max(7, Number(e.target.value) || 365) })} />
              </Field>
            </div>
            <Field label="Meta diaria de preguntas">
              <input type="number" min={1} className={inputCls} value={st.dailyGoal} onChange={(e) => s.updateSettings({ dailyGoal: Math.max(1, Number(e.target.value) || 1) })} />
            </Field>
          </div>
          <div className="mt-3 divide-y divide-line">
            <Toggle
              checked={st.examAware}
              onChange={(v) => s.updateSettings({ examAware: v })}
              label="Programación consciente de exámenes"
              hint="Adelanta repasos que caerían después de un examen para que lleguen frescos."
            />
            <Toggle
              checked={st.simUpdatesFsrs}
              onChange={(v) => s.updateSettings({ simUpdatesFsrs: v })}
              label="Los simulacros actualizan FSRS"
              hint="Correcta = Bien, incorrecta = Otra vez."
            />
            <Toggle
              checked={st.shuffleOptions}
              onChange={(v) => s.updateSettings({ shuffleOptions: v })}
              label="Mezclar el orden de las opciones"
              hint="Evita memorizar la letra. No se mezclan si hay opciones tipo “Todas las anteriores”."
            />
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-6">
            <SectionTitle>Tus datos</SectionTitle>
            <div className="flex gap-3 rounded-2xl bg-sky-50/70 p-4 text-sm text-ink-2">
              <HardDrive size={18} className="mt-0.5 shrink-0 text-sky-600" />
              <div>
                Todo se guarda <b className="text-ink">solo en este navegador</b> (IndexedDB). No hay servidor. Si borras los datos del sitio, cambias de navegador o de
                computadora, necesitas un respaldo.
                {usage && (
                  <div className="mt-1 text-xs text-ink-3">
                    Usando {(usage.used / 1024 / 1024).toFixed(1)} MB · almacenamiento {usage.persisted ? 'persistente ✓' : 'no persistente (el navegador podría liberarlo)'}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={backup}>
                <Download size={16} /> Descargar respaldo
              </Button>
              <Button onClick={() => fileRef.current?.click()}>
                <Upload size={16} /> Restaurar respaldo
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) restore(f)
                  e.target.value = ''
                }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-3">Último respaldo: {lastBackup ? formatDate(lastBackup) : 'nunca'}</p>
            <p className="mt-3 text-xs text-ink-3">
              {Object.keys(s.questions).length} preguntas · {s.answers.length} respuestas · {s.exams.length} exámenes · {s.sims.length} simulacros
            </p>
          </Card>

          <Card className="border-rose-200 p-6">
            <SectionTitle>Zona de peligro</SectionTitle>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2 text-sm text-ink-2">
                <ShieldAlert size={18} className="mt-0.5 shrink-0 text-rose-500" />
                Borra bancos, progreso, exámenes y simulacros de este navegador.
              </div>
              <Button
                variant="danger"
                onClick={() => {
                  if (confirm('¿Borrar TODOS los datos? Descarga un respaldo antes si lo necesitas.') && confirm('Esta acción no se puede deshacer. ¿Continuar?')) s.resetAll()
                }}
              >
                Borrar todo
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
