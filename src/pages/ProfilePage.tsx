import { useState } from 'react'
import { useCabinet } from '../cabinet/CabinetProvider'
import { saveMeta, saveProfile } from '../lib/drive'
import { nowIso } from '../schema/province'
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
        <div className="btn-row" style={{ marginTop: '1rem' }}>
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
                setMsg('Профиль сохранён')
              })()
            }
          >
            Сохранить
          </button>
        </div>
        {msg ? <p className="ok">{msg}</p> : null}
      </div>
    </div>
  )
}
