import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCabinet } from '../cabinet/CabinetProvider'
import { DashboardSettingsDialog } from '../components/DashboardSettingsDialog'
import { MetricHistoryDialog } from '../components/MetricHistoryDialog'
import { saveIndicators } from '../lib/drive'
import {
  findMetric,
  formatMetricValue,
  metricDisplayUnit,
  metricLabel,
  normalizeIndicators,
  normalizeMetrics,
} from '../schema/metrics'
import { nowIso, type Metric } from '../schema/province'
import { Onboarding } from './Onboarding'

function MetricCell({
  metric,
  id,
  variant,
  onOpen,
}: {
  metric: Metric | undefined
  id: string
  variant: 'lead' | 'secondary' | 'mosaic'
  onOpen: (id: string) => void
}) {
  const label = metric?.label || metricLabel(metric ? [metric] : [], id)
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
  const ledger = data.indicators.ledger ?? []
  const lead = metrics[0]
  const secondary = metrics.slice(1, 4)
  const mosaic = metrics.slice(4)
  const orderCount = data.orders.reduce((n, t) => n + t.items.length, 0)

  const changeMetrics = (nextMetrics: Metric[]) => {
    setSettingsMsg(null)
    setData({
      ...data,
      indicators: normalizeIndicators({
        ...data.indicators,
        metrics: nextMetrics,
      }),
    })
  }

  const saveSettings = async () => {
    setSettingsMsg(null)
    const token = await ensureToken()
    const next = normalizeIndicators({
      ...data.indicators,
      metrics: data.indicators.metrics,
      ledger: data.indicators.ledger ?? [],
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

        {lead ? (
          <section className="dash-band dash-lead" aria-label="Ведущий показатель">
            <MetricCell
              metric={lead}
              id={lead.id}
              variant="lead"
              onOpen={setHistoryId}
            />
          </section>
        ) : null}

        {secondary.length > 0 ? (
          <section className="dash-band dash-secondary" aria-label="Вторичные показатели">
            {secondary.map((metric) => (
              <MetricCell
                key={metric.id}
                metric={metric}
                id={metric.id}
                variant="secondary"
                onOpen={setHistoryId}
              />
            ))}
          </section>
        ) : null}

        {mosaic.length > 0 ? (
          <section className="dash-band dash-mosaic" aria-label="Остальные показатели">
            {mosaic.map((metric) => (
              <MetricCell
                key={metric.id}
                metric={findMetric(metrics, metric.id) ?? metric}
                id={metric.id}
                variant="mosaic"
                onOpen={setHistoryId}
              />
            ))}
          </section>
        ) : null}
      </div>

      <footer className="dash-end muted">
        <Link to="/app/orders">
          Приказы{orderCount ? ` (${orderCount})` : ''}
        </Link>
      </footer>

      <MetricHistoryDialog
        metricId={historyId}
        metrics={metrics}
        entries={ledger}
        open={historyId != null}
        onClose={() => setHistoryId(null)}
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
