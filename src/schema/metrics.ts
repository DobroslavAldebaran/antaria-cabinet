import {
  newId,
  nowIso,
  type CabinetEvent,
  type Effect,
  type Indicators,
  type Metric,
  type MetricLedgerEntry,
  type MetricLedgerKind,
  type OrdersTurn,
  type VerdictTurn,
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
  verdict: 'Вердикт',
  event: 'Событие',
}

export function parseMetricNumber(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === '') return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const num = Number(String(raw).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(num) ? num : null
}

export function committedOrderIds(verdicts: VerdictTurn[]): Set<string> {
  const ids = new Set<string>()
  for (const v of verdicts) {
    for (const c of v.commits) {
      for (const id of c.orderIds) ids.add(id)
    }
  }
  return ids
}

/** Orders already claimed by any verdict commit or draft selection. */
export function linkedOrderIds(
  verdicts: VerdictTurn[],
  exceptTurn?: number,
): Set<string> {
  const ids = committedOrderIds(verdicts)
  for (const v of verdicts) {
    if (exceptTurn != null && v.turn === exceptTurn) continue
    for (const id of v.orderIds) ids.add(id)
  }
  return ids
}

export function isOrderLinked(
  orderId: string,
  verdicts: VerdictTurn[],
): boolean {
  return linkedOrderIds(verdicts).has(orderId)
}

export function isVerdictLinked(verdict: VerdictTurn): boolean {
  return verdict.commits.length > 0
}

/** Undo an event's ledger impact (effects + birth metrics) and drop its rows. */
export function revertEventFromIndicators(
  indicators: Indicators,
  eventId: string,
): Indicators {
  const ledger = indicators.ledger ?? []
  const eventRows = ledger.filter((row) => row.eventId === eventId)
  if (eventRows.length === 0) return indicators

  let metrics = [...indicators.metrics]

  for (const row of eventRows) {
    if (isBirthLedgerEntry(row)) continue
    const delta = parseMetricNumber(row.delta)
    if (delta == null) continue
    const idx = metrics.findIndex((m) => m.id === row.metricId)
    if (idx < 0) continue
    const current = parseMetricNumber(metrics[idx].value)
    if (current == null) continue
    metrics[idx] = { ...metrics[idx], value: current - delta }
  }

  const bornIds = new Set(
    eventRows.filter(isBirthLedgerEntry).map((row) => row.metricId),
  )
  if (bornIds.size > 0) {
    metrics = metrics.filter((m) => !bornIds.has(m.id))
  }

  const keepIds = new Set(metrics.map((m) => m.id))
  const nextLedger = ledger.filter(
    (row) => row.eventId !== eventId && keepIds.has(row.metricId),
  )

  return {
    ...indicators,
    metrics,
    ledger: nextLedger,
    updatedAt: nowIso(),
  }
}

/** Sum of effects not yet committed: orders, verdict drafts, unapplied events. */
export function sumPendingByMetric(
  orders: OrdersTurn[],
  verdicts: VerdictTurn[],
  events: CabinetEvent[] = [],
  ledger: MetricLedgerEntry[] = [],
): Map<string, number> {
  const committed = committedOrderIds(verdicts)
  const pending = new Map<string, number>()
  const add = (metricId: string, delta: number) => {
    pending.set(metricId, (pending.get(metricId) ?? 0) + delta)
  }

  for (const turn of orders) {
    for (const item of turn.items) {
      if (committed.has(item.id)) continue
      for (const effect of item.effects ?? []) {
        add(effect.metricId, effect.delta)
      }
    }
  }

  for (const turn of verdicts) {
    for (const effect of turn.effects ?? []) {
      add(effect.metricId, effect.delta)
    }
  }

  const appliedEvents = new Set(
    ledger
      .map((row) => row.eventId)
      .filter((id): id is string => Boolean(id)),
  )
  for (const item of events) {
    if (appliedEvents.has(item.id)) continue
    for (const effect of item.effects ?? []) {
      add(effect.metricId, effect.delta)
    }
  }

  return pending
}

/** Metrics drafted on orders/events/verdicts and not yet in indicators. */
export function pendingCreatedMetrics(
  orders: OrdersTurn[],
  verdicts: VerdictTurn[],
  existing: Metric[],
  events: CabinetEvent[] = [],
): Metric[] {
  const committed = committedOrderIds(verdicts)
  const known = new Set(existing.map((m) => m.id))
  const out: Metric[] = []
  const take = (list: Metric[] | undefined) => {
    for (const metric of list ?? []) {
      if (!metric?.id || known.has(metric.id)) continue
      known.add(metric.id)
      out.push(metric)
    }
  }

  for (const turn of orders) {
    for (const item of turn.items) {
      if (committed.has(item.id)) continue
      take(item.createdMetrics)
    }
  }

  for (const turn of verdicts) {
    take(turn.createdMetrics)
  }

  for (const item of events) {
    take(item.createdMetrics)
  }

  return normalizeMetrics(out)
}

export type MergeCreatedMeta = {
  kind: 'order' | 'event' | 'verdict'
  title?: string
  turn?: number
  orderId?: string
  orderTurn?: number
  eventId?: string
  at?: string
}

/** Append unknown metrics and write birth ledger rows (idempotent by metric id). */
export function mergeCreatedMetrics(
  indicators: Indicators,
  created: Metric[],
  meta: MergeCreatedMeta,
): Indicators {
  if (!created.length) return indicators
  const metrics = [...indicators.metrics]
  const known = new Set(metrics.map((m) => m.id))
  const ledger = [...(indicators.ledger ?? [])]
  const at = meta.at ?? nowIso()
  let changed = false

  for (const raw of created) {
    if (!raw?.id || known.has(raw.id)) continue
    const metric = normalizeMetrics([raw])[0]
    if (!metric) continue
    known.add(metric.id)
    metrics.push(metric)
    changed = true
    ledger.push({
      id: newId('led'),
      metricId: metric.id,
      kind: meta.kind,
      turn: meta.turn,
      balanceAfter: metric.value,
      title: meta.title ?? 'Появился показатель',
      orderId: meta.orderId,
      orderTurn: meta.orderTurn,
      eventId: meta.eventId,
      at,
    })
  }

  if (!changed) return indicators
  return {
    ...indicators,
    metrics,
    ledger,
    updatedAt: at,
  }
}

/** True when a ledger row records metric birth rather than a numeric delta. */
export function isBirthLedgerEntry(row: MetricLedgerEntry): boolean {
  if (row.kind === 'start') return true
  if (row.delta !== undefined && row.delta !== '') return false
  return row.balanceAfter !== undefined && row.balanceAfter !== ''
}

export type ApplyEffectMeta = {
  kind: Exclude<MetricLedgerKind, 'start'>
  title: string
  turn?: number
  orderId?: string
  orderTurn?: number
  verdictTurn?: number
  eventId?: string
  note?: string
  at?: string
}

/** Apply numeric deltas to metrics and append ledger rows. */
export function applyEffectsToIndicators(
  indicators: Indicators,
  effects: Effect[],
  meta: ApplyEffectMeta,
): Indicators {
  if (effects.length === 0) return indicators
  const metrics = [...indicators.metrics]
  const ledger = [...(indicators.ledger ?? [])]
  const at = meta.at ?? nowIso()

  for (const effect of effects) {
    const idx = metrics.findIndex((m) => m.id === effect.metricId)
    if (idx < 0) continue
    const metric = metrics[idx]
    const current = parseMetricNumber(metric.value)
    if (current == null) continue
    const balanceAfter = current + effect.delta
    metrics[idx] = { ...metric, value: balanceAfter }
    ledger.push({
      id: newId('led'),
      metricId: effect.metricId,
      kind: meta.kind,
      turn: meta.turn,
      delta: effect.delta,
      balanceAfter,
      title: meta.title,
      orderId: meta.orderId,
      orderTurn: meta.orderTurn,
      verdictTurn: meta.verdictTurn,
      eventId: meta.eventId,
      note: effect.note ?? meta.note,
      at,
    })
  }

  return {
    ...indicators,
    metrics,
    ledger,
    updatedAt: at,
  }
}

/** Record a manual value change when the numeric balance actually moves. */
export function applyManualMetricValue(
  indicators: Indicators,
  metricId: string,
  nextValue: string | number,
  title = 'Ручная правка',
): Indicators {
  const metric = indicators.metrics.find((m) => m.id === metricId)
  if (!metric) return indicators
  const prev = parseMetricNumber(metric.value)
  const next = parseMetricNumber(nextValue)
  const metrics = indicators.metrics.map((m) =>
    m.id === metricId ? { ...m, value: nextValue } : m,
  )
  if (prev == null || next == null || prev === next) {
    return { ...indicators, metrics, updatedAt: nowIso() }
  }
  const at = nowIso()
  const ledger = [
    ...(indicators.ledger ?? []),
    {
      id: newId('led'),
      metricId,
      kind: 'manual' as const,
      delta: next - prev,
      balanceAfter: next,
      title,
      at,
    },
  ]
  return { ...indicators, metrics, ledger, updatedAt: at }
}

export function formatCommittedWithPending(
  committed: string | number,
  pending: number,
  metric: Pick<Metric, 'id' | 'unit'>,
): { base: string; pendingText: string | null } {
  const base = formatMetricValue({ ...metric, value: committed })
  if (!pending) return { base, pendingText: null }
  return { base, pendingText: formatLedgerAmount(pending, true) }
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
