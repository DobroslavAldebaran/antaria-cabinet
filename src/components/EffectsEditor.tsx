import { useState } from 'react'
import { metricLabel, parseMetricNumber } from '../schema/metrics'
import { newId, type Effect, type Metric } from '../schema/province'
import { MetricEditDialog } from './MetricEditDialog'
import { MetricPicker } from './MetricPicker'

export type CreateMetricAttach = { effectId: string } | 'new-row'

function finalizeCreatedMetric(raw: Metric): Metric {
  const value =
    parseMetricNumber(raw.value) != null
      ? raw.value
      : raw.value === ''
        ? 0
        : raw.value
  return {
    ...raw,
    id: newId('metric'),
    value,
  }
}

function deltaInputValue(
  effect: Effect,
  drafts: Record<string, string>,
): string {
  if (Object.prototype.hasOwnProperty.call(drafts, effect.id)) {
    return drafts[effect.id] ?? ''
  }
  return Number.isFinite(effect.delta) ? String(effect.delta) : '0'
}

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
  /** Parent must write createdMetrics + effects in one update. */
  onCreateMetric?: (metric: Metric, attach: CreateMetricAttach) => void
  disabled?: boolean
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [deltaDrafts, setDeltaDrafts] = useState<Record<string, string>>({})

  const update = (idx: number, patch: Partial<Effect>) => {
    const next = [...effects]
    next[idx] = { ...next[idx], ...patch }
    onChange(next)
  }

  const handleCreate = (raw: Metric) => {
    if (!onCreateMetric) return
    onCreateMetric(finalizeCreatedMetric(raw), 'new-row')
    setCreateOpen(false)
  }

  const setDeltaDraft = (effectId: string, raw: string) => {
    setDeltaDrafts((prev) => ({ ...prev, [effectId]: raw }))
  }

  const clearDeltaDraft = (effectId: string) => {
    setDeltaDrafts((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, effectId)) return prev
      const next = { ...prev }
      delete next[effectId]
      return next
    })
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
                    onCreateMetric(finalizeCreatedMetric(raw), {
                      effectId: effect.id,
                    })
                  }
                : undefined
            }
            onChange={(metricId) => update(idx, { metricId })}
          />
          <input
            type="text"
            inputMode="decimal"
            className="effects-delta"
            value={deltaInputValue(effect, deltaDrafts)}
            disabled={disabled}
            aria-label={`Дельта: ${metricLabel(metrics, effect.metricId)}`}
            onChange={(e) => {
              const raw = e.target.value
              setDeltaDraft(effect.id, raw)
              const parsed = parseMetricNumber(raw)
              if (parsed != null) update(idx, { delta: parsed })
            }}
            onBlur={() => {
              const raw = deltaDrafts[effect.id]
              if (raw === undefined) return
              const parsed = parseMetricNumber(raw)
              update(idx, { delta: parsed ?? 0 })
              clearDeltaDraft(effect.id)
            }}
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
            onClick={() => {
              clearDeltaDraft(effect.id)
              onChange(effects.filter((_, i) => i !== idx))
            }}
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
