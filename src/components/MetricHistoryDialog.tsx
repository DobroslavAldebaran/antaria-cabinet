import { useEffect, useId, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  LEDGER_KIND_LABELS,
  METRIC_DEFS,
  formatLedgerAmount,
  sortLedgerEntries,
  type MetricId,
} from '../schema/metrics'
import type { MetricLedgerEntry } from '../schema/province'

export function MetricHistoryDialog({
  metricId,
  entries,
  open,
  onClose,
}: {
  metricId: MetricId | null
  entries: MetricLedgerEntry[]
  open: boolean
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const label = metricId ? METRIC_DEFS[metricId].label : ''
  const rows = metricId
    ? sortLedgerEntries(entries.filter((e) => e.metricId === metricId))
    : []

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && metricId) {
      if (!el.open) el.showModal()
    } else if (el.open) {
      el.close()
    }
  }, [open, metricId])

  return (
    <dialog
      ref={dialogRef}
      className="metric-history-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
    >
      <div className="metric-history-panel">
        <header className="metric-history-head">
          <h2 id={titleId}>История: {label}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Закрыть
          </button>
        </header>

        {rows.length === 0 ? (
          <p className="muted">
            Пока нет записей. Добавьте в Показателях или импортируйте JSON.
          </p>
        ) : (
          <ul className="metric-history-list">
            {rows.map((row) => (
              <li key={row.id} className="metric-history-row">
                <div className="metric-history-row-main">
                  <span className="metric-history-meta muted">
                    {row.turn != null ? `ход ${row.turn}` : 'ход н/д'}
                    {' · '}
                    {LEDGER_KIND_LABELS[row.kind]}
                  </span>
                  <strong className="metric-history-title">{row.title}</strong>
                  <span className="metric-history-amounts">
                    {row.kind === 'start' ? (
                      <>Старт: {formatLedgerAmount(row.balanceAfter ?? row.delta, false)}</>
                    ) : (
                      <>
                        {formatLedgerAmount(row.delta, true)}
                        {row.balanceAfter !== undefined && row.balanceAfter !== ''
                          ? ` → ${formatLedgerAmount(row.balanceAfter, false)}`
                          : null}
                      </>
                    )}
                  </span>
                  {row.note ? <p className="muted metric-history-note">{row.note}</p> : null}
                </div>
                {row.orderTurn != null ? (
                  <Link
                    className="btn btn-ghost"
                    to={`/app/orders?turn=${row.orderTurn}`}
                    onClick={onClose}
                  >
                    К приказу
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <footer className="btn-row metric-history-foot">
          {metricId ? (
            <Link
              className="btn btn-primary"
              to={`/app/indicators#${metricId}`}
              onClick={onClose}
            >
              Править показатели
            </Link>
          ) : null}
        </footer>
      </div>
    </dialog>
  )
}
