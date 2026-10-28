import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCabinet } from '../cabinet/CabinetProvider'
import { EffectsEditor } from '../components/EffectsEditor'
import { saveEvents, saveIndicators } from '../lib/drive'
import {
  applyEffectsToIndicators,
  normalizeMetrics,
} from '../schema/metrics'
import {
  newId,
  nowIso,
  type CabinetEvent,
  type EventsDoc,
} from '../schema/province'
import { Onboarding } from './Onboarding'

export function EventsPage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [searchParams] = useSearchParams()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)

  useEffect(() => {
    const q = searchParams.get('id')
    if (!q) return
    setFocusId(q)
    const t = window.setTimeout(() => {
      document.getElementById(`event-${q}`)?.scrollIntoView({ block: 'center' })
    }, 0)
    return () => window.clearTimeout(t)
  }, [searchParams])

  if (!binding || !data) return <Onboarding />

  const metrics = normalizeMetrics(data.indicators.metrics)
  const events = data.events

  const setEvents = (next: EventsDoc) => {
    setData({ ...data, events: next })
  }

  const updateItem = (idx: number, patch: Partial<CabinetEvent>) => {
    const items = [...events.items]
    items[idx] = { ...items[idx], ...patch }
    setEvents({ ...events, items })
  }

  const save = async () => {
    setErr(null)
    setMsg(null)
    try {
      const token = await ensureToken()
      let indicators = data.indicators
      const alreadyApplied = new Set(
        (indicators.ledger ?? [])
          .map((row) => row.eventId)
          .filter((id): id is string => Boolean(id)),
      )

      for (const item of events.items) {
        if (!item.effects?.length) continue
        if (alreadyApplied.has(item.id)) continue
        indicators = applyEffectsToIndicators(indicators, item.effects, {
          kind: 'event',
          title: item.title || 'Событие',
          turn: item.turn,
          eventId: item.id,
          at: item.at || nowIso(),
        })
        alreadyApplied.add(item.id)
      }

      const nextEvents = { ...events, updatedAt: nowIso() }
      if (indicators !== data.indicators) {
        await saveIndicators(token, binding.folderId, indicators)
      }
      await saveEvents(token, binding.folderId, nextEvents)
      setData({ ...data, indicators, events: nextEvents })
      setMsg('События сохранены')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения')
    }
  }

  return (
    <div className="page">
      <div className="panel">
        <h2>События</h2>
        <p className="muted">
          Изменения показателей применяются сразу при первом сохранении события с дельтами.
        </p>

        {events.items.map((item, idx) => (
          <div
            key={item.id}
            id={`event-${item.id}`}
            className={
              focusId === item.id
                ? 'list-block stack is-focused'
                : 'list-block stack'
            }
          >
            <div className="field">
              <label>Заголовок</label>
              <input
                value={item.title}
                onChange={(e) => updateItem(idx, { title: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Ход (необязательно)</label>
              <input
                type="number"
                value={item.turn ?? ''}
                onChange={(e) => {
                  const raw = e.target.value
                  updateItem(idx, {
                    turn: raw === '' ? undefined : Number(raw) || 0,
                  })
                }}
              />
            </div>
            <div className="field">
              <label>Текст</label>
              <textarea
                value={item.body ?? ''}
                onChange={(e) => updateItem(idx, { body: e.target.value })}
              />
            </div>
            <EffectsEditor
              effects={item.effects ?? []}
              metrics={metrics}
              onChange={(effects) => updateItem(idx, { effects })}
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                setEvents({
                  ...events,
                  items: events.items.filter((x) => x.id !== item.id),
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
              setEvents({
                ...events,
                items: [
                  ...events.items,
                  {
                    id: newId('evt'),
                    title: 'Новое событие',
                    at: nowIso(),
                    effects: [],
                  },
                ],
              })
            }
          >
            Добавить событие
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
        {msg ? <p className="ok">{msg}</p> : null}
        {err ? <p className="error">{err}</p> : null}
      </div>
    </div>
  )
}
