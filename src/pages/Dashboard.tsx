import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCabinet } from '../cabinet/CabinetProvider'
import { MetricHistoryDialog } from '../components/MetricHistoryDialog'
import { VkNewsPanel } from '../components/VkNewsPanel'
import {
  LEAD_METRIC_ID,
  METRIC_DEFS,
  MOSAIC_METRIC_IDS,
  SECONDARY_METRIC_IDS,
  ensureCanonicalMetrics,
  findMetric,
  formatMetricValue,
  metricDisplayUnit,
  type MetricId,
} from '../schema/metrics'
import type { Metric } from '../schema/province'
import { Onboarding } from './Onboarding'

function MetricCell({
  metric,
  id,
  variant,
  onOpen,
}: {
  metric: Metric | undefined
  id: MetricId
  variant: 'lead' | 'secondary' | 'mosaic'
  onOpen: (id: MetricId) => void
}) {
  const label = METRIC_DEFS[id].label
  const valueText = metric ? formatMetricValue(metric) : '-'
  const unit = metric ? metricDisplayUnit(metric) : ''
  const aria = `${label}: ${valueText}${unit ? ` ${unit}` : ''}. Открыть историю`

  return (
    <button
      type="button"
      className={`kpi-cell kpi-${variant}`}
      aria-label={aria}
      id={`kpi-${id}`}
      onClick={() => onOpen(id)}
    >
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">
        {valueText}
        {unit ? <span className="kpi-unit"> {unit}</span> : null}
      </span>
      {metric?.note ? <span className="kpi-note muted">{metric.note}</span> : null}
    </button>
  )
}

export function Dashboard() {
  const { binding, data, busy, error, reload } = useCabinet()
  const [historyId, setHistoryId] = useState<MetricId | null>(null)

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

  const metrics = ensureCanonicalMetrics(data.indicators.metrics)
  const ledger = data.indicators.ledger ?? []
  const lead = findMetric(metrics, LEAD_METRIC_ID)
  const orderCount = data.orders.reduce((n, t) => n + t.items.length, 0)
  const hasValues = metrics.some((m) => m.value !== '' && m.value != null)

  return (
    <div className="page dash">
      <div className="dash-kpi-screen">
        <header className="dash-masthead panel">
          <div className="dash-masthead-text">
            <h1 className="dash-title">
              {data.meta.provinceName || 'Провинция без имени'}
            </h1>
            <p className="dash-turn muted">ход {data.meta.currentTurn}</p>
            <p className="dash-meta muted">
              {data.meta.ruler ? <>Правитель: {data.meta.ruler}</> : null}
              {data.meta.ruler && data.meta.faction ? ' · ' : null}
              {data.meta.faction ? <>Фракция: {data.meta.faction}</> : null}
              {(data.meta.ruler || data.meta.faction) && binding.folderName ? ' · ' : null}
              {binding.folderName ? <>Папка: {binding.folderName}</> : null}
            </p>
          </div>
          <div className="btn-row dash-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void reload()}
            >
              {busy ? 'Обновление…' : 'Обновить'}
            </button>
            <Link className="btn btn-ghost" to="/app/io">
              Импорт / Экспорт
            </Link>
          </div>
          {error && <p className="error">{error}</p>}
          {!hasValues ? (
            <p className="muted dash-import-hint">
              Показатели пусты.{' '}
              <Link to="/app/io">Импортируйте JSON</Link> или заполните в Показателях.
            </p>
          ) : null}
        </header>

        <section className="dash-band dash-lead" aria-label="Ведущий показатель">
          <MetricCell
            metric={lead}
            id={LEAD_METRIC_ID}
            variant="lead"
            onOpen={setHistoryId}
          />
        </section>

        <section className="dash-band dash-secondary" aria-label="Вторичные показатели">
          {SECONDARY_METRIC_IDS.map((id) => (
            <MetricCell
              key={id}
              metric={findMetric(metrics, id)}
              id={id}
              variant="secondary"
              onOpen={setHistoryId}
            />
          ))}
        </section>

        <section className="dash-band dash-mosaic" aria-label="Остальные показатели">
          {MOSAIC_METRIC_IDS.map((id) => (
            <MetricCell
              key={id}
              metric={findMetric(metrics, id)}
              id={id}
              variant="mosaic"
              onOpen={setHistoryId}
            />
          ))}
        </section>
      </div>

      <VkNewsPanel localNews={data.news} />

      <footer className="dash-end muted">
        <Link to="/app/orders">
          Приказы{orderCount ? ` (${orderCount})` : ''}
        </Link>
        {' · '}
        <Link to="/app/military">Военка</Link>
        {' · '}
        <Link to="/app/board">Доска</Link>
      </footer>

      <MetricHistoryDialog
        metricId={historyId}
        entries={ledger}
        open={historyId != null}
        onClose={() => setHistoryId(null)}
      />
    </div>
  )
}
