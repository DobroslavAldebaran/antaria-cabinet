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
  const [dragId, setDragId] = useState<string | null>(null)

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
      setDragId(null)
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

  const moveMetric = (fromId: string, toId: string) => {
    if (fromId === toId) return
    const from = metrics.findIndex((m) => m.id === fromId)
    const to = metrics.findIndex((m) => m.id === toId)
    if (from < 0 || to < 0) return
    const next = [...metrics]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChangeMetrics(next)
  }

  const shiftMetric = (id: string, dir: -1 | 1) => {
    const idx = metrics.findIndex((m) => m.id === id)
    if (idx < 0) return
    const to = idx + dir
    if (to < 0 || to >= metrics.length) return
    const next = [...metrics]
    const [item] = next.splice(idx, 1)
    next.splice(to, 0, item)
    onChangeMetrics(next)
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
            Перетащите строки или стрелки, чтобы изменить порядок на дашборде. Нажмите
            показатель, чтобы изменить название или удалить.
          </p>

          <ul className="dash-settings-list">
            {metrics.map((metric, idx) => {
              const label = metricLabel(metrics, metric.id)
              const valueText = formatMetricValue(metric)
              const unit = metricDisplayUnit(metric)
              return (
                <li
                  key={metric.id}
                  className={
                    dragId === metric.id
                      ? 'dash-settings-row is-dragging'
                      : 'dash-settings-row'
                  }
                  draggable
                  onDragStart={(e) => {
                    setDragId(metric.id)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', metric.id)
                  }}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const fromId =
                      e.dataTransfer.getData('text/plain') || dragId || ''
                    moveMetric(fromId, metric.id)
                    setDragId(null)
                  }}
                >
                  <span
                    className="dash-settings-handle"
                    title="Перетащить"
                    aria-hidden
                  >
                    ⋮⋮
                  </span>
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
                  <div className="dash-settings-move">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`Выше: ${label}`}
                      disabled={idx === 0}
                      onClick={() => shiftMetric(metric.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`Ниже: ${label}`}
                      disabled={idx === metrics.length - 1}
                      onClick={() => shiftMetric(metric.id, 1)}
                    >
                      ↓
                    </button>
                  </div>
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
