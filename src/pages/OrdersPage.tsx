import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCabinet } from '../cabinet/CabinetProvider'
import {
  EffectsEditor,
  type CreateMetricAttach,
} from '../components/EffectsEditor'
import { MasterDetailList } from '../components/MasterDetailList'
import { RichTextEditor } from '../components/RichTextEditor'
import { useDraftAutosave } from '../hooks/useDraftAutosave'
import { saveAllOrdersTurns } from '../lib/drive'
import { isOrderLinked, normalizeMetrics } from '../schema/metrics'
import {
  SCHEMA_VERSION,
  newId,
  nowIso,
  type Metric,
  type OrderItem,
  type OrdersTurn,
} from '../schema/province'
import { Onboarding } from './Onboarding'

type OrderRow = { turn: number; item: OrderItem }

function stripOrdersUpdatedAt(orders: OrdersTurn[]): string {
  return JSON.stringify(orders.map((o) => ({ ...o, updatedAt: '' })))
}

function flattenOrders(orders: OrdersTurn[]): OrderRow[] {
  return orders
    .flatMap((pack) => pack.items.map((item) => ({ turn: pack.turn, item })))
    .sort((a, b) => {
      if (b.turn !== a.turn) return b.turn - a.turn
      return a.item.title.localeCompare(b.item.title, 'ru')
    })
}

function rebuildOrders(
  rows: OrderRow[],
  previous: OrdersTurn[],
): OrdersTurn[] {
  const prevByTurn = new Map(previous.map((pack) => [pack.turn, pack]))
  const grouped = new Map<number, OrderItem[]>()
  for (const { turn, item } of rows) {
    const list = grouped.get(turn) ?? []
    list.push(item)
    grouped.set(turn, list)
  }
  return [...grouped.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([turn, items]) => {
      const old = prevByTurn.get(turn)
      return {
        schemaVersion: SCHEMA_VERSION,
        turn,
        visibility: old?.visibility ?? 'open',
        items,
        updatedAt: nowIso(),
      } satisfies OrdersTurn
    })
}

function parseTurnValue(raw: string): number {
  if (raw === '') return 0
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.trunc(n)
}

export function OrdersPage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [searchParams] = useSearchParams()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  const [persistedTurns, setPersistedTurns] = useState<number[]>([])
  const seededFolder = useRef<string | null>(null)
  const turnQueryHandled = useRef<string | null>(null)
  const persistedTurnsRef = useRef<number[]>([])

  const orders = data?.orders ?? []
  const rows = useMemo(() => flattenOrders(orders), [orders])
  const items = useMemo(() => rows.map((row) => row.item), [rows])

  const defaultTurn = data?.meta.currentTurn ?? 0

  useEffect(() => {
    persistedTurnsRef.current = persistedTurns
  }, [persistedTurns])

  useEffect(() => {
    if (!binding || !data) return
    if (seededFolder.current === binding.folderId) return
    seededFolder.current = binding.folderId
    setSavedIds(
      new Set(data.orders.flatMap((pack) => pack.items.map((i) => i.id))),
    )
    const turns = data.orders.map((pack) => pack.turn)
    setPersistedTurns(turns)
    persistedTurnsRef.current = turns
  }, [binding, data])

  useEffect(() => {
    const q = searchParams.get('turn')
    if (q == null || q === '') return
    if (turnQueryHandled.current === q) return
    const n = Number(q)
    if (!Number.isFinite(n) || n < 0) return
    const match = rows.find((row) => row.turn === n)
    if (match) {
      setSelectedId(match.item.id)
      turnQueryHandled.current = q
    }
  }, [searchParams, rows])

  useEffect(() => {
    if (!items.length) {
      setSelectedId(null)
      return
    }
    if (selectedId && items.some((i) => i.id === selectedId)) return
    setSelectedId(items[0]?.id ?? null)
  }, [items, selectedId])

  const metrics = useMemo(
    () => normalizeMetrics(data?.indicators.metrics ?? []),
    [data?.indicators.metrics],
  )

  const selectedIdx = rows.findIndex((row) => row.item.id === selectedId)
  const selectedRow = selectedIdx >= 0 ? rows[selectedIdx] : null
  const selected = selectedRow?.item ?? null

  const editorMetrics = useMemo(() => {
    if (!selected) return metrics
    return normalizeMetrics([...metrics, ...(selected.createdMetrics ?? [])])
  }, [metrics, selected])

  const selectedLinked =
    selected != null && data
      ? isOrderLinked(selected.id, data.verdicts)
      : false

  const canClearSelected =
    Boolean(selected) && selected != null && !savedIds.has(selected.id)

  const setOrders = (next: OrdersTurn[]) => {
    if (!data) return
    setData({ ...data, orders: next })
  }

  const setRows = (nextRows: OrderRow[]) => {
    setOrders(rebuildOrders(nextRows, orders))
  }

  const markPersisted = (next: OrdersTurn[]) => {
    setSavedIds(
      new Set(next.flatMap((pack) => pack.items.map((i) => i.id))),
    )
    const turns = next.map((pack) => pack.turn)
    setPersistedTurns(turns)
    persistedTurnsRef.current = turns
  }

  const persist = async (current: OrdersTurn[]) => {
    if (!binding) return
    const token = await ensureToken()
    const stamped = current.map((pack) => ({
      ...pack,
      updatedAt: nowIso(),
    }))
    await saveAllOrdersTurns(
      token,
      binding.folderId,
      stamped,
      persistedTurnsRef.current,
    )
    return stamped
  }

  const { phase, markSaved, valueRef } = useDraftAutosave({
    value: orders,
    resetKey: binding?.folderId ?? '',
    enabled: Boolean(binding && data),
    onSave: async (current) => {
      if (!binding) return
      setErr(null)
      const stamped = await persist(current)
      if (!stamped) return
      markPersisted(stamped)
      if (stripOrdersUpdatedAt(valueRef.current) === stripOrdersUpdatedAt(current)) {
        setOrders(stamped)
        markSaved(stamped, 'draft')
      }
      setMsg('Черновик сохранён')
    },
  })

  if (!binding || !data) return <Onboarding />

  const updateRow = (
    idx: number,
    patch: { turn?: number; item?: Partial<OrderItem> },
  ) => {
    const next = [...rows]
    const cur = next[idx]
    next[idx] = {
      turn: patch.turn ?? cur.turn,
      item: patch.item ? { ...cur.item, ...patch.item } : cur.item,
    }
    setRows(next)
  }

  const addCreatedMetric = (metric: Metric, attach: CreateMetricAttach) => {
    if (selectedIdx < 0 || !selected) return
    const createdMetrics = [...(selected.createdMetrics ?? []), metric]
    let effects = [...(selected.effects ?? [])]
    if (attach === 'new-row') {
      effects.push({
        id: newId('fx'),
        metricId: metric.id,
        delta: 0,
      })
    } else {
      effects = effects.map((e) =>
        e.id === attach.effectId ? { ...e, metricId: metric.id } : e,
      )
    }
    updateRow(selectedIdx, { item: { createdMetrics, effects } })
  }

  const createOrder = () => {
    const item: OrderItem = {
      id: newId('ord'),
      title: 'Новый приказ',
      body: '',
      secret: false,
      effects: [],
      createdMetrics: [],
    }
    setRows([...rows, { turn: defaultTurn, item }])
    setSelectedId(item.id)
    setErr(null)
  }

  const clearSelected = () => {
    if (!selected || savedIds.has(selected.id)) return
    const next = rows.filter((row) => row.item.id !== selected.id)
    setRows(next)
    setSelectedId(next[0]?.item.id ?? null)
    setErr(null)
    setMsg(null)
  }

  const deleteSelected = () => {
    if (!selected) return
    if (isOrderLinked(selected.id, data.verdicts)) {
      setErr(
        'Приказ нельзя удалить: он уже подвязан к вердикту (черновик или фиксация)',
      )
      return
    }
    const next = rows.filter((row) => row.item.id !== selected.id)
    setRows(next)
    setSelectedId(next[0]?.item.id ?? null)
    setErr(null)
    setMsg('Приказ удалён локально — сохраните список')
  }

  const save = async () => {
    setErr(null)
    setMsg(null)
    try {
      const stamped = await persist(orders)
      if (!stamped) return
      setOrders(stamped)
      markPersisted(stamped)
      markSaved(stamped, 'manual')
      setMsg('Приказы сохранены')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения')
    }
  }

  const saveBusy = busy || phase === 'saving'
  const saveLabel =
    phase === 'saving'
      ? 'Сохранение…'
      : phase === 'saved'
        ? 'Сохранено'
        : 'Сохранить'

  return (
    <div className="page page-wide">
      <div className="panel">
        <h2>Приказы</h2>
        <p className="muted">
          Ход задаётся у каждого приказа. Нулевой ход допустим.
        </p>

        <MasterDetailList
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreate={createOrder}
          createLabel="Новый приказ"
          emptyLabel="Пока нет приказов"
          renderItemLabel={(id) => {
            const row = rows.find((x) => x.item.id === id)
            const title = row?.item.title?.trim() || 'Без названия'
            return (
              <>
                <span className="master-detail-turn">{row?.turn ?? '?'}</span>
                <span className="master-detail-label">{title}</span>
              </>
            )
          }}
        >
          {selected && selectedRow && selectedIdx >= 0 ? (
            <div className="stack">
              <div className="field">
                <label>Заголовок</label>
                <input
                  value={selected.title}
                  onChange={(e) =>
                    updateRow(selectedIdx, { item: { title: e.target.value } })
                  }
                />
              </div>
              <div className="field">
                <label>Ход</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={selectedRow.turn}
                  onChange={(e) =>
                    updateRow(selectedIdx, {
                      turn: parseTurnValue(e.target.value),
                    })
                  }
                />
              </div>
              <div className="field">
                <label>Цель</label>
                <input
                  value={selected.goal ?? ''}
                  onChange={(e) =>
                    updateRow(selectedIdx, { item: { goal: e.target.value } })
                  }
                />
              </div>
              <div className="field">
                <label>Текст</label>
                <RichTextEditor
                  value={selected.body}
                  onChange={(body) => updateRow(selectedIdx, { item: { body } })}
                  folderId={binding.folderId}
                  getAccessToken={ensureToken}
                />
              </div>
              <EffectsEditor
                effects={selected.effects ?? []}
                metrics={editorMetrics}
                onCreateMetric={addCreatedMetric}
                onChange={(effects) =>
                  updateRow(selectedIdx, { item: { effects } })
                }
              />
              <label>
                <input
                  type="checkbox"
                  checked={selected.secret}
                  onChange={(e) =>
                    updateRow(selectedIdx, {
                      item: { secret: e.target.checked },
                    })
                  }
                />{' '}
                Тайный
              </label>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={selectedLinked}
                  title={
                    selectedLinked
                      ? 'Подвязан к вердикту — удаление недоступно'
                      : undefined
                  }
                  onClick={deleteSelected}
                >
                  Удалить
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!canClearSelected}
                  title={
                    canClearSelected
                      ? 'Сбросить ещё не сохранённый приказ'
                      : 'Очистить можно только до первого сохранения'
                  }
                  onClick={clearSelected}
                >
                  Очистить
                </button>
              </div>
              {selectedLinked ? (
                <p className="muted">
                  Приказ подвязан к вердикту, удалить нельзя.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="muted">Выберите приказ слева или создайте новый.</p>
          )}
        </MasterDetailList>

        <div className="btn-row" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saveBusy}
            onClick={() => void save()}
          >
            {saveLabel}
          </button>
        </div>
        <div role="status" aria-live="polite">
          {msg ? <p className="ok">{msg}</p> : null}
          {phase === 'draft' && !msg ? (
            <p className="ok">Черновик сохранён</p>
          ) : null}
          {phase === 'saving' && !msg ? (
            <p className="muted">Сохранение…</p>
          ) : null}
        </div>
        {err ? <p className="error">{err}</p> : null}
      </div>
    </div>
  )
}
