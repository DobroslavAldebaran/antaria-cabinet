import { useState } from 'react'
import { useCabinet } from '../cabinet/CabinetProvider'
import { saveMaps } from '../lib/drive'
import { sanitizeUrl } from '../lib/sanitize'
import { newId, nowIso } from '../schema/province'
import { Onboarding } from './Onboarding'

export function MapsPage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [msg, setMsg] = useState<string | null>(null)
  if (!binding || !data) return <Onboarding />
  const maps = data.maps

  return (
    <div className="page">
      <div className="panel">
        <h2>Карты</h2>
        {maps.items.map((item, idx) => (
          <div key={item.id} className="list-block stack">
            <div className="field">
              <label>Название</label>
              <input
                value={item.title}
                onChange={(e) => {
                  const items = [...maps.items]
                  items[idx] = { ...item, title: e.target.value }
                  setData({ ...data, maps: { ...maps, items } })
                }}
              />
            </div>
            <div className="field">
              <label>URL</label>
              <input
                value={item.url ?? ''}
                onChange={(e) => {
                  const items = [...maps.items]
                  items[idx] = { ...item, url: e.target.value }
                  setData({ ...data, maps: { ...maps, items } })
                }}
              />
            </div>
            <div className="field">
              <label>Заметка</label>
              <textarea
                value={item.note ?? ''}
                onChange={(e) => {
                  const items = [...maps.items]
                  items[idx] = { ...item, note: e.target.value }
                  setData({ ...data, maps: { ...maps, items } })
                }}
              />
            </div>
            {sanitizeUrl(item.url) && (
              <a href={sanitizeUrl(item.url)} target="_blank" rel="noreferrer">
                Открыть
              </a>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                setData({
                  ...data,
                  maps: { ...maps, items: maps.items.filter((x) => x.id !== item.id) },
                })
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
              setData({
                ...data,
                maps: {
                  ...maps,
                  items: [...maps.items, { id: newId('map'), title: 'Карта' }],
                },
              })
            }
          >
            Добавить
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              void (async () => {
                const token = await ensureToken()
                const next = {
                  ...maps,
                  items: maps.items.map((i) => ({ ...i, url: sanitizeUrl(i.url) })),
                  updatedAt: nowIso(),
                }
                await saveMaps(token, binding.folderId, next)
                setData({ ...data, maps: next })
                setMsg('Сохранено')
              })()
            }
          >
            Сохранить
          </button>
        </div>
        {msg && <p className="ok">{msg}</p>}
      </div>
    </div>
  )
}
