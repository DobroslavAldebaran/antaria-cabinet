import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export function Layout() {
  const { profile, signOut, user } = useAuth()
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
                ['/app/military', 'Военка'],
                ['/app/board', 'Доска'],
                ['/app/orders', 'Приказы'],
                ['/app/relations', 'Отношения'],
                ['/app/profile', 'Профиль'],
                ['/app/maps', 'Карты'],
                ['/app/news', 'Новости'],
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
      <Outlet />
    </div>
  )
}
