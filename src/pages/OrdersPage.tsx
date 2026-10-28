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
import { saveOrdersTurn } from '../lib/drive'
import { parseOrdersMarkdown } from '../lib/mdOrders'
import { isOrderLinked, normalizeMetrics } from '../schema/metrics'
import {
  emptyOrdersTurn,
  newId,
  nowIso,
  type Metric,
  type OrderItem,
  type OrdersTurn,
} from '../schema/province'
import { Onboarding } from './Onboarding'

function stripUpdatedAt(pack: OrdersTurn): string {
  return JSON.stringify({ ...pack, updatedAt: '' })
}

export function OrdersPage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [searchParams] = useSearchParams()
  const [turn, setTurn] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [md, setMd] = useState('')
  const [mdOpen, setMdOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savedIdsByTurn, setSavedIdsByTurn] = useState<Map<number, Set<string>>>(
    () => new Map(),
  )
  const seededFolder = useRef<string | null>(null)

  useEffect(() => {
    const q = searchParams.get('turn')
    if (q == null || q === '') return
    const n = Number(q)
    if (Number.isFinite(n) && n >= 0) setTurn(n)
  }, [searchParams])

  const currentTurn = turn || data?.meta.currentTurn || 1

  const pack = useMemo((): OrdersTurn => {
    if (!data) return emptyOrdersTurn(currentTurn)
    return (
      data.orders.find((o) => o.turn === currentTurn) ??
      emptyOrdersTurn(currentTurn)
    )
  }, [data, currentTurn])

  const items = pack.items

  useEffect(() => {
    if (!binding || !data) return
    if (seededFolder.current === binding.folderId) return
    seededFolder.current = binding.folderId
    const m = new Map<number, Set<string>>()
    for (const o of data.orders) {
      m.set(o.turn, new Set(o.items.map((i) => i.id)))
    }
    setSavedIdsByTurn(m)
  }, [binding, data])

  useEffect(() => {
    if (!items.length) {
      setSelectedId(null)
      return
    }
    if (selectedId && items.some((i) => i.id === selectedId)) return
    setSelectedId(items[0]?.id ?? null)
  }, [items, selectedId, currentTurn])

  const metrics = useMemo(
    () => normalizeMetrics(data?.indicators.metrics ?? []),
    [data?.indicators.metrics],
  )

  const selectedIdx = items.findIndex((i) => i.id === selectedId)
  const selected = selectedIdx >= 0 ? items[selectedIdx] : null

  const editorMetrics = useMemo(() => {
    if (!selected) return metrics
    return normalizeMetrics([...metrics, ...(selected.createdMetrics ?? [])])
  }, [metrics, selected])

  const selectedLinked =
    selected != null && data
      ? isOrderLinked(selected.id, data.verdicts)
      : false

  const persistedIds =
    savedIdsByTurn.get(currentTurn) ?? new Set<string>()

  const canClearSelected =
    Boolean(selected) && selected != null && !persistedIds.has(selected.id)

  const setPack = (next: OrdersTurn) => {
    if (!data) return
    const others = data.orders.filter((o) => o.turn !== next.turn)
    setData({
      ...data,
      orders: [...others, next].sort((a, b) => b.turn - a.turn),
    })
  }

  const markPersisted = (next: OrdersTurn) => {
    setSavedIdsByTurn((prev) => {
      const map = new Map(prev)
      map.set(next.turn, new Set(next.items.map((i) => i.id)))
      return map
    })
  }

  const { phase, markSaved, valueRef } = useDraftAutosave({
    value: pack,
    resetKey: `${binding?.folderId ?? ''}:${currentTurn}`,
    enabled: Boolean(binding && data),
    onSave: async (current) => {
      if (!binding) return
      setErr(null)
      const token = await ensureToken()
      const next = { ...current, turn: currentTurn, updatedAt: nowIso() }
      await saveOrdersTurn(token, binding.folderId, next)
      markPersisted(next)
      if (stripUpdatedAt(valueRef.current) === stripUpdatedAt(current)) {
        setPack(next)
        markSaved(next, 'draft')
      }
      setMsg('Черновик сохранён')
    },
  })

  if (!binding || !data) return <Onboarding />

  const updateItem = (idx: number, patch: Partial<OrderItem>) => {
    const nextItems = [...pack.items]
    nextItems[idx] = { ...nextItems[idx], ...patch }
    setPack({ ...pack, turn: currentTurn, items: nextItems })
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
    updateItem(selectedIdx, { createdMetrics, effects })
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
    setPack({
      ...pack,
      turn: currentTurn,
      items: [...pack.items, item],
    })
    setSelectedId(item.id)
    setErr(null)
  }

  const clearSelected = () => {
    if (!selected || persistedIds.has(selected.id)) return
    const nextItems = pack.items.filter((x) => x.id !== selected.id)
    setPack({ ...pack, turn: currentTurn, items: nextItems })
    setSelectedId(nextItems[0]?.id ?? null)
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
    const nextItems = pack.items.filter((x) => x.id !== selected.id)
    setPack({ ...pack, turn: currentTurn, items: nextItems })
    setSelectedId(nextItems[0]?.id ?? null)
    setErr(null)
    setMsg('Приказ удалён локально — сохраните ход')
  }

  const save = async () => {
    setErr(null)
    setMsg(null)
    try {
      const token = await ensureToken()
      const next = { ...pack, turn: currentTurn, updatedAt: nowIso() }
      await saveOrdersTurn(token, binding.folderId, next)
      setPack(next)
      markPersisted(next)
      markSaved(next, 'manual')
      setMsg(`Ход ${currentTurn} сохранён`)
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
        : 'Сохранить ход'

  return (
    <div className="page page-wide">
      <div className="panel">
        <h2>Приказы</h2>
        <div className="field">
          <label>Ход</label>
          <input
            type="number"
            value={currentTurn}
            onChange={(e) => setTurn(Number(e.target.value) || 0)}
          />
        </div>

        <MasterDetailList
          items={pack.items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreate={createOrder}
          createLabel="Новый приказ"
          emptyLabel="В этом ходе ещё нет приказов"
          renderItemLabel={(id) => {
            const item = pack.items.find((x) => x.id === id)
            return item?.title?.trim() || 'Без названия'
          }}
        >
          {selected && selectedIdx >= 0 ? (
            <div className="stack">
              <div className="field">
                <label>Заголовок</label>
                <input
                  value={selected.title}
                  onChange={(e) =>
                    updateItem(selectedIdx, { title: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Цель</label>
                <input
                  value={selected.goal ?? ''}
                  onChange={(e) =>
                    updateItem(selectedIdx, { goal: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Текст</label>
                <RichTextEditor
                  value={selected.body}
                  onChange={(body) => updateItem(selectedIdx, { body })}
                  folderId={binding.folderId}
                  getAccessToken={ensureToken}
                />
              </div>
              <div className="field">
                <label>Бюджет</label>
                <input
                  value={selected.budget ?? ''}
                  onChange={(e) =>
                    updateItem(selectedIdx, { budget: e.target.value })
                  }
                />
              </div>
              <EffectsEditor
                effects={selected.effects ?? []}
                metrics={editorMetrics}
                onCreateMetric={addCreatedMetric}
                onChange={(effects) => updateItem(selectedIdx, { effects })}
              />
              <label>
                <input
                  type="checkbox"
                  checked={selected.secret}
                  onChange={(e) =>
                    updateItem(selectedIdx, { secret: e.target.checked })
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

      <div className="panel">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setMdOpen((v) => !v)}
        >
          {mdOpen ? 'Скрыть импорт Markdown' : 'Импорт из Markdown'}
        </button>
        {mdOpen ? (
          <>
            <p className="muted">Вставьте текст приказа (.md). Разбор best-effort.</p>
            <div className="field">
              <textarea
                value={md}
                onChange={(e) => setMd(e.target.value)}
                rows={10}
              />
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const imported = parseOrdersMarkdown(md)
                setPack({
                  ...pack,
                  turn: currentTurn,
                  items: [...pack.items, ...imported],
                })
                if (imported[0]) setSelectedId(imported[0].id)
                setMsg(`Импортировано пунктов: ${imported.length}`)
              }}
            >
              Разобрать и добавить
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
