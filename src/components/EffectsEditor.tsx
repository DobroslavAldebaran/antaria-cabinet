import { metricLabel } from '../schema/metrics'
import { newId, type Effect, type Metric } from '../schema/province'
import { MetricPicker } from './MetricPicker'

export function EffectsEditor({
  effects,
  metrics,
  onChange,
  disabled,
}: {
  effects: Effect[]
  metrics: Metric[]
  onChange: (next: Effect[]) => void
  disabled?: boolean
}) {
  const update = (idx: number, patch: Partial<Effect>) => {
    const next = [...effects]
    next[idx] = { ...next[idx], ...patch }
    onChange(next)
  }

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
      <button
        type="button"
        className="btn"
        disabled={disabled || metrics.length === 0}
        onClick={() =>
          onChange([
            ...effects,
            {
              id: newId('fx'),
              metricId: metrics[0]?.id ?? '',
              delta: 0,
            },
          ])
        }
      >
        Добавить изменение
      </button>
    </div>
  )
}
