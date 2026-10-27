import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCabinet } from '../cabinet/CabinetProvider'
import { DashboardSettingsDialog } from '../components/DashboardSettingsDialog'
import { MetricHistoryDialog } from '../components/MetricHistoryDialog'
import { saveIndicators } from '../lib/drive'
import {
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
  onOpen,
}: {
  metric: Metric | undefined
  id: string
  onOpen: (id: string) => void
}) {
  const label = metric?.label || metricLabel(metric ? [metric] : [], id)
  const valueText = metric ? formatMetricValue(metric) : '-'
  const unit = metric ? metricDisplayUnit(metric) : ''
  const aria = `${label}, стартовое значение: ${valueText}${unit ? ` ${unit}` : ''}. Открыть историю`

  return (
    <button
      type="button"
      className="kpi-cell"
      aria-label={aria}
      id={`kpi-${id}`}
      onClick={() => onOpen(id)}
    >
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">
        {valueText}
        {unit ? <span className="kpi-unit"> {unit}</span> : null}
      </span>
      <span className="kpi-foot">
        <span className="kpi-caption muted">старт</span>
        {metric?.note ? <span className="kpi-note muted">{metric.note}</span> : null}
      </span>
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

        {metrics.length > 0 ? (
          <section className="dash-kpi-grid" aria-label="Стартовые показатели">
            {metrics.map((metric) => (
              <MetricCell
                key={metric.id}
                metric={metric}
                id={metric.id}
                onOpen={setHistoryId}
              />
            ))}
          </section>
        ) : (
          <p className="muted dash-kpi-empty">
            Нет показателей. Добавьте стартовые значения в настройках.
          </p>
        )}
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
