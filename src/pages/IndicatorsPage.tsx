import { useEffect, useState } from 'react'
import { useCabinet } from '../cabinet/CabinetProvider'
import { saveIndicators } from '../lib/drive'
import {
  LEDGER_KIND_LABELS,
  METRIC_DEFS,
  METRIC_IDS,
  ensureCanonicalMetrics,
  formatLedgerAmount,
  normalizeIndicators,
  sortLedgerEntries,
  type MetricId,
} from '../schema/metrics'
import {
  newId,
  nowIso,
  type Indicators,
  type MetricLedgerEntry,
  type MetricLedgerKind,
} from '../schema/province'
import { Onboarding } from './Onboarding'

const KIND_OPTIONS: MetricLedgerKind[] = [
  'start',
  'order',
  'between_turns',
  'manual',
]

type DraftEntry = {
  kind: MetricLedgerKind
  turn: string
  delta: string
  balanceAfter: string
  title: string
  note: string
  orderTurn: string
  orderId: string
}

function emptyDraft(): DraftEntry {
  return {
    kind: 'manual',
    turn: '',
    delta: '',
    balanceAfter: '',
    title: '',
    note: '',
    orderTurn: '',
    orderId: '',
  }
}

function parseOptionalNumber(raw: string): number | string | undefined {
  if (raw.trim() === '') return undefined
  const num = Number(raw.replace(/\s/g, '').replace(',', '.'))
  return Number.isNaN(num) ? raw : num
}

export function IndicatorsPage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [msg, setMsg] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Partial<Record<MetricId, DraftEntry>>>({})

  useEffect(() => {
    if (!binding || !data) return
    const hash = window.location.hash.replace(/^#/, '')
    if (!hash) return
    const el = document.getElementById(`metric-${hash}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [binding, data])

  if (!binding || !data) return <Onboarding />

  const indicators = normalizeIndicators(data.indicators)
  const metrics = indicators.metrics
  const ledger = indicators.ledger

  const update = (next: Indicators) => {
    setData({ ...data, indicators: normalizeIndicators(next) })
  }

  const save = async () => {
    setMsg(null)
    const token = await ensureToken()
    const next = normalizeIndicators({
      ...indicators,
      metrics: ensureCanonicalMetrics(indicators.metrics),
      ledger: indicators.ledger ?? [],
      updatedAt: nowIso(),
    })
    await saveIndicators(token, binding.folderId, next)
    setData({ ...data, indicators: next })
    setMsg('Сохранено на Drive')
  }

  const setMetricValue = (id: MetricId, raw: string) => {
    const ensured = ensureCanonicalMetrics(indicators.metrics)
    const idx = ensured.findIndex((m) => m.id === id)
    if (idx < 0) return
    const num = Number(raw.replace(/\s/g, '').replace(',', '.'))
    ensured[idx] = {
      ...ensured[idx],
      value: raw !== '' && !Number.isNaN(num) ? num : raw,
    }
    update({ ...indicators, metrics: ensured })
  }

  const draftFor = (id: MetricId): DraftEntry => drafts[id] ?? emptyDraft()

  const setDraft = (id: MetricId, patch: Partial<DraftEntry>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...draftFor(id), ...patch },
    }))
  }

  const addLedgerEntry = (id: MetricId) => {
    const d = draftFor(id)
    if (!d.title.trim()) {
      setMsg('Укажите заголовок записи истории')
      return
    }
    if (d.kind === 'start' && d.balanceAfter.trim() === '' && d.delta.trim() === '') {
      setMsg('Для старта укажите баланс после (или значение)')
      return
    }
    const entry: MetricLedgerEntry = {
      id: newId('led'),
      metricId: id,
      kind: d.kind,
      title: d.title.trim(),
      turn: d.turn.trim() === '' ? undefined : Number(d.turn) || 0,
      delta: parseOptionalNumber(d.delta),
      balanceAfter: parseOptionalNumber(d.balanceAfter),
      note: d.note.trim() || undefined,
      orderTurn: d.orderTurn.trim() === '' ? undefined : Number(d.orderTurn) || 0,
      orderId: d.orderId.trim() || undefined,
      at: nowIso(),
    }
    update({
      ...indicators,
      ledger: [...ledger, entry],
    })
    setDrafts((prev) => ({ ...prev, [id]: emptyDraft() }))
    setMsg(null)
  }

  const removeLedgerEntry = (entryId: string) => {
    update({
      ...indicators,
      ledger: ledger.filter((e) => e.id !== entryId),
    })
  }

  return (
    <div className="page">
      <div className="panel">
        <h2>Показатели</h2>
        <p className="muted">
          Стабильные ключи для дашборда. Ведущий показатель: Троны (budget). История
          начислений и снятий правится ниже каждой метрики.
        </p>
        <div className="field">
          <label htmlFor="ind-turn">Ход</label>
          <input
            id="ind-turn"
            type="number"
            value={indicators.turn}
            onChange={(e) =>
              update({ ...indicators, turn: Number(e.target.value) || 0 })
            }
          />
        </div>
        <div className="stack indicators-stack">
          {METRIC_IDS.map((id) => {
            const def = METRIC_DEFS[id]
            const m = metrics.find((x) => x.id === id)!
            const rows = sortLedgerEntries(ledger.filter((e) => e.metricId === id))
            const draft = draftFor(id)
            return (
              <div key={id} className="list-block stack" id={`metric-${id}`}>
                <div className="field">
                  <label htmlFor={`val-${id}`}>
                    {def.label}
                    <span className="muted"> ({id})</span>
                  </label>
                  <input
                    id={`val-${id}`}
                    value={String(m.value)}
                    onChange={(e) => setMetricValue(id, e.target.value)}
                  />
                </div>
                {def.unit && <p className="muted">Единица: {def.unit}</p>}
                {def.note && <p className="muted">{def.note}</p>}

                <details className="ledger-details">
                  <summary>
                    История ({rows.length})
                  </summary>
                  {rows.length === 0 ? (
                    <p className="muted">Записей пока нет.</p>
                  ) : (
                    <ul className="ledger-edit-list">
                      {rows.map((row) => (
                        <li key={row.id} className="ledger-edit-row">
                          <span className="muted">
                            {row.turn != null ? `ход ${row.turn}` : 'ход н/д'} ·{' '}
                            {LEDGER_KIND_LABELS[row.kind]}
                          </span>
                          <strong>{row.title}</strong>
                          <span>
                            {row.kind === 'start'
                              ? `Старт: ${formatLedgerAmount(row.balanceAfter ?? row.delta, false)}`
                              : formatLedgerAmount(row.delta, true)}
                          </span>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => removeLedgerEntry(row.id)}
                          >
                            Удалить
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="stack ledger-add">
                    <p className="muted">Добавить запись</p>
                    <fieldset className="ledger-kind-set">
                      <legend className="muted">Тип</legend>
                      <div className="ledger-kind-row" role="radiogroup" aria-label="Тип записи">
                        {KIND_OPTIONS.map((kind) => (
                          <label key={kind} className="ledger-kind-option">
                            <input
                              type="radio"
                              name={`kind-${id}`}
                              checked={draft.kind === kind}
                              onChange={() => setDraft(id, { kind })}
                            />
                            {LEDGER_KIND_LABELS[kind]}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className="ledger-add-grid">
                      <div className="field">
                        <label htmlFor={`led-title-${id}`}>Заголовок</label>
                        <input
                          id={`led-title-${id}`}
                          value={draft.title}
                          onChange={(e) => setDraft(id, { title: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`led-turn-${id}`}>Ход</label>
                        <input
                          id={`led-turn-${id}`}
                          type="number"
                          value={draft.turn}
                          onChange={(e) => setDraft(id, { turn: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`led-delta-${id}`}>Дельта</label>
                        <input
                          id={`led-delta-${id}`}
                          value={draft.delta}
                          onChange={(e) => setDraft(id, { delta: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`led-bal-${id}`}>Баланс после</label>
                        <input
                          id={`led-bal-${id}`}
                          value={draft.balanceAfter}
                          onChange={(e) => setDraft(id, { balanceAfter: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`led-ot-${id}`}>Ход приказа</label>
                        <input
                          id={`led-ot-${id}`}
                          type="number"
                          value={draft.orderTurn}
                          onChange={(e) => setDraft(id, { orderTurn: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`led-oid-${id}`}>Id приказа</label>
                        <input
                          id={`led-oid-${id}`}
                          value={draft.orderId}
                          onChange={(e) => setDraft(id, { orderId: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor={`led-note-${id}`}>Заметка</label>
                      <input
                        id={`led-note-${id}`}
                        value={draft.note}
                        onChange={(e) => setDraft(id, { note: e.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => addLedgerEntry(id)}
                    >
                      Добавить запись
                    </button>
                  </div>
                </details>
              </div>
            )
          })}
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() =>
              update({
                ...indicators,
                metrics: ensureCanonicalMetrics(indicators.metrics),
              })
            }
          >
            Заполнить недостающие ключи
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void save()}
          >
            Сохранить
          </button>
        </div>
        {msg && <p className="ok">{msg}</p>}
      </div>
    </div>
  )
}
