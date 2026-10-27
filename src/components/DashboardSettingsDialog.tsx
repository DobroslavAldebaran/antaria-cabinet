import { useEffect, useId, useRef, useState } from 'react'
import {
  formatMetricValue,
  metricDisplayUnit,
  metricLabel,
} from '../schema/metrics'
import { newId, type Metric } from '../schema/province'
import { MetricEditDialog } from './MetricEditDialog'

export function DashboardSettingsDialog({
  open,
  metrics,
  busy,
  message,
  onClose,
  onChangeMetrics,
  onSave,
}: {
  open: boolean
  metrics: Metric[]
  busy: boolean
  message: string | null
  onClose: () => void
  onChangeMetrics: (next: Metric[]) => void
  onSave: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [editOpen, setEditOpen] = useState(false)
  const [editMode, setEditMode] = useState<'create' | 'edit'>('edit')
  const [editTarget, setEditTarget] = useState<Metric | null>(null)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open) {
      if (!el.open) el.showModal()
    } else if (el.open) {
      el.close()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setEditOpen(false)
      setEditTarget(null)
    }
  }, [open])

  const openCreate = () => {
    setEditMode('create')
    setEditTarget(null)
    setEditOpen(true)
  }

  const openEdit = (metric: Metric) => {
    setEditMode('edit')
    setEditTarget(metric)
    setEditOpen(true)
  }

  const closeEdit = () => {
    setEditOpen(false)
    setEditTarget(null)
  }

  const applyMetric = (metric: Metric) => {
    if (editMode === 'create') {
      const next: Metric = {
        ...metric,
        id: newId('metric'),
      }
      onChangeMetrics([...metrics, next])
    } else {
      onChangeMetrics(metrics.map((m) => (m.id === metric.id ? { ...m, ...metric } : m)))
    }
    closeEdit()
  }

  const deleteMetric = (id: string) => {
    onChangeMetrics(metrics.filter((m) => m.id !== id))
    closeEdit()
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        className="metric-history-dialog dash-settings-dialog"
        aria-labelledby={titleId}
        onClose={onClose}
        onClick={(e) => {
          if (e.target === dialogRef.current) onClose()
        }}
      >
        <div className="metric-history-panel">
          <header className="metric-history-head">
            <h2 id={titleId}>Настройки показателей</h2>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Закрыть
            </button>
          </header>

          <p className="muted">
            Нажмите показатель, чтобы изменить название или удалить. Можно добавить новый.
          </p>

          <ul className="dash-settings-list">
            {metrics.map((metric) => {
              const label = metricLabel(metrics, metric.id)
              const valueText = formatMetricValue(metric)
              const unit = metricDisplayUnit(metric)
              return (
                <li key={metric.id}>
                  <button
                    type="button"
                    className="dash-settings-item"
                    onClick={() => openEdit(metric)}
                  >
                    <span className="dash-settings-item-label">{label}</span>
                    <span className="dash-settings-item-value">
                      {valueText}
                      {unit ? ` ${unit}` : ''}
                    </span>
                    <span className="muted dash-settings-item-hint">Изменить</span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="btn-row metric-history-foot">
            <button type="button" className="btn" onClick={openCreate}>
              Добавить показатель
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              aria-busy={busy}
              onClick={onSave}
            >
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
          {message ? <p className="ok">{message}</p> : null}
        </div>
      </dialog>

      <MetricEditDialog
        open={editOpen}
        mode={editMode}
        initial={editTarget}
        onClose={closeEdit}
        onSave={applyMetric}
        onDelete={deleteMetric}
      />
    </>
  )
}
