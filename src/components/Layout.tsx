import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export function Layout() {
  const { profile, signOut, user, accessToken, refreshDriveToken, driveRefreshing, error } = useAuth()
  const approved = profile?.status === 'approved'
  const isAdmin = profile?.role === 'admin'

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand-mark">
          Antaria Cabinet
        </NavLink>
        {approved && (
          <nav>
            {(
              [
                ['/app', 'Дашборд'],
                ['/app/orders', 'Приказы'],
                ['/app/verdicts', 'Вердикты'],
                ['/app/events', 'События'],
                ['/app/characters', 'Персонажи'],
                ['/app/ministries', 'Министерства'],
                ['/app/profile', 'Профиль'],
                ['/app/io', 'Импорт/Экспорт'],
              ] as const
            ).map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/app'}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                Админ
              </NavLink>
            )}
          </nav>
        )}
        <div className="btn-row">
          {user && (
            <span className="muted topbar-email">{user.email}</span>
          )}
          {user && (
            <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
              Выйти
            </button>
          )}
        </div>
      </header>
      {approved && !accessToken ? (
        <div className="page" role="alert">
          <p className="error">Доступ к Google Drive истёк или не подключён. Для сохранения на Drive обновите доступ.</p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={driveRefreshing}
            onClick={() => void refreshDriveToken().catch(() => {})}
          >
            {driveRefreshing ? 'Обновление доступа…' : 'Обновить доступ к Drive'}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </div>
      ) : null}
      <Outlet />
    </div>
  )
}
