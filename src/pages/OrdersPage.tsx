import { useState } from 'react'
import { useCabinet } from '../cabinet/CabinetProvider'
import { saveOrdersTurn } from '../lib/drive'
import { parseOrdersMarkdown } from '../lib/mdOrders'
import {
  emptyOrdersTurn,
  newId,
  nowIso,
  type OrdersTurn,
} from '../schema/province'
import { Onboarding } from './Onboarding'

export function OrdersPage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [turn, setTurn] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const [md, setMd] = useState('')

  if (!binding || !data) return <Onboarding />

  const currentTurn = turn || data.meta.currentTurn || 1
  const pack: OrdersTurn =
    data.orders.find((o) => o.turn === currentTurn) ?? emptyOrdersTurn(currentTurn)

  const setPack = (next: OrdersTurn) => {
    const others = data.orders.filter((o) => o.turn !== next.turn)
    setData({ ...data, orders: [...others, next].sort((a, b) => b.turn - a.turn) })
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

        {pack.items.map((item, idx) => (
          <div key={item.id} className="list-block stack">
            <div className="field">
              <label>Заголовок</label>
              <input
                value={item.title}
                onChange={(e) => {
                  const items = [...pack.items]
                  items[idx] = { ...item, title: e.target.value }
                  setPack({ ...pack, items })
                }}
              />
            </div>
            <div className="field">
              <label>Цель</label>
              <input
                value={item.goal ?? ''}
                onChange={(e) => {
                  const items = [...pack.items]
                  items[idx] = { ...item, goal: e.target.value }
                  setPack({ ...pack, items })
                }}
              />
            </div>
            <div className="field">
              <label>Текст</label>
              <textarea
                value={item.body}
                onChange={(e) => {
                  const items = [...pack.items]
                  items[idx] = { ...item, body: e.target.value }
                  setPack({ ...pack, items })
                }}
              />
            </div>
            <div className="field">
              <label>Бюджет</label>
              <input
                value={item.budget ?? ''}
                onChange={(e) => {
                  const items = [...pack.items]
                  items[idx] = { ...item, budget: e.target.value }
                  setPack({ ...pack, items })
                }}
              />
            </div>
            <label>
              <input
                type="checkbox"
                checked={item.secret}
                onChange={(e) => {
                  const items = [...pack.items]
                  items[idx] = { ...item, secret: e.target.checked }
                  setPack({ ...pack, items })
                }}
              />{' '}
              Тайный
            </label>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                setPack({ ...pack, items: pack.items.filter((x) => x.id !== item.id) })
              }
            >
              Удалить
            </button>
          </div>
        ))}

        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() =>
              setPack({
                ...pack,
                turn: currentTurn,
                items: [
                  ...pack.items,
                  { id: newId('ord'), title: 'Новый приказ', body: '', secret: false },
                ],
              })
            }
          >
            Добавить приказ
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            Сохранить ход
          </button>
        </div>
        {msg && <p className="ok">{msg}</p>}
      </div>

      <div className="panel">
        <h3>Импорт из Markdown</h3>
        <p className="muted">Вставьте текст приказа (.md). Разбор best-effort.</p>
        <div className="field">
          <textarea value={md} onChange={(e) => setMd(e.target.value)} rows={10} />
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const items = parseOrdersMarkdown(md)
            setPack({
              ...pack,
              turn: currentTurn,
              items: [...pack.items, ...items],
            })
            setMsg(`Импортировано пунктов: ${items.length}`)
          }}
        >
          Разобрать и добавить
        </button>
      </div>
    </div>
  )
}
