import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCabinet } from '../cabinet/CabinetProvider'
import { EffectsEditor } from '../components/EffectsEditor'
import { MasterDetailList } from '../components/MasterDetailList'
import { RichTextEditor } from '../components/RichTextEditor'
import { saveEvents, saveIndicators } from '../lib/drive'
import {
  applyEffectsToIndicators,
  mergeCreatedMetrics,
  normalizeMetrics,
  revertEventFromIndicators,
} from '../schema/metrics'
import {
  newId,
  nowIso,
  type CabinetEvent,
  type EventsDoc,
  type Metric,
} from '../schema/province'
import { Onboarding } from './Onboarding'

export function EventsPage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [searchParams] = useSearchParams()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const events = data?.events
  const items = events?.items ?? []

  useEffect(() => {
    const q = searchParams.get('id')
    if (q) setSelectedId(q)
  }, [searchParams])

  useEffect(() => {
    if (!items.length) {
      setSelectedId(null)
      return
    }
    if (selectedId && items.some((i) => i.id === selectedId)) return
    setSelectedId(items[0]?.id ?? null)
  }, [items, selectedId])

  const metrics = useMemo(
    () => normalizeMetrics(data?.indicators.metrics ?? []),
    [data?.indicators.metrics],
  )

  const selectedIdx = items.findIndex((i) => i.id === selectedId)
  const selected = selectedIdx >= 0 ? items[selectedIdx] : null

  const editorMetrics = useMemo(() => {
    if (!selected) return metrics
    return normalizeMetrics([...metrics, ...(selected.createdMetrics ?? [])])
  }, [metrics, selected])

  if (!binding || !data || !events) return <Onboarding />

  const setEvents = (next: EventsDoc) => {
    setData({ ...data, events: next })
  }

  const updateItem = (idx: number, patch: Partial<CabinetEvent>) => {
    const nextItems = [...events.items]
    nextItems[idx] = { ...nextItems[idx], ...patch }
    setEvents({ ...events, items: nextItems })
  }

  const addCreatedMetric = (metric: Metric) => {
    if (selectedIdx < 0 || !selected) return
    const created = [...(selected.createdMetrics ?? []), metric]
    updateItem(selectedIdx, { createdMetrics: created })
  }

  const createEvent = () => {
    const item: CabinetEvent = {
      id: newId('evt'),
      title: 'Новое событие',
      at: nowIso(),
      effects: [],
      createdMetrics: [],
      body: '',
    }
    setEvents({ ...events, items: [...events.items, item] })
    setSelectedId(item.id)
    setErr(null)
  }

  const deleteSelected = async () => {
    if (!selected) return
    setErr(null)
    setMsg(null)
    try {
      const token = await ensureToken()
      const indicators = revertEventFromIndicators(
        data.indicators,
        selected.id,
      )
      const nextEvents: EventsDoc = {
        ...events,
        items: events.items.filter((x) => x.id !== selected.id),
        updatedAt: nowIso(),
      }
      if (indicators !== data.indicators) {
        await saveIndicators(token, binding.folderId, indicators)
      }
      await saveEvents(token, binding.folderId, nextEvents)
      setData({ ...data, indicators, events: nextEvents })
      setSelectedId(nextEvents.items[0]?.id ?? null)
      setMsg(
        indicators !== data.indicators
          ? 'Событие удалено, изменения показателей откачены'
          : 'Событие удалено',
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка удаления')
    }
  }

  const save = async () => {
    setErr(null)
    setMsg(null)
    const missingTurn = events.items.find(
      (item) => item.turn == null || !Number.isFinite(item.turn),
    )
    if (missingTurn) {
      setErr(`Укажите ход для «${missingTurn.title || 'события'}»`)
      setSelectedId(missingTurn.id)
      return
    }

    try {
      const token = await ensureToken()
      let indicators = data.indicators
      const alreadyApplied = new Set(
        (indicators.ledger ?? [])
          .map((row) => row.eventId)
          .filter((id): id is string => Boolean(id)),
      )

      for (const item of events.items) {
        const created = item.createdMetrics ?? []
        const effects = item.effects ?? []
        if (!created.length && !effects.length) continue
        if (alreadyApplied.has(item.id)) continue

        const at = item.at || nowIso()
        indicators = mergeCreatedMetrics(indicators, created, {
          kind: 'event',
          title: 'Появился показатель',
          turn: item.turn,
          eventId: item.id,
          at,
        })
        if (effects.length) {
          indicators = applyEffectsToIndicators(indicators, effects, {
            kind: 'event',
            title: item.title || 'Событие',
            turn: item.turn,
            eventId: item.id,
            at,
          })
        }
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
    <div className="page page-wide">
      <div className="panel">
        <h2>События</h2>
        <p className="muted">
          Изменения показателей применяются сразу при первом сохранении события с
          дельтами или новыми показателями. Ход обязателен. Удаление откатывает
          уже применённые эффекты этого события.
        </p>

        <MasterDetailList
          items={events.items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreate={createEvent}
          createLabel="Новое событие"
          emptyLabel="Пока нет событий"
          renderItemLabel={(id) => {
            const item = events.items.find((x) => x.id === id)
            return item?.title?.trim() || 'Без названия'
          }}
        >
          {selected && selectedIdx >= 0 ? (
            <div className="stack">
              <div className="field">
                <label>Заголовок</label>
                <input
                  value={selected.title}
                  onChange={(e) =>
                    updateItem(selectedIdx, { title: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Ход</label>
                <input
                  type="number"
                  required
                  value={selected.turn ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value
                    updateItem(selectedIdx, {
                      turn: raw === '' ? undefined : Number(raw) || 0,
                    })
                  }}
                />
              </div>
              <div className="field">
                <label>Текст</label>
                <RichTextEditor
                  value={selected.body ?? ''}
                  onChange={(body) => updateItem(selectedIdx, { body })}
                  folderId={binding.folderId}
                  getAccessToken={ensureToken}
                />
              </div>
              <EffectsEditor
                effects={selected.effects ?? []}
                metrics={editorMetrics}
                onCreateMetric={addCreatedMetric}
                onChange={(effects) => updateItem(selectedIdx, { effects })}
              />
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => void deleteSelected()}
              >
                Удалить
              </button>
            </div>
          ) : (
            <p className="muted">Выберите событие слева или создайте новое.</p>
          )}
        </MasterDetailList>

        <div className="btn-row" style={{ marginTop: '1rem' }}>
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
