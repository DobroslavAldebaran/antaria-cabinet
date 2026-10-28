import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCabinet } from '../cabinet/CabinetProvider'
import { EffectsEditor } from '../components/EffectsEditor'
import { MasterDetailList } from '../components/MasterDetailList'
import { RichTextEditor } from '../components/RichTextEditor'
import { saveOrdersTurn } from '../lib/drive'
import { parseOrdersMarkdown } from '../lib/mdOrders'
import { normalizeMetrics } from '../schema/metrics'
import {
  emptyOrdersTurn,
  newId,
  nowIso,
  type Metric,
  type OrderItem,
  type OrdersTurn,
} from '../schema/province'
import { Onboarding } from './Onboarding'

export function OrdersPage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [searchParams] = useSearchParams()
  const [turn, setTurn] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const [md, setMd] = useState('')
  const [mdOpen, setMdOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const q = searchParams.get('turn')
    if (q == null || q === '') return
    const n = Number(q)
    if (Number.isFinite(n) && n >= 0) setTurn(n)
  }, [searchParams])

  const currentTurn = turn || data?.meta.currentTurn || 1
  const pack: OrdersTurn =
    data?.orders.find((o) => o.turn === currentTurn) ??
    emptyOrdersTurn(currentTurn)
  const items = pack.items

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

  if (!binding || !data) return <Onboarding />

  const setPack = (next: OrdersTurn) => {
    const others = data.orders.filter((o) => o.turn !== next.turn)
    setData({
      ...data,
      orders: [...others, next].sort((a, b) => b.turn - a.turn),
    })
  }

  const updateItem = (idx: number, patch: Partial<OrderItem>) => {
    const nextItems = [...pack.items]
    nextItems[idx] = { ...nextItems[idx], ...patch }
    setPack({ ...pack, turn: currentTurn, items: nextItems })
  }

  const addCreatedMetric = (metric: Metric) => {
    if (selectedIdx < 0 || !selected) return
    updateItem(selectedIdx, {
      createdMetrics: [...(selected.createdMetrics ?? []), metric],
    })
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
  }

  const save = async () => {
    const token = await ensureToken()
    const next = { ...pack, turn: currentTurn, updatedAt: nowIso() }
    await saveOrdersTurn(token, binding.folderId, next)
    setPack(next)
    setMsg(`Ход ${currentTurn} сохранён`)
  }

  return (
    <div className="page">
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
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  const nextItems = pack.items.filter(
                    (x) => x.id !== selected.id,
                  )
                  setPack({ ...pack, turn: currentTurn, items: nextItems })
                  setSelectedId(nextItems[0]?.id ?? null)
                }}
              >
                Удалить
              </button>
            </div>
          ) : (
            <p className="muted">Выберите приказ слева или создайте новый.</p>
          )}
        </MasterDetailList>

        <div className="btn-row" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void save()}
          >
            Сохранить ход
          </button>
        </div>
        {msg ? <p className="ok">{msg}</p> : null}
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
