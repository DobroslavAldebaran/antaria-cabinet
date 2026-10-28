import { useState } from 'react'
import { metricLabel, parseMetricNumber } from '../schema/metrics'
import { newId, type Effect, type Metric } from '../schema/province'
import { MetricEditDialog } from './MetricEditDialog'
import { MetricPicker } from './MetricPicker'

export function EffectsEditor({
  effects,
  metrics,
  onChange,
  onCreateMetric,
  disabled,
}: {
  effects: Effect[]
  metrics: Metric[]
  onChange: (next: Effect[]) => void
  onCreateMetric?: (metric: Metric) => void
  disabled?: boolean
}) {
  const [createOpen, setCreateOpen] = useState(false)

  const update = (idx: number, patch: Partial<Effect>) => {
    const next = [...effects]
    next[idx] = { ...next[idx], ...patch }
    onChange(next)
  }

  const handleCreate = (raw: Metric) => {
    if (!onCreateMetric) return
    const value =
      parseMetricNumber(raw.value) != null ? raw.value : (raw.value === '' ? 0 : raw.value)
    const metric: Metric = {
      ...raw,
      id: newId('metric'),
      value,
    }
    onCreateMetric(metric)
    onChange([
      ...effects,
      {
        id: newId('fx'),
        metricId: metric.id,
        delta: 0,
      },
    ])
    setCreateOpen(false)
  }

  const canAdd = !disabled && (metrics.length > 0 || Boolean(onCreateMetric))

  return (
    <div className="effects-editor stack">
      <p className="effects-editor-title">Изменения показателей</p>
      {effects.length === 0 ? (
        <p className="muted">Пока нет дельт</p>
      ) : null}
      {effects.map((effect, idx) => (
        <div key={effect.id} className="effects-row">
          <MetricPicker
            metrics={metrics}
            value={effect.metricId}
            disabled={disabled}
            onCreateMetric={
              onCreateMetric
                ? (raw) => {
                    const value =
                      parseMetricNumber(raw.value) != null
                        ? raw.value
                        : raw.value === ''
                          ? 0
                          : raw.value
                    const metric: Metric = {
                      ...raw,
                      id: newId('metric'),
                      value,
                    }
                    onCreateMetric(metric)
                    update(idx, { metricId: metric.id })
                  }
                : undefined
            }
            onChange={(metricId) => update(idx, { metricId })}
          />
          <input
            type="number"
            className="effects-delta"
            value={Number.isFinite(effect.delta) ? effect.delta : 0}
            disabled={disabled}
            aria-label={`Дельта: ${metricLabel(metrics, effect.metricId)}`}
            onChange={(e) => update(idx, { delta: Number(e.target.value) || 0 })}
          />
          <input
            type="text"
            className="effects-note"
            value={effect.note ?? ''}
            disabled={disabled}
            placeholder="Заметка"
            aria-label="Заметка к дельте"
            onChange={(e) =>
              update(idx, { note: e.target.value.trim() || undefined })
            }
          />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={disabled}
            onClick={() => onChange(effects.filter((_, i) => i !== idx))}
          >
            Убрать
          </button>
        </div>
      ))}
      <div className="btn-row">
        <button
          type="button"
          className="btn"
          disabled={!canAdd}
          onClick={() => {
            if (metrics.length === 0 && onCreateMetric) {
              setCreateOpen(true)
              return
            }
            onChange([
              ...effects,
              {
                id: newId('fx'),
                metricId: metrics[0]?.id ?? '',
                delta: 0,
              },
            ])
          }}
        >
          Добавить изменение
        </button>
        {onCreateMetric ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={disabled}
            onClick={() => setCreateOpen(true)}
          >
            Новый показатель…
          </button>
        ) : null}
      </div>

      {onCreateMetric ? (
        <MetricEditDialog
          open={createOpen}
          mode="create"
          initial={null}
          onClose={() => setCreateOpen(false)}
          onSave={handleCreate}
        />
      ) : null}
    </div>
  )
}
