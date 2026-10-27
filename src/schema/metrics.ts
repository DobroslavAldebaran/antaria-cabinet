import type {
  Indicators,
  Metric,
  MetricLedgerEntry,
  MetricLedgerKind,
} from './province'

/** Known KPI ids: optional formatting hints only, not locked system metrics. */
export const METRIC_IDS = [
  'budget',
  'population',
  'kr',
  'rob',
  'loyalty_low',
  'loyalty_high',
  'lto',
  'crime',
  'tax',
  'duty',
  'population_growth',
  'chaos_cult',
  'start_army',
] as const

export type MetricId = (typeof METRIC_IDS)[number]

export type MetricKind = 'integer' | 'ratio' | 'plain'

export const METRIC_DEFS: Record<
  MetricId,
  { label: string; unit?: string; kind: MetricKind; note?: string }
> = {
  budget: { label: 'Троны', unit: 'трон', kind: 'integer' },
  population: { label: 'Население', kind: 'integer' },
  kr: { label: 'КР', kind: 'plain' },
  rob: { label: 'РОБ', kind: 'integer' },
  loyalty_low: { label: 'Лояльность низших', unit: '%', kind: 'ratio' },
  loyalty_high: { label: 'Лояльность высших', unit: '%', kind: 'ratio' },
  lto: { label: 'ЛТО', kind: 'integer' },
  crime: { label: 'Преступность', unit: '%', kind: 'ratio' },
  tax: { label: 'Налог', kind: 'plain' },
  duty: { label: 'Пошлина', unit: '%', kind: 'ratio' },
  population_growth: { label: 'Прирост населения', unit: '%', kind: 'ratio' },
  chaos_cult: { label: 'Культ хаоса', unit: '%', kind: 'ratio' },
  start_army: { label: 'Стартовая армия', unit: '%', kind: 'ratio' },
}

export const LEDGER_KIND_LABELS: Record<MetricLedgerKind, string> = {
  start: 'Старт',
  order: 'Приказ',
  between_turns: 'Между ходами',
  manual: 'Вручную',
}

export function isKnownMetricId(id: string): id is MetricId {
  return (METRIC_IDS as readonly string[]).includes(id)
}

/** @deprecated Use isKnownMetricId. Kept for older call sites. */
export const isCanonicalMetricId = isKnownMetricId

export function formatMetricValue(metric: Pick<Metric, 'id' | 'value' | 'unit'>): string {
  const def = isKnownMetricId(metric.id) ? METRIC_DEFS[metric.id] : undefined
  const raw = metric.value
  if (raw === '' || raw == null) return '-'
  const num = typeof raw === 'number' ? raw : Number(String(raw).replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(num)) return String(raw)

  if (def?.kind === 'ratio' || metric.unit === '%') {
    const pct = Math.abs(num) <= 1.5 ? num * 100 : num
    const rounded = Math.round(pct * 100) / 100
    return `${rounded} %`
  }
  if (def?.kind === 'integer' || Number.isInteger(num)) {
    return Math.round(num).toLocaleString('ru-RU')
  }
  const rounded = Math.round(num * 1000) / 1000
  return String(rounded)
}

export function metricDisplayUnit(metric: Pick<Metric, 'id' | 'unit'>): string {
  const def = isKnownMetricId(metric.id) ? METRIC_DEFS[metric.id] : undefined
  if (def?.kind === 'ratio' || metric.unit === '%') return ''
  return metric.unit || def?.unit || ''
}

export function formatLedgerAmount(
  raw: number | string | undefined,
  signed: boolean,
): string {
  if (raw === undefined || raw === '') return '-'
  const num = typeof raw === 'number' ? raw : Number(String(raw).replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(num)) return String(raw)
  const abs = Math.abs(num).toLocaleString('ru-RU')
  if (!signed) return abs
  if (num > 0) return `+${abs}`
  if (num < 0) return `\u2212${abs}`
  return '0'
}

export function findMetric(metrics: Metric[], id: string): Metric | undefined {
  return metrics.find((m) => m.id === id)
}

export function metricLabel(metrics: Metric[], id: string): string {
  const fromList = findMetric(metrics, id)?.label
  if (fromList) return fromList
  if (isKnownMetricId(id)) return METRIC_DEFS[id].label
  return id
}

function scrubMetricNote(note: string | undefined): string | undefined {
  if (!note || note === 'ОР = РОБ') return undefined
  return note
}

/** Normalize stored metrics without forcing a fixed catalog. */
export function normalizeMetrics(metrics: Metric[]): Metric[] {
  const seen = new Set<string>()
  const next: Metric[] = []
  for (const metric of metrics) {
    if (!metric?.id || seen.has(metric.id)) continue
    seen.add(metric.id)
    const def = isKnownMetricId(metric.id) ? METRIC_DEFS[metric.id] : undefined
    const label = metric.label?.trim() || def?.label || metric.id
    next.push({
      ...metric,
      label,
      unit: metric.unit ?? def?.unit,
      note: scrubMetricNote(metric.note),
    })
  }
  return next
}

/** @deprecated Use normalizeMetrics. */
export function ensureCanonicalMetrics(metrics: Metric[]): Metric[] {
  return normalizeMetrics(metrics)
}

export function sortLedgerEntries(entries: MetricLedgerEntry[]): MetricLedgerEntry[] {
  return [...entries].sort((a, b) => {
    const aStart = a.kind === 'start' ? 0 : 1
    const bStart = b.kind === 'start' ? 0 : 1
    if (aStart !== bStart) return aStart - bStart
    const aTurn = a.turn ?? Number.POSITIVE_INFINITY
    const bTurn = b.turn ?? Number.POSITIVE_INFINITY
    if (aTurn !== bTurn) return aTurn - bTurn
    return String(a.at ?? '').localeCompare(String(b.at ?? ''))
  })
}

export function pruneLedgerForMetrics(
  ledger: MetricLedgerEntry[],
  metrics: Metric[],
): MetricLedgerEntry[] {
  const ids = new Set(metrics.map((m) => m.id))
  return ledger.filter((entry) => ids.has(entry.metricId))
}

export function normalizeIndicators(indicators: Indicators): Indicators {
  const metrics = normalizeMetrics(indicators.metrics)
  return {
    ...indicators,
    metrics,
    ledger: pruneLedgerForMetrics(indicators.ledger ?? [], metrics),
  }
}
