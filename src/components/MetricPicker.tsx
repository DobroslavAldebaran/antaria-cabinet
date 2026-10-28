import { useEffect, useId, useRef, useState } from 'react'
import { metricLabel } from '../schema/metrics'
import type { Metric } from '../schema/province'

export function MetricPicker({
  metrics,
  value,
  onChange,
  disabled,
}: {
  metrics: Metric[]
  value: string
  onChange: (metricId: string) => void
  disabled?: boolean
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const label = value ? metricLabel(metrics, value) : 'Выберите показатель'

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="metric-picker" ref={rootRef}>
      <button
        type="button"
        className="btn metric-picker-trigger"
        disabled={disabled || metrics.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(true)
          }
          if (e.key === 'Escape') setOpen(false)
        }}
      >
        {label}
        <span className="metric-picker-chevron" aria-hidden />
      </button>
      {open ? (
        <ul
          id={listId}
          className="metric-picker-list"
          role="listbox"
          aria-label="Показатели"
        >
          {metrics.map((m) => {
            const selected = m.id === value
            return (
              <li key={m.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={
                    selected
                      ? 'metric-picker-option is-selected'
                      : 'metric-picker-option'
                  }
                  onClick={() => {
                    onChange(m.id)
                    setOpen(false)
                  }}
                >
                  {metricLabel(metrics, m.id)}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
