import { useEffect, useId, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  LEDGER_KIND_LABELS,
  formatLedgerAmount,
  formatMetricValue,
  isBirthLedgerEntry,
  metricLabel,
  sortLedgerEntries,
} from '../schema/metrics'
import type { Metric, MetricLedgerEntry } from '../schema/province'

const PLACEHOLDER_BIRTH_TITLE = 'Появился показатель'

export function MetricHistoryDialog({
  metricId,
  metrics,
  entries,
  open,
  onClose,
  eventTitles,
  orderTitles,
}: {
  metricId: string | null
  metrics: Metric[]
  entries: MetricLedgerEntry[]
  open: boolean
  onClose: () => void
  /** Resolve legacy birth rows that stored a placeholder instead of the source title. */
  eventTitles?: Record<string, string>
  orderTitles?: Record<string, string>
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const label = metricId ? metricLabel(metrics, metricId) : ''
  const metric = metricId
    ? metrics.find((m) => m.id === metricId)
    : undefined
  const rows = metricId
    ? sortLedgerEntries(entries.filter((e) => e.metricId === metricId))
    : []

  const rowTitle = (row: MetricLedgerEntry): string => {
    if (row.title !== PLACEHOLDER_BIRTH_TITLE) return row.title
    if (row.eventId && eventTitles?.[row.eventId]) return eventTitles[row.eventId]
    if (row.orderId && orderTitles?.[row.orderId]) return orderTitles[row.orderId]
    return row.title
  }

  const formatAmount = (
    raw: number | string | undefined,
    signed: boolean,
  ): string => {
    if (!metric || raw === undefined || raw === '') {
      return formatLedgerAmount(raw, signed)
    }
    if (!signed) return formatMetricValue({ ...metric, value: raw })
    const num =
      typeof raw === 'number'
        ? raw
        : Number(String(raw).replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(num)) return String(raw)
    const body = formatMetricValue({ ...metric, value: Math.abs(num) })
    if (num > 0) return `+${body}`
    if (num < 0) return `\u2212${body}`
    return body
  }

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
            Пока нет записей. Измените показатель в настройках дашборда или импортируйте JSON.
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
                  <strong className="metric-history-title">{rowTitle(row)}</strong>
                  <span className="metric-history-amounts">
                    {isBirthLedgerEntry(row) ? (
                      <>
                        {row.kind === 'start' ? 'Старт' : 'Появился'}:{' '}
                        {formatAmount(row.balanceAfter ?? row.delta, false)}
                      </>
                    ) : (
                      <>
                        {formatAmount(row.delta, true)}
                        {row.balanceAfter !== undefined && row.balanceAfter !== ''
                          ? ` → ${formatAmount(row.balanceAfter, false)}`
                          : null}
                      </>
                    )}
                  </span>
                  {row.note ? <p className="muted metric-history-note">{row.note}</p> : null}
                </div>
                <div className="btn-row">
                  {row.orderTurn != null ? (
                    <Link
                      className="btn btn-ghost"
                      to={`/app/orders?turn=${row.orderTurn}`}
                      onClick={onClose}
                    >
                      К приказу
                    </Link>
                  ) : null}
                  {row.verdictTurn != null ? (
                    <Link
                      className="btn btn-ghost"
                      to={`/app/verdicts?turn=${row.verdictTurn}`}
                      onClick={onClose}
                    >
                      К вердикту
                    </Link>
                  ) : null}
                  {row.eventId ? (
                    <Link
                      className="btn btn-ghost"
                      to={`/app/events?id=${row.eventId}`}
                      onClick={onClose}
                    >
                      К событию
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  )
}
