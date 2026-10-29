import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCabinet } from '../cabinet/CabinetProvider'
import { DashboardSettingsDialog } from '../components/DashboardSettingsDialog'
import { MetricHistoryDialog } from '../components/MetricHistoryDialog'
import { saveIndicators } from '../lib/drive'
import {
  formatCommittedWithPending,
  formatMetricValue,
  metricDisplayUnit,
  metricLabel,
  normalizeIndicators,
  normalizeMetrics,
  parseMetricNumber,
  pendingCreatedMetrics,
  sumPendingByMetric,
} from '../schema/metrics'
import { newId, nowIso, type Metric } from '../schema/province'
import { Onboarding } from './Onboarding'

function MetricCell({
  metric,
  id,
  pending,
  claimed,
  onOpen,
}: {
  metric: Metric | undefined
  id: string
  pending: number
  claimed?: boolean
  onOpen: (id: string) => void
}) {
  const label = metric?.label || metricLabel(metric ? [metric] : [], id)
  const numeric = metric ? parseMetricNumber(metric.value) : null
  const display =
    metric && numeric != null
      ? formatCommittedWithPending(metric.value, pending, metric)
      : {
          base: metric ? String(metric.value ?? '-') : '-',
          pendingText: null as string | null,
        }
  const unit = metric ? metricDisplayUnit(metric) : ''
  const planned =
    metric && numeric != null && pending !== 0
      ? formatMetricValue({ ...metric, value: numeric + pending })
      : null
  const caption = claimed ? 'заявлено' : pending !== 0 ? 'ожидается' : null
  const valueAria = display.pendingText
    ? `${display.base} ${display.pendingText}`
    : display.base
  const aria = `${label}, значение: ${valueAria}${unit ? ` ${unit}` : ''}${
    planned ? `, планируемый итог: ${planned}` : ''
  }${caption ? `, ${caption}` : ''}. Открыть историю`

  return (
    <button
      type="button"
      className={claimed ? 'kpi-cell is-claimed' : 'kpi-cell'}
      aria-label={aria}
      id={`kpi-${id}`}
      onClick={() => onOpen(id)}
    >
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">
        {display.base}
        {unit ? <span className="kpi-unit"> {unit}</span> : null}
        {display.pendingText ? (
          <span
            className={
              pending > 0 ? 'kpi-delta is-pos' : 'kpi-delta is-neg'
            }
          >
            {' '}
            {display.pendingText}
          </span>
        ) : null}
      </span>
      {planned || caption || metric?.note ? (
        <span className="kpi-foot">
          {planned ? <span className="kpi-planned">{planned}</span> : null}
          {caption ? (
            <span className="kpi-caption muted">{caption}</span>
          ) : null}
          {metric?.note ? (
            <span className="kpi-note muted">{metric.note}</span>
          ) : null}
        </span>
      ) : null}
    </button>
  )
}

export function Dashboard() {
  const { binding, data, setData, ensureToken, busy, error, reload } = useCabinet()
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null)

  if (!binding) return <Onboarding />

  if (busy && !data) {
    return <div className="page muted">Загрузка кабинета…</div>
  }

  if (!data) {
    return (
      <div className="page">
        <p className="error">{error ?? 'Нет данных'}</p>
        <button type="button" className="btn" onClick={() => void reload()}>
          Повторить
        </button>
      </div>
    )
  }

  const metrics = normalizeMetrics(data.indicators.metrics)
  const events = data.events?.items ?? []
  const claimedMetrics = pendingCreatedMetrics(
    data.orders,
    data.verdicts,
    metrics,
    events,
  )
  const displayMetrics = [...metrics, ...claimedMetrics]
  const ledger = data.indicators.ledger ?? []
  const pendingMap = sumPendingByMetric(
    data.orders,
    data.verdicts,
    events,
    ledger,
  )
  const claimedIds = new Set(claimedMetrics.map((m) => m.id))
  const orderCount = data.orders.reduce((n, t) => n + t.items.length, 0)
  const eventTitles = Object.fromEntries(
    events
      .filter((e) => e.id && e.title?.trim())
      .map((e) => [e.id, e.title.trim()]),
  )
  const orderTitles = Object.fromEntries(
    data.orders.flatMap((turn) =>
      turn.items
        .filter((item) => item.id && item.title?.trim())
        .map((item) => [item.id, item.title.trim()]),
    ),
  )

  const changeMetrics = (nextMetrics: Metric[]) => {
    setSettingsMsg(null)
    const prevById = new Map(data.indicators.metrics.map((m) => [m.id, m]))
    const at = nowIso()
    const ledger = [...(data.indicators.ledger ?? [])]

    for (const metric of nextMetrics) {
      const prev = prevById.get(metric.id)
      if (!prev || prev.value === metric.value) continue
      const prevN = parseMetricNumber(prev.value)
      const nextN = parseMetricNumber(metric.value)
      if (prevN == null || nextN == null || prevN === nextN) continue
      ledger.push({
        id: newId('led'),
        metricId: metric.id,
        kind: 'manual',
        delta: nextN - prevN,
        balanceAfter: nextN,
        title: `Правка: ${metric.label || metric.id}`,
        at,
      })
    }

    setData({
      ...data,
      indicators: normalizeIndicators({
        ...data.indicators,
        metrics: nextMetrics,
        ledger,
        updatedAt: at,
      }),
    })
  }

  const saveSettings = async () => {
    setSettingsMsg(null)
    const token = await ensureToken()
    const next = normalizeIndicators({
      ...data.indicators,
      updatedAt: nowIso(),
    })
    await saveIndicators(token, binding.folderId, next)
    setData({ ...data, indicators: next })
    setSettingsMsg('Сохранено на Drive')
  }

  return (
    <div className="page dash">
      <div className="dash-kpi-screen">
        <header className="dash-masthead panel">
          <p className="dash-turn muted">ход {data.meta.currentTurn}</p>
          <div className="btn-row dash-actions">
            <button
              type="button"
              className="btn btn-ghost"
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
              onClick={() => {
                setSettingsMsg(null)
                setSettingsOpen(true)
              }}
            >
              Настройки
            </button>
          </div>
        </header>

        {displayMetrics.length > 0 ? (
          <section className="dash-kpi-grid" aria-label="Показатели">
            {displayMetrics.map((metric) => (
              <MetricCell
                key={metric.id}
                metric={metric}
                id={metric.id}
                pending={pendingMap.get(metric.id) ?? 0}
                claimed={claimedIds.has(metric.id)}
                onOpen={setHistoryId}
              />
            ))}
          </section>
        ) : (
          <p className="muted dash-kpi-empty">
            Нет показателей. Добавьте значения в настройках.
          </p>
        )}
      </div>

      <footer className="dash-end muted">
        <Link to="/app/orders">
          Приказы{orderCount ? ` (${orderCount})` : ''}
        </Link>
        {' · '}
        <Link to="/app/verdicts">Вердикты</Link>
        {' · '}
        <Link to="/app/events">События</Link>
        {' · '}
        <Link to="/app/characters">Персонажи</Link>
        {' · '}
        <Link to="/app/ministries">Министерства</Link>
      </footer>

      <MetricHistoryDialog
        metricId={historyId}
        metrics={displayMetrics}
        entries={ledger}
        open={historyId != null}
        onClose={() => setHistoryId(null)}
        eventTitles={eventTitles}
        orderTitles={orderTitles}
      />

      <DashboardSettingsDialog
        open={settingsOpen}
        metrics={metrics}
        busy={busy}
        message={settingsMsg}
        onClose={() => setSettingsOpen(false)}
        onChangeMetrics={changeMetrics}
        onSave={() => void saveSettings()}
      />
    </div>
  )
}
