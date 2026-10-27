import { useEffect, useId, useRef, useState } from 'react'
import type { Metric } from '../schema/province'

export type MetricEditDraft = {
  id: string
  label: string
  value: string
  unit: string
  note: string
}

function toDraft(metric: Metric): MetricEditDraft {
  return {
    id: metric.id,
    label: metric.label,
    value: String(metric.value ?? ''),
    unit: metric.unit ?? '',
    note: metric.note ?? '',
  }
}

function parseValue(raw: string): string | number {
  if (raw.trim() === '') return ''
  const num = Number(raw.replace(/\s/g, '').replace(',', '.'))
  return Number.isNaN(num) ? raw : num
}

export function MetricEditDialog({
  open,
  mode,
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean
  mode: 'create' | 'edit'
  initial: Metric | null
  onClose: () => void
  onSave: (metric: Metric) => void
  onDelete?: (id: string) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [draft, setDraft] = useState<MetricEditDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setDraft(null)
      setError(null)
      return
    }
    if (mode === 'create') {
      setDraft({
        id: '',
        label: '',
        value: '',
        unit: '',
        note: '',
      })
    } else if (initial) {
      setDraft(toDraft(initial))
    }
    setError(null)
  }, [open, mode, initial])

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open) {
      if (!el.open) el.showModal()
    } else if (el.open) {
      el.close()
    }
  }, [open])

  const canDelete = mode === 'edit' && draft && onDelete

  const submit = () => {
    if (!draft) return
    const label = draft.label.trim()
    if (!label) {
      setError('Укажите название показателя')
      return
    }
    onSave({
      id: draft.id,
      label,
      value: parseValue(draft.value),
      unit: draft.unit.trim() || undefined,
      note: draft.note.trim() || undefined,
    })
  }

  return (
    <dialog
      ref={dialogRef}
      className="metric-history-dialog metric-edit-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
    >
      <div className="metric-history-panel">
        <header className="metric-history-head">
          <h2 id={titleId}>
            {mode === 'create' ? 'Новый показатель' : 'Изменить показатель'}
          </h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Закрыть
          </button>
        </header>

        {draft ? (
          <div className="stack metric-edit-form">
            <div className="field">
              <label htmlFor="metric-edit-label">Название</label>
              <input
                id="metric-edit-label"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="metric-edit-value">Стартовое значение</label>
              <input
                id="metric-edit-value"
                value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: e.target.value })}
              />
              <p className="muted field-hint">
                База, от которой считаются приказы и записи истории.
              </p>
            </div>
            <div className="field">
              <label htmlFor="metric-edit-unit">Единица</label>
              <input
                id="metric-edit-unit"
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="metric-edit-note">Заметка</label>
              <input
                id="metric-edit-note"
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
            </div>
            {error ? <p className="error">{error}</p> : null}
          </div>
        ) : null}

        <footer className="btn-row metric-history-foot">
          {canDelete ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => draft && onDelete(draft.id)}
            >
              Удалить
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={submit}>
            {mode === 'create' ? 'Добавить' : 'Применить'}
          </button>
        </footer>
      </div>
    </dialog>
  )
}
