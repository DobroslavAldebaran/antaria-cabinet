import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useCabinet } from '../cabinet/CabinetProvider'
import {
  EffectsEditor,
  type CreateMetricAttach,
} from '../components/EffectsEditor'
import { MasterDetailList } from '../components/MasterDetailList'
import { OrderExport } from '../components/OrderExport'
import { ResponsiblePicker } from '../components/ResponsiblePicker'
import { RichTextEditor } from '../components/RichTextEditor'
import { useDraftAutosave } from '../hooks/useDraftAutosave'
import { saveAllOrdersTurns, saveResponsibleOthers } from '../lib/drive'
import {
  acknowledgeOrdersDraft,
  readOrdersDraft,
  trackOrdersDraftTurns,
  writeOrdersDraft,
  type OrdersDraftValue,
} from '../lib/ordersDraftStorage'
import {
  isOrderLinked,
  metricDisplayUnit,
  metricLabel,
  normalizeMetrics,
  parseMetricNumber,
} from '../schema/metrics'
import {
  SCHEMA_VERSION,
  emptyResponsibleOthers,
  newId,
  nowIso,
  type Metric,
  type OrderItem,
  type OrdersTurn,
  type ResponsibleOthersDoc,
} from '../schema/province'
import { Onboarding } from './Onboarding'

type OrderRow = { turn: number; item: OrderItem }

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
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [localDraft, setLocalDraft] = useState(false)
  const [manualSaving, setManualSaving] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  const seededFolder = useRef<string | null>(null)
  const turnQueryHandled = useRef<string | null>(null)
  const persistedTurnsRef = useRef<number[]>([])
  const othersRef = useRef<ResponsibleOthersDoc>(emptyResponsibleOthers())

  const orders = useMemo(() => data?.orders ?? [], [data?.orders])
  const rows = useMemo(() => flattenOrders(orders), [orders])
  const items = useMemo(() => rows.map((row) => row.item), [rows])
  const responsibleOthers = useMemo(
    () => data?.responsibleOthers ?? emptyResponsibleOthers(), [data?.responsibleOthers],
  )
  const draftValue = useMemo(() => ({ orders, responsibleOthers }), [orders, responsibleOthers])

  const defaultTurn = data?.meta.currentTurn ?? 0

  useEffect(() => {
    othersRef.current = responsibleOthers
  }, [responsibleOthers])

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
  const fixedMetricId = selected?.fixedExpense?.metricId ?? data?.indicators.fixedOrderMetricId

  const editorMetrics = useMemo(() => {
    if (!selected) return metrics
    return normalizeMetrics([...metrics, ...(selected.createdMetrics ?? [])])
  }, [metrics, selected])
  const fixedMetric = editorMetrics.find((m) => m.id === fixedMetricId)
  const fixedMetricUnit = fixedMetricId
    ? metricDisplayUnit(fixedMetric ?? { id: fixedMetricId })
    : ''

  const selectedLinked =
    selected != null && data
      ? isOrderLinked(selected.id, data.verdicts)
      : false

  const canClearSelected =
    Boolean(selected) && selected != null && !savedIds.has(selected.id)

  const recordLocalDraft = (value: OrdersDraftValue) => {
    if (!user || !binding) return
    setMsg(null)
    try {
      // Write immediately on every edit, before waiting for Drive or its token.
      writeOrdersDraft(user.uid, binding.folderId, value, persistedTurnsRef.current)
      setLocalDraft(true)
      setLocalError(null)
    } catch {
      setLocalError('Не удалось сохранить копию в браузере. Не закрывайте страницу до сохранения на Drive.')
    }
  }

  const setOrders = (next: OrdersTurn[]) => {
    if (!data) return
    recordLocalDraft({ orders: next, responsibleOthers: othersRef.current })
    setData({ ...data, orders: next, responsibleOthers: othersRef.current })
  }

  const setRows = (nextRows: OrderRow[]) => {
    setOrders(rebuildOrders(nextRows, orders))
  }

  const markPersisted = (next: OrdersTurn[]) => {
    setSavedIds(
      new Set(next.flatMap((pack) => pack.items.map((i) => i.id))),
    )
    const turns = next.map((pack) => pack.turn)
    persistedTurnsRef.current = turns
  }

  const persist = async (current: OrdersDraftValue) => {
    if (!binding || !user) return
    const scope = `${user.uid}:${binding.folderId}`
    const token = await ensureToken()
    if (seededFolder.current !== scope) return
    let recoveryCopy: OrdersDraftValue | undefined
    try {
      recoveryCopy = readOrdersDraft(user.uid, binding.folderId)?.value
    } catch {
      // Drive can still save when browser storage is unavailable.
    }
    const stamped = current.orders.map((pack) => ({
      ...pack,
      updatedAt: nowIso(),
    }))
    // A multi-file Drive write can fail after creating only some of its turns.
    // Retain all possible remote turns so later deletions can still remove them.
    persistedTurnsRef.current = [...new Set([...persistedTurnsRef.current, ...stamped.map((pack) => pack.turn)])]
    try {
      trackOrdersDraftTurns(user.uid, binding.folderId, persistedTurnsRef.current)
    } catch {
      setLocalError('Не удалось обновить копию в браузере. Не закрывайте страницу до сохранения на Drive.')
    }
    await saveAllOrdersTurns(
      token,
      binding.folderId,
      stamped,
      persistedTurnsRef.current,
    )
    const others = { ...current.responsibleOthers, updatedAt: nowIso() }
    await saveResponsibleOthers(token, binding.folderId, others)
    try {
      acknowledgeOrdersDraft(user.uid, binding.folderId, current, stamped.map((pack) => pack.turn),
        seededFolder.current === scope && valueRef.current === current ? recoveryCopy : undefined)
      if (seededFolder.current === scope) {
        setLocalDraft(Boolean(readOrdersDraft(user.uid, binding.folderId)))
        setLocalError(null)
      }
    } catch {
      if (seededFolder.current === scope) setLocalError('Приказы записаны на Drive, но не удалось обновить локальную копию.')
    }
    if (seededFolder.current === scope) return { orders: stamped, responsibleOthers: others }
  }

  const { dirty, phase, markSaved, markDirty, valueRef, saveError, retryAutosave } = useDraftAutosave({
    value: draftValue,
    resetKey: `${user?.uid ?? ''}:${binding?.folderId ?? ''}`,
    enabled: Boolean(binding && data) && !manualSaving,
    onSave: async (current) => {
      if (!binding) return
      setErr(null)
      const stamped = await persist(current)
      if (!stamped) return
      markPersisted(stamped.orders)
      markSaved(current, 'draft')
      if (valueRef.current === current) {
        setMsg('Черновик сохранён на Drive')
      }
    },
  })

  useEffect(() => {
    if (!binding || !data || !user) return
    const scope = `${user.uid}:${binding.folderId}`
    if (seededFolder.current === scope) return
    seededFolder.current = scope
    setSavedIds(new Set(data.orders.flatMap((pack) => pack.items.map((i) => i.id))))
    const turns = data.orders.map((pack) => pack.turn)
    persistedTurnsRef.current = turns
    othersRef.current = data.responsibleOthers ?? emptyResponsibleOthers()
    setLocalDraft(false)
    setLocalError(null)
    try {
      const draft = readOrdersDraft(user.uid, binding.folderId)
      if (draft) {
        persistedTurnsRef.current = [...new Set([...turns, ...draft.persistedTurns])]
        othersRef.current = draft.value.responsibleOthers
        setData({ ...data, ...draft.value })
        markDirty()
        setLocalDraft(true)
        setMsg('Восстановлен черновик приказов из этого браузера')
      }
    } catch {
      setLocalError('Не удалось прочитать локальный черновик. Не закрывайте страницу до сохранения на Drive.')
    }
  }, [binding, data, user, setData, markDirty])

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
      military: false,
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
    if (manualSaving || phase === 'saving') return
    setManualSaving(true)
    setErr(null)
    setMsg(null)
    try {
      const current = draftValue
      const stamped = await persist(current)
      if (!stamped) return
      markPersisted(stamped.orders)
      markSaved(current, 'manual')
      if (valueRef.current === current) {
        setMsg('Приказы сохранены на Drive')
      }
    } catch (e) {
      markDirty()
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setManualSaving(false)
    }
  }

  const saveBusy = busy || phase === 'saving' || manualSaving
  const saveLabel =
    phase === 'saving' || manualSaving
      ? 'Сохранение…'
      : phase === 'saved'
        ? 'Сохранено'
        : 'Сохранить'

  return (
    <div className="page page-wide page-document-editor">
      <div className="panel">
        <h2>Приказы</h2>
        <p className="muted">
          Ход задаётся у каждого приказа. Нулевой ход допустим.
        </p>

        <OrderExport key={binding.folderId} rows={rows} data={data} getToken={ensureToken} />

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
            const caption = [
              row?.item.secret && 'Тайный',
              row?.item.military && 'Военный',
            ].filter(Boolean).join(' · ')
            return (
              <>
                <span className="master-detail-turn">{row?.turn ?? '?'}</span>
                <span className="master-detail-text">
                  <span className="master-detail-label">{title}</span>
                  {caption ? (
                    <span className="master-detail-caption muted">{caption}</span>
                  ) : null}
                </span>
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
                <label>Ответственный</label>
                <ResponsiblePicker
                  ministries={data.ministries.items}
                  characters={data.characters.items}
                  others={responsibleOthers}
                  value={selected.responsible}
                  disabled={saveBusy}
                  onChange={(responsible) =>
                    updateRow(selectedIdx, {
                      item: { responsible },
                    })
                  }
                  onOthersChange={(next) => {
                    othersRef.current = next
                    recordLocalDraft({ orders, responsibleOthers: next })
                    setData({ ...data, responsibleOthers: next })
                  }}
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
              {fixedMetricId ? (
                <div className="field">
                  <label htmlFor="order-fixed-expense">
                    {metricLabel(editorMetrics, fixedMetricId)} — расход
                    {fixedMetricUnit ? ` (${fixedMetricUnit})` : ''}
                  </label>
                  <input
                    id="order-fixed-expense"
                    key={`${selected.id}:${fixedMetricId}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    placeholder="Не указан"
                    value={selected.fixedExpense?.amount ?? ''}
                    aria-describedby="order-fixed-expense-hint"
                    onChange={(e) => {
                      const amount = parseMetricNumber(e.target.value)
                      updateRow(selectedIdx, {
                        item: {
                          fixedExpense: amount == null
                            ? undefined
                            : { metricId: fixedMetricId, amount: Math.abs(amount) },
                        },
                      })
                    }}
                  />
                  <p id="order-fixed-expense-hint" className="muted field-hint">
                    Укажите число без знака минус. Расход вычитается автоматически.
                  </p>
                </div>
              ) : null}
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
              <label>
                <input
                  type="checkbox"
                  checked={selected.military}
                  onChange={(e) =>
                    updateRow(selectedIdx, { item: { military: e.target.checked } })
                  }
                />{' '}
                Военный
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
          {msg && !saveError ? <p className="ok">{msg}</p> : null}
          {phase === 'draft' && !dirty && !msg ? (
            <p className="ok">Черновик сохранён на Drive</p>
          ) : null}
          {phase === 'saving' && !msg ? (
            <p className="muted">Сохранение…</p>
          ) : null}
          {localDraft && dirty && !localError ? (
            <p className="muted">Копия приказов сохранена в этом браузере.</p>
          ) : null}
        </div>
        {saveError ? (
          <div role="alert">
            <p className="error">Не удалось сохранить на Drive: {saveError}</p>
            <button type="button" className="btn btn-ghost" onClick={retryAutosave}>
              Повторить сохранение
            </button>
          </div>
        ) : null}
        {localError ? <p className="error" role="alert">{localError}</p> : null}
        {err ? <p className="error">{err}</p> : null}
      </div>
    </div>
  )
}
