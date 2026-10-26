import { useEffect, useState } from 'react'
import { useCabinet } from '../cabinet/CabinetProvider'
import { saveIndicators } from '../lib/drive'
import {
  METRIC_DEFS,
  METRIC_IDS,
  ensureCanonicalMetrics,
  type MetricId,
} from '../schema/metrics'
import { nowIso, type Indicators } from '../schema/province'
import { Onboarding } from './Onboarding'

export function IndicatorsPage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!binding || !data) return
    const hash = window.location.hash.replace(/^#/, '')
    if (!hash) return
    const el = document.getElementById(`metric-${hash}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [binding, data])

  if (!binding || !data) return <Onboarding />

  const indicators = data.indicators
  const metrics = ensureCanonicalMetrics(indicators.metrics)

  const update = (next: Indicators) => {
    setData({ ...data, indicators: next })
  }

  const save = async () => {
    setMsg(null)
    const token = await ensureToken()
    const next = {
      ...indicators,
      metrics: ensureCanonicalMetrics(indicators.metrics),
      updatedAt: nowIso(),
    }
    await saveIndicators(token, binding.folderId, next)
    setData({ ...data, indicators: next })
    setMsg('Сохранено на Drive')
  }

  const setMetricValue = (id: MetricId, raw: string) => {
    const ensured = ensureCanonicalMetrics(indicators.metrics)
    const idx = ensured.findIndex((m) => m.id === id)
    if (idx < 0) return
    const num = Number(raw.replace(/\s/g, '').replace(',', '.'))
    ensured[idx] = {
      ...ensured[idx],
      value: raw !== '' && !Number.isNaN(num) ? num : raw,
    }
    update({ ...indicators, metrics: ensured })
  }

  return (
    <div className="page">
      <div className="panel">
        <h2>Показатели</h2>
        <p className="muted">
          Стабильные ключи для дашборда. Ведущий показатель: Троны (budget).
        </p>
        <div className="field">
          <label htmlFor="ind-turn">Ход</label>
          <input
            id="ind-turn"
            type="number"
            value={indicators.turn}
            onChange={(e) =>
              update({ ...indicators, turn: Number(e.target.value) || 0 })
            }
          />
        </div>
        <div className="stack indicators-stack">
          {METRIC_IDS.map((id) => {
            const def = METRIC_DEFS[id]
            const m = metrics.find((x) => x.id === id)!
            return (
              <div key={id} className="list-block stack" id={`metric-${id}`}>
                <div className="field">
                  <label htmlFor={`val-${id}`}>
                    {def.label}
                    <span className="muted"> ({id})</span>
                  </label>
                  <input
                    id={`val-${id}`}
                    value={String(m.value)}
                    onChange={(e) => setMetricValue(id, e.target.value)}
                  />
                </div>
                {def.unit && <p className="muted">Единица: {def.unit}</p>}
                {def.note && <p className="muted">{def.note}</p>}
              </div>
            )
          })}
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() =>
              update({
                ...indicators,
                metrics: ensureCanonicalMetrics(indicators.metrics),
              })
            }
          >
            Заполнить недостающие ключи
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void save()}
          >
            Сохранить
          </button>
        </div>
        {msg && <p className="ok">{msg}</p>}
      </div>
    </div>
  )
}
