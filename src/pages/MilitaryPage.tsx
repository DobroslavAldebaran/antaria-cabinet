import { useState } from 'react'
import { useCabinet } from '../cabinet/CabinetProvider'
import { saveMilitary } from '../lib/drive'
import { newId, nowIso, type Military, type MilitaryUnit } from '../schema/province'
import { Onboarding } from './Onboarding'

export function MilitaryPage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (!binding || !data) return <Onboarding />

  const military = data.military

  const update = (next: Military) => {
    setData({ ...data, military: next })
  }

  const patchUnit = (idx: number, patch: Partial<MilitaryUnit>) => {
    const units = [...military.units]
    units[idx] = { ...units[idx], ...patch }
    update({ ...military, units })
  }

  const save = async () => {
    setMsg(null)
    setErr(null)
    try {
      const token = await ensureToken()
      const next = { ...military, updatedAt: nowIso() }
      await saveMilitary(token, binding.folderId, next)
      setData({ ...data, military: next })
      setMsg('Сохранено на Drive')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения')
    }
  }

  const empty = military.units.length === 0

  return (
    <div className="page">
      <div className={`panel ${empty ? 'military-empty' : ''}`}>
        <h2>Военка</h2>
        <p className="muted">
          Юниты провинции (количество: 1 = 100 чел.). Сохранение пишет military.json в папку Drive.
        </p>

        {empty ? (
          <div className="military-empty-body">
            <p>Пока нет юнитов.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                update({
                  ...military,
                  units: [
                    {
                      id: newId('mu'),
                      name: 'Новый юнит',
                      count: 0,
                    },
                  ],
                })
              }
            >
              Добавить юнит
            </button>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="table military-table">
                <caption className="sr-only">Юниты провинции</caption>
                <thead>
                  <tr>
                    <th scope="col">Название</th>
                    <th scope="col">Кол-во</th>
                    <th scope="col" className="col-desktop">
                      Найм
                    </th>
                    <th scope="col" className="col-desktop">
                      Содержание
                    </th>
                    <th scope="col">Заметка</th>
                    <th scope="col">
                      <span className="sr-only">Действия</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {military.units.map((u, idx) => (
                    <tr key={u.id}>
                      <td>
                        <input
                          className="table-input"
                          value={u.name}
                          aria-label={`Название юнита ${idx + 1}`}
                          onChange={(e) => patchUnit(idx, { name: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="table-input table-input-num"
                          type="number"
                          value={u.count}
                          aria-label={`Количество ${u.name}`}
                          onChange={(e) =>
                            patchUnit(idx, { count: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="col-desktop">
                        <input
                          className="table-input"
                          value={u.hire ?? ''}
                          aria-label={`Найм ${u.name}`}
                          onChange={(e) => {
                            const raw = e.target.value
                            const n = Number(raw)
                            patchUnit(idx, {
                              hire:
                                raw !== '' && !Number.isNaN(n) && String(n) === raw ? n : raw,
                            })
                          }}
                        />
                      </td>
                      <td className="col-desktop">
                        <input
                          className="table-input"
                          value={u.upkeep ?? ''}
                          aria-label={`Содержание ${u.name}`}
                          onChange={(e) => {
                            const raw = e.target.value
                            const n = Number(raw)
                            patchUnit(idx, {
                              upkeep:
                                raw !== '' && !Number.isNaN(n) && String(n) === raw ? n : raw,
                            })
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className="table-input"
                          value={u.note ?? ''}
                          aria-label={`Заметка ${u.name}`}
                          onChange={(e) => patchUnit(idx, { note: e.target.value })}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() =>
                            update({
                              ...military,
                              units: military.units.filter((x) => x.id !== u.id),
                            })
                          }
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  update({
                    ...military,
                    units: [
                      ...military.units,
                      { id: newId('mu'), name: 'Новый юнит', count: 0 },
                    ],
                  })
                }
              >
                Добавить юнит
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void save()}
              >
                Сохранить
              </button>
            </div>
          </>
        )}
        {msg && <p className="ok">{msg}</p>}
        {err && <p className="error">{err}</p>}
      </div>
    </div>
  )
}
