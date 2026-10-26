import { useState } from 'react'
import { useCabinet } from '../cabinet/CabinetProvider'
import { saveIndicators } from '../lib/drive'
import { newId, nowIso, type Indicators } from '../schema/province'
import { Onboarding } from './Onboarding'

export function IndicatorsPage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [msg, setMsg] = useState<string | null>(null)

  if (!binding || !data) return <Onboarding />

  const indicators = data.indicators

  const update = (next: Indicators) => {
    setData({ ...data, indicators: next })
  }

  const save = async () => {
    setMsg(null)
    const token = await ensureToken()
    const next = { ...indicators, updatedAt: nowIso() }
    await saveIndicators(token, binding.folderId, next)
    setData({ ...data, indicators: next })
    setMsg('Сохранено на Drive')
  }

  return (
    <div className="page">
      <div className="panel">
        <h2>Показатели</h2>
        <div className="field">
          <label>Ход</label>
          <input
            type="number"
            value={indicators.turn}
            onChange={(e) =>
              update({ ...indicators, turn: Number(e.target.value) || 0 })
            }
          />
        </div>
        <div className="stack" style={{ marginTop: '1rem' }}>
          {indicators.metrics.map((m, idx) => (
            <div key={m.id} className="list-block stack">
              <div className="field">
                <label>Название</label>
                <input
                  value={m.label}
                  onChange={(e) => {
                    const metrics = [...indicators.metrics]
                    metrics[idx] = { ...m, label: e.target.value }
                    update({ ...indicators, metrics })
                  }}
                />
              </div>
              <div className="field">
                <label>Значение</label>
                <input
                  value={String(m.value)}
                  onChange={(e) => {
                    const metrics = [...indicators.metrics]
                    const raw = e.target.value
                    const num = Number(raw)
                    metrics[idx] = {
                      ...m,
                      value: raw !== '' && !Number.isNaN(num) && String(num) === raw ? num : raw,
                    }
                    update({ ...indicators, metrics })
                  }}
                />
              </div>
              <div className="field">
                <label>Единица</label>
                <input
                  value={m.unit ?? ''}
                  onChange={(e) => {
                    const metrics = [...indicators.metrics]
                    metrics[idx] = { ...m, unit: e.target.value }
                    update({ ...indicators, metrics })
                  }}
                />
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  update({
                    ...indicators,
                    metrics: indicators.metrics.filter((x) => x.id !== m.id),
                  })
                }
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() =>
              update({
                ...indicators,
                metrics: [
                  ...indicators.metrics,
                  { id: newId('m'), label: 'Новая метрика', value: 0 },
                ],
              })
            }
          >
            Добавить метрику
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            Сохранить
          </button>
        </div>
        {msg && <p className="ok">{msg}</p>}
      </div>
    </div>
  )
}
