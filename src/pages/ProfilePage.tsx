import { useState } from 'react'
import { useCabinet } from '../cabinet/CabinetProvider'
import { saveMeta, saveProfile } from '../lib/drive'
import { newId, nowIso } from '../schema/province'
import { Onboarding } from './Onboarding'

export function ProfilePage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [msg, setMsg] = useState<string | null>(null)
  if (!binding || !data) return <Onboarding />

  const { meta, profile } = data

  return (
    <div className="page">
      <div className="panel">
        <h2>Профиль провинции</h2>
        <div className="stack">
          <div className="field">
            <label>Название</label>
            <input
              value={meta.provinceName}
              onChange={(e) =>
                setData({ ...data, meta: { ...meta, provinceName: e.target.value } })
              }
            />
          </div>
          <div className="field">
            <label>Правитель</label>
            <input
              value={meta.ruler}
              onChange={(e) => setData({ ...data, meta: { ...meta, ruler: e.target.value } })}
            />
          </div>
          <div className="field">
            <label>Фракция</label>
            <input
              value={meta.faction}
              onChange={(e) => setData({ ...data, meta: { ...meta, faction: e.target.value } })}
            />
          </div>
          <div className="field">
            <label>Текущий ход</label>
            <input
              type="number"
              value={meta.currentTurn}
              onChange={(e) =>
                setData({
                  ...data,
                  meta: { ...meta, currentTurn: Number(e.target.value) || 0 },
                })
              }
            />
          </div>
          <div className="field">
            <label>Публичный лор</label>
            <textarea
              value={profile.publicLore}
              onChange={(e) =>
                setData({ ...data, profile: { ...profile, publicLore: e.target.value } })
              }
            />
          </div>
          <div className="field">
            <label>Приватный лор</label>
            <textarea
              value={profile.privateLore}
              onChange={(e) =>
                setData({ ...data, profile: { ...profile, privateLore: e.target.value } })
              }
            />
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Министерства</h3>
        {profile.ministries.map((m, idx) => (
          <div key={m.id} className="list-block stack">
            <div className="field">
              <label>Название</label>
              <input
                value={m.name}
                onChange={(e) => {
                  const ministries = [...profile.ministries]
                  ministries[idx] = { ...m, name: e.target.value }
                  setData({ ...data, profile: { ...profile, ministries } })
                }}
              />
            </div>
            <div className="field">
              <label>Глава</label>
              <input
                value={m.head ?? ''}
                onChange={(e) => {
                  const ministries = [...profile.ministries]
                  ministries[idx] = { ...m, head: e.target.value }
                  setData({ ...data, profile: { ...profile, ministries } })
                }}
              />
            </div>
            <div className="field">
              <label>Роль / заметки</label>
              <textarea
                value={m.notes ?? m.role ?? ''}
                onChange={(e) => {
                  const ministries = [...profile.ministries]
                  ministries[idx] = { ...m, notes: e.target.value }
                  setData({ ...data, profile: { ...profile, ministries } })
                }}
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                setData({
                  ...data,
                  profile: {
                    ...profile,
                    ministries: profile.ministries.filter((x) => x.id !== m.id),
                  },
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
                profile: {
                  ...profile,
                  ministries: [
                    ...profile.ministries,
                    { id: newId('min'), name: 'Новое министерство' },
                  ],
                },
              })
            }
          >
            Добавить министерство
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              void (async () => {
                const token = await ensureToken()
                const nextMeta = { ...meta, updatedAt: nowIso() }
                const nextProfile = { ...profile, updatedAt: nowIso() }
                await saveMeta(token, binding.folderId, nextMeta)
                await saveProfile(token, binding.folderId, nextProfile)
                setData({ ...data, meta: nextMeta, profile: nextProfile })
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
