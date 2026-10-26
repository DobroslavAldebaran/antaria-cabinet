import { Link } from 'react-router-dom'
import { useCabinet } from '../cabinet/CabinetProvider'
import { Onboarding } from './Onboarding'

export function Dashboard() {
  const { binding, data, busy, error, reload } = useCabinet()

  if (!binding) return <Onboarding />

  if (busy && !data) {
    return <div className="page muted">Загрузка кабинета…</div>
  }

  if (!data) {
    return (
      <div className="page">
        <p className="error">{error ?? 'Нет данных'}</p>
        <button type="button" className="btn" onClick={() => void reload()}>
          Повторить
        </button>
      </div>
    )
  }

  const statusCounts = data.board.items.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="page">
      <div className="panel">
        <h2>
          {data.meta.provinceName || 'Провинция без имени'}{' '}
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            ход {data.meta.currentTurn}
          </span>
        </h2>
        <p className="muted">
          {data.meta.ruler && <>Правитель: {data.meta.ruler}. </>}
          {data.meta.faction && <>Фракция: {data.meta.faction}. </>}
          Папка: {binding.folderName}
        </p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => void reload()}>
            Обновить с Drive
          </button>
          <Link className="btn" to="/app/io">
            Импорт / Экспорт
          </Link>
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="panel">
        <h3>Показатели</h3>
        {data.indicators.metrics.length === 0 ? (
          <p className="muted">
            Пока пусто. <Link to="/app/indicators">Добавить метрики</Link>
          </p>
        ) : (
          <div className="grid-metrics">
            {data.indicators.metrics.slice(0, 8).map((m) => (
              <div className="metric" key={m.id}>
                <span className="label">{m.label}</span>
                <span className="value">
                  {m.value}
                  {m.unit ? ` ${m.unit}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Доска</h3>
        <div className="btn-row">
          {Object.entries(statusCounts).map(([k, v]) => (
            <span className="badge" key={k}>
              {k}: {v}
            </span>
          ))}
          {data.board.items.length === 0 && <span className="muted">Нет элементов</span>}
        </div>
      </div>

      <div className="panel">
        <h3>Последние приказы</h3>
        {data.orders.length === 0 ? (
          <p className="muted">
            Нет приказов. <Link to="/app/orders">Создать</Link>
          </p>
        ) : (
          data.orders.slice(0, 2).map((pack) => (
            <div key={pack.turn} className="list-block">
              <strong>Ход {pack.turn}</strong>
              <ul>
                {pack.items.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    {item.secret ? '🔒 ' : ''}
                    {item.title}
                    {item.budget ? ` — ${item.budget}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      {data.news.items.length > 0 && (
        <div className="panel">
          <h3>Новости</h3>
          {data.news.items.slice(0, 5).map((n) => (
            <div key={n.id} className="list-block">
              <strong>{n.title}</strong>
              {n.excerpt && <p className="muted">{n.excerpt}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
