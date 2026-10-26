import { useState } from 'react'
import { useCabinet } from '../cabinet/CabinetProvider'
import { saveBoard } from '../lib/drive'
import {
  BoardStatusSchema,
  newId,
  nowIso,
  type Board,
  type BoardStatus,
} from '../schema/province'
import { Onboarding } from './Onboarding'

export function BoardPage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [msg, setMsg] = useState<string | null>(null)

  if (!binding || !data) return <Onboarding />
  const board = data.board

  const update = (next: Board) => setData({ ...data, board: next })

  const save = async () => {
    const token = await ensureToken()
    const next = { ...board, updatedAt: nowIso() }
    await saveBoard(token, binding.folderId, next)
    setData({ ...data, board: next })
    setMsg('Сохранено')
  }

  return (
    <div className="page">
      <div className="panel">
        <h2>Доска статусов</h2>
        {board.items.map((item, idx) => (
          <div key={item.id} className="list-block stack">
            <div className="field">
              <label>Заголовок</label>
              <input
                value={item.title}
                onChange={(e) => {
                  const items = [...board.items]
                  items[idx] = { ...item, title: e.target.value }
                  update({ ...board, items })
                }}
              />
            </div>
            <fieldset className="field status-fieldset">
              <legend>Статус</legend>
              <div className="btn-row status-options" role="radiogroup" aria-label={`Статус: ${item.title}`}>
                {BoardStatusSchema.options.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={item.status === s}
                    className={`btn ${item.status === s ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => {
                      const items = [...board.items]
                      items[idx] = { ...item, status: s as BoardStatus }
                      update({ ...board, items })
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label>Заметки</label>
              <textarea
                value={item.notes ?? ''}
                onChange={(e) => {
                  const items = [...board.items]
                  items[idx] = { ...item, notes: e.target.value }
                  update({ ...board, items })
                }}
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                update({ ...board, items: board.items.filter((x) => x.id !== item.id) })
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
              update({
                ...board,
                items: [
                  ...board.items,
                  { id: newId('b'), title: 'Новый пункт', status: 'planned', links: [] },
                ],
              })
            }
          >
            Добавить
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            Сохранить
          </button>
        </div>
        {msg && <p className="ok">{msg}</p>}
      </div>
    </div>
  )
}
