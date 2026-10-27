import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  getSettings,
  listUsers,
  setRegistrationOpen,
  setUserStatus,
} from '../lib/registry'
import type { AppSettings, AppUser } from '../schema/registry'

export function Admin() {
  const { user, refreshProfile } = useAuth()
  const [users, setUsers] = useState<AppUser[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setBusy(true)
    setError(null)
    try {
      setUsers(await listUsers())
      setSettings(await getSettings())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (!user) return null

  return (
    <div className="page">
      <div className="panel">
        <h2>Администрирование</h2>
        <p className="muted">
          Первый зарегистрированный: администратор. Пока набор закрыт, новые пользователи ждут
          approve.
        </p>
        {settings && (
          <div className="btn-row admin-reg-row">
            <span>
              Регистрация:{' '}
              <strong>{settings.registrationOpen ? 'открыта' : 'закрыта'}</strong>
            </span>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                void (async () => {
                  await setRegistrationOpen({
                    actorUid: user.uid,
                    open: !settings.registrationOpen,
                  })
                  await load()
                  await refreshProfile()
                })()
              }
            >
              {settings.registrationOpen ? 'Закрыть набор' : 'Временно открыть набор'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void load()}>
              Обновить
            </button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Создан</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.uid}>
                <td>{u.email ?? u.uid}</td>
                <td>{u.role}</td>
                <td>{u.status}</td>
                <td>{new Date(u.createdAt).toLocaleString('ru-RU')}</td>
                <td>
                  {u.status !== 'approved' && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          await setUserStatus({
                            actorUid: user.uid,
                            targetUid: u.uid,
                            status: 'approved',
                          })
                          await load()
                        })()
                      }
                    >
                      Approve
                    </button>
                  )}
                  {u.status !== 'rejected' && u.role !== 'admin' && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          await setUserStatus({
                            actorUid: user.uid,
                            targetUid: u.uid,
                            status: 'rejected',
                          })
                          await load()
                        })()
                      }
                    >
                      Reject
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
