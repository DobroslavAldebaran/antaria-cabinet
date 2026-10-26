import { useState } from 'react'
import { useCabinet } from '../cabinet/CabinetProvider'
import { saveRelations } from '../lib/drive'
import { newId, nowIso, type Relations } from '../schema/province'
import { Onboarding } from './Onboarding'

export function RelationsPage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [msg, setMsg] = useState<string | null>(null)
  if (!binding || !data) return <Onboarding />
  const relations = data.relations
  const update = (next: Relations) => setData({ ...data, relations: next })

  return (
    <div className="page">
      <div className="panel">
        <h2>Отношения</h2>
        {relations.parties.map((p, idx) => (
          <div key={p.id} className="list-block stack">
            <div className="field">
              <label>Сторона</label>
              <input
                value={p.name}
                onChange={(e) => {
                  const parties = [...relations.parties]
                  parties[idx] = { ...p, name: e.target.value }
                  update({ ...relations, parties })
                }}
              />
            </div>
            <div className="field">
              <label>Позиция</label>
              <input
                value={p.stance}
                onChange={(e) => {
                  const parties = [...relations.parties]
                  parties[idx] = { ...p, stance: e.target.value }
                  update({ ...relations, parties })
                }}
              />
            </div>
            <div className="field">
              <label>Договоры (через ;)</label>
              <input
                value={p.treaties.join('; ')}
                onChange={(e) => {
                  const parties = [...relations.parties]
                  parties[idx] = {
                    ...p,
                    treaties: e.target.value
                      .split(';')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }
                  update({ ...relations, parties })
                }}
              />
            </div>
            <div className="field">
              <label>Заметки</label>
              <textarea
                value={p.notes ?? ''}
                onChange={(e) => {
                  const parties = [...relations.parties]
                  parties[idx] = { ...p, notes: e.target.value }
                  update({ ...relations, parties })
                }}
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                update({
                  ...relations,
                  parties: relations.parties.filter((x) => x.id !== p.id),
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
              update({
                ...relations,
                parties: [
                  ...relations.parties,
                  { id: newId('rel'), name: 'Новая сторона', stance: 'neutral', treaties: [] },
                ],
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
                const next = { ...relations, updatedAt: nowIso() }
                await saveRelations(token, binding.folderId, next)
                setData({ ...data, relations: next })
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
