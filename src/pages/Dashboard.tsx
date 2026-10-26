import { Link } from 'react-router-dom'
import { useCabinet } from '../cabinet/CabinetProvider'
import { VkNewsPanel } from '../components/VkNewsPanel'
import {
  LEAD_METRIC_ID,
  MOSAIC_METRIC_IDS,
  SECONDARY_METRIC_IDS,
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
}: {
  metric: Metric | undefined
  id: MetricId
  variant: 'lead' | 'secondary' | 'mosaic'
}) {
  const label = metric?.label ?? id
  const valueText = metric ? formatMetricValue(metric) : '-'
  const unit = metric ? metricDisplayUnit(metric) : ''
  const aria = `${label}: ${valueText}${unit ? ` ${unit}` : ''}`

  return (
    <Link
      to={`/app/indicators#${id}`}
      className={`kpi-cell kpi-${variant}`}
      aria-label={aria}
      id={`kpi-${id}`}
    >
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">
        {valueText}
        {unit ? <span className="kpi-unit"> {unit}</span> : null}
      </span>
      {metric?.note ? <span className="kpi-note muted">{metric.note}</span> : null}
    </Link>
  )
}

export function Dashboard() {
  const { binding, data, busy, error, reload } = useCabinet()

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

  const metrics = data.indicators.metrics
  const lead = findMetric(metrics, LEAD_METRIC_ID)
  const hasAnyMetric = metrics.length > 0
  const orderCount = data.orders.reduce((n, t) => n + t.items.length, 0)

  return (
    <div className="page dash">
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
      </header>

      {!hasAnyMetric ? (
        <section className="panel dash-empty-kpi" aria-labelledby="kpi-empty">
          <h2 id="kpi-empty">Показатели</h2>
          <p className="muted">Пока пусто. Добавьте метрики или импортируйте экспорт.</p>
          <Link className="btn btn-primary" to="/app/indicators">
            Открыть показатели
          </Link>
        </section>
      ) : (
        <>
          <section className="dash-band dash-lead" aria-label="Ведущий показатель">
            <MetricCell metric={lead} id={LEAD_METRIC_ID} variant="lead" />
          </section>

          <section className="dash-band dash-secondary" aria-label="Вторичные показатели">
            {SECONDARY_METRIC_IDS.map((id) => (
              <MetricCell key={id} metric={findMetric(metrics, id)} id={id} variant="secondary" />
            ))}
          </section>

          <section className="dash-band dash-mosaic" aria-label="Остальные показатели">
            {MOSAIC_METRIC_IDS.map((id) => (
              <MetricCell key={id} metric={findMetric(metrics, id)} id={id} variant="mosaic" />
            ))}
          </section>
        </>
      )}

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
    </div>
  )
}
