import { useState } from 'react'
import { useCabinet } from '../cabinet/CabinetProvider'
import { saveNews } from '../lib/drive'
import { sanitizeText, sanitizeUrl } from '../lib/sanitize'
import { newId, nowIso } from '../schema/province'
import { Onboarding } from './Onboarding'

export function NewsPage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [msg, setMsg] = useState<string | null>(null)
  if (!binding || !data) return <Onboarding />
  const news = data.news

  return (
    <div className="page">
      <div className="panel">
        <h2>Новости (локальные)</h2>
        <p className="muted">
          Публичный репозиторий не содержит новостей. Добавляйте записи вручную или через импорт
          пакета.
        </p>
        {news.items.map((item, idx) => (
          <div key={item.id} className="list-block stack">
            <div className="field">
              <label>Заголовок</label>
              <input
                value={item.title}
                onChange={(e) => {
                  const items = [...news.items]
                  items[idx] = { ...item, title: e.target.value }
                  setData({ ...data, news: { ...news, items } })
                }}
              />
            </div>
            <div className="field">
              <label>Дата</label>
              <input
                value={item.date ?? ''}
                onChange={(e) => {
                  const items = [...news.items]
                  items[idx] = { ...item, date: e.target.value }
                  setData({ ...data, news: { ...news, items } })
                }}
              />
            </div>
            <div className="field">
              <label>URL</label>
              <input
                value={item.url ?? ''}
                onChange={(e) => {
                  const items = [...news.items]
                  items[idx] = { ...item, url: e.target.value }
                  setData({ ...data, news: { ...news, items } })
                }}
              />
            </div>
            <div className="field">
              <label>Кратко</label>
              <textarea
                value={item.excerpt ?? ''}
                onChange={(e) => {
                  const items = [...news.items]
                  items[idx] = { ...item, excerpt: e.target.value }
                  setData({ ...data, news: { ...news, items } })
                }}
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                setData({
                  ...data,
                  news: { ...news, items: news.items.filter((x) => x.id !== item.id) },
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
                news: {
                  ...news,
                  items: [
                    ...news.items,
                    {
                      id: newId('news'),
                      title: 'Новость',
                      date: new Date().toISOString().slice(0, 10),
                    },
                  ],
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
                  ...news,
                  items: news.items.map((i) => ({
                    ...i,
                    title: sanitizeText(i.title, 500),
                    excerpt: i.excerpt ? sanitizeText(i.excerpt, 5000) : undefined,
                    url: sanitizeUrl(i.url),
                  })),
                  updatedAt: nowIso(),
                }
                await saveNews(token, binding.folderId, next)
                setData({ ...data, news: next })
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
