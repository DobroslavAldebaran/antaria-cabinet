import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export function Pending() {
  const { profile, user, signOut, refreshProfile } = useAuth()

  if (!user) return <Navigate to="/" replace />
  if (profile?.status === 'approved') return <Navigate to="/app" replace />

  const rejected = profile?.status === 'rejected'

  return (
    <div className="page">
      <div className="panel">
        <h2>{rejected ? 'Доступ отклонён' : 'Ожидание одобрения'}</h2>
        <p className="muted">
          {rejected
            ? 'Администратор отклонил заявку. Повторная регистрация возможна только после его решения.'
            : 'Первый пользователь стал администратором. Новые аккаунты не получают доступ, пока администратор не одобрит заявку.'}
        </p>
        <p>
          Статус: <span className={`badge ${profile?.status ?? 'pending'}`}>{profile?.status}</span>
        </p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => void refreshProfile()}>
            Обновить статус
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
            Выйти
          </button>
        </div>
      </div>
    </div>
  )
}
