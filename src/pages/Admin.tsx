import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  getSettings,
  getVkSettings,
  listUsers,
  saveVkSettings,
  setRegistrationOpen,
  setUserStatus,
} from '../lib/registry'
import type { AppSettings, AppUser, VkSettings } from '../schema/registry'

const VK_TOKEN_DOCS =
  'https://dev.vk.com/ru/api/access-token/community-token'

export function Admin() {
  const { user, refreshProfile } = useAuth()
  const [users, setUsers] = useState<AppUser[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [vk, setVk] = useState<VkSettings | null>(null)
  const [vkGroupId, setVkGroupId] = useState('')
  const [vkScreenName, setVkScreenName] = useState('')
  const [vkToken, setVkToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [vkMsg, setVkMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setBusy(true)
    setError(null)
    try {
      setUsers(await listUsers())
      setSettings(await getSettings())
      const vkSettings = await getVkSettings()
      setVk(vkSettings)
      if (vkSettings) {
        setVkGroupId(vkSettings.groupId)
        setVkScreenName(vkSettings.screenName)
        setVkToken(vkSettings.accessToken)
      }
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

  const saveVk = async () => {
    setVkMsg(null)
    setError(null)
    setBusy(true)
    try {
      const next = await saveVkSettings({
        groupId: vkGroupId,
        screenName: vkScreenName,
        accessToken: vkToken,
      })
      setVk(next)
      setVkMsg('Настройки VK сохранены')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить VK')
    } finally {
      setBusy(false)
    }
  }

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
                <td>
                  {u.email ?? u.uid}
                  {u.displayName ? <div className="muted">{u.displayName}</div> : null}
                </td>
                <td>
                  <span className={`badge ${u.role}`}>{u.role}</span>
                </td>
                <td>
                  <span className={`badge ${u.status}`}>{u.status}</span>
                </td>
                <td className="muted">{new Date(u.createdAt).toLocaleString()}</td>
                <td>
                  {u.role !== 'admin' && u.status !== 'approved' && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        void setUserStatus({
                          actorUid: user.uid,
                          targetUid: u.uid,
                          status: 'approved',
                        }).then(load)
                      }
                    >
                      Approve
                    </button>
                  )}{' '}
                  {u.role !== 'admin' && u.status !== 'rejected' && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() =>
                        void setUserStatus({
                          actorUid: user.uid,
                          targetUid: u.uid,
                          status: 'rejected',
                        }).then(load)
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

      <div className="panel">
        <h2>VK: стена и токен</h2>
        <p className="muted">
          Токен сообщества хранится в Firestore <code>settings/vk</code>, не в VITE и не в git.
          Одобренные пользователи кабинета читают его с клиента для JSONP wall.get: это приемлемо
          только для закрытого круга. Для публичного интернета вынесите вызов в Cloud Function.
        </p>
        <p className="muted">
          Инструкция:{' '}
          <a href={VK_TOKEN_DOCS} target="_blank" rel="noreferrer">
            Ключ доступа сообщества
          </a>
          {' '}
          (Управление сообщества → Дополнительно → Работа с API → Создать ключ; права на стену).
        </p>
        <div className="stack">
          <div className="field">
            <label htmlFor="vk-group">Group id (числовой, без минуса)</label>
            <input
              id="vk-group"
              value={vkGroupId}
              onChange={(e) => setVkGroupId(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="vk-screen">Screen name</label>
            <input
              id="vk-screen"
              value={vkScreenName}
              onChange={(e) => setVkScreenName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="vk-token">Access token сообщества</label>
            <input
              id="vk-token"
              type="password"
              value={vkToken}
              onChange={(e) => setVkToken(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void saveVk()}
          >
            Сохранить VK
          </button>
        </div>
        {vkMsg && <p className="ok">{vkMsg}</p>}
        {vk?.updatedAt && (
          <p className="muted">Обновлено: {new Date(vk.updatedAt).toLocaleString('ru-RU')}</p>
        )}
      </div>
    </div>
  )
}
