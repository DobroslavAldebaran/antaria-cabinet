import { useEffect, useState } from 'react'
import { getVkSettings } from '../lib/registry'
import { resolveVkOwnerId, wallGetJsonp, type VkWallPost } from '../lib/vk'
import type { NewsLocal } from '../schema/province'

type Props = {
  localNews: NewsLocal
}

function formatVkDate(unix: number): string {
  try {
    return new Date(unix * 1000).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function VkNewsPanel({ localNews }: Props) {
  const [screenName, setScreenName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [posts, setPosts] = useState<VkWallPost[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'fallback' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setStatus('loading')
      setError(null)
      try {
        const vk = await getVkSettings()
        if (cancelled) return
        const sn = vk?.screenName?.trim() || ''
        const gid = vk?.groupId?.trim() || ''
        setScreenName(sn)
        setGroupId(gid)

        const token = vk?.accessToken?.trim()
        const ownerId = resolveVkOwnerId(gid, sn)
        if (token && ownerId) {
          const items = await wallGetJsonp({ ownerId, accessToken: token, count: 10 })
          if (cancelled) return
          setPosts(items)
          setStatus('ok')
          return
        }
        setPosts([])
        setStatus('fallback')
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Не удалось загрузить стену VK')
        setPosts([])
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const widgetTarget = groupId || screenName
  const widgetSrc = widgetTarget
    ? `https://vk.com/widget_community.php?act=wall&group=${encodeURIComponent(widgetTarget)}&width=auto&height=400&mode=4`
    : null

  return (
    <section className="panel dash-news" aria-labelledby="vk-news-heading">
      <h2 id="vk-news-heading">Новости VK</h2>
      <p className="muted dash-news-meta">
        {widgetTarget ? (
          <>
            Сообщество{' '}
            <a
              href={screenName ? `https://vk.com/${screenName}` : `https://vk.com/club${groupId}`}
              target="_blank"
              rel="noreferrer"
            >
              {screenName || groupId}
            </a>
          </>
        ) : (
          'Сообщество не настроено (Админ → VK).'
        )}
        {status === 'fallback' &&
          widgetTarget &&
          ' · лента API недоступна (нет токена или group id), виджет и локальные новости'}
        {status === 'loading' && ' · загрузка ленты…'}
      </p>

      <div className="dash-news-layout">
        {widgetSrc ? (
          <div className="vk-widget-wrap">
            <iframe
              title={`Стена VK ${widgetTarget}`}
              src={widgetSrc}
              className="vk-widget"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        ) : (
          <div className="vk-widget-wrap vk-widget-empty">
            <p className="muted">Виджет появится после сохранения screen name или group id в админке.</p>
          </div>
        )}

        <div className="vk-feed">
          {error && <p className="error">{error}</p>}
          {status === 'ok' && posts.length === 0 && (
            <p className="muted">На стене пока нет постов.</p>
          )}
          {posts.map((p) => (
            <article key={p.id} className="vk-post">
              <time className="muted" dateTime={new Date(p.date * 1000).toISOString()}>
                {formatVkDate(p.date)}
              </time>
              <p>{p.text || '(без текста)'}</p>
              <a href={p.url} target="_blank" rel="noreferrer">
                Открыть в VK
              </a>
            </article>
          ))}
          {(status === 'fallback' || status === 'error' || !widgetTarget) &&
            localNews.items.slice(0, 5).map((n) => (
              <article key={n.id} className="vk-post">
                <strong>{n.title}</strong>
                {n.date && <p className="muted">{n.date}</p>}
                {n.excerpt && <p className="muted">{n.excerpt}</p>}
                {n.url && (
                  <a href={n.url} target="_blank" rel="noreferrer">
                    Ссылка
                  </a>
                )}
              </article>
            ))}
        </div>
      </div>
    </section>
  )
}
