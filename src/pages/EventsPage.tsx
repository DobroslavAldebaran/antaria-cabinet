import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCabinet } from '../cabinet/CabinetProvider'
import {
  EffectsEditor,
  type CreateMetricAttach,
} from '../components/EffectsEditor'
import { MasterDetailList } from '../components/MasterDetailList'
import { RichTextEditor } from '../components/RichTextEditor'
import { useDraftAutosave } from '../hooks/useDraftAutosave'
import { saveEvents, saveIndicators } from '../lib/drive'
import {
  applyEffectsToIndicators,
  mergeCreatedMetrics,
  normalizeMetrics,
  revertEventFromIndicators,
} from '../schema/metrics'
import {
  emptyEvents,
  newId,
  nowIso,
  type CabinetEvent,
  type EventsDoc,
  type Metric,
} from '../schema/province'
import { Onboarding } from './Onboarding'

function stripUpdatedAt(doc: EventsDoc): string {
  return JSON.stringify({ ...doc, updatedAt: '' })
}

export function EventsPage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [searchParams] = useSearchParams()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  const seededFolder = useRef<string | null>(null)

  const events = useMemo(
    () => data?.events ?? emptyEvents(),
    [data?.events],
  )
  const items = events.items

  useEffect(() => {
    const q = searchParams.get('id')
    if (q) setSelectedId(q)
  }, [searchParams])

  useEffect(() => {
    if (!binding || !data?.events) return
    if (seededFolder.current === binding.folderId) return
    seededFolder.current = binding.folderId
    setSavedIds(new Set(data.events.items.map((i) => i.id)))
  }, [binding, data])

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

  const canClearSelected =
    Boolean(selected) && selected != null && !savedIds.has(selected.id)

  const setEvents = (next: EventsDoc) => {
    if (!data) return
    setData({ ...data, events: next })
  }

  const markPersisted = (next: EventsDoc) => {
    setSavedIds(new Set(next.items.map((i) => i.id)))
  }

  const { phase, markSaved, valueRef } = useDraftAutosave({
    value: events,
    resetKey: binding?.folderId ?? '',
    enabled: Boolean(binding && data?.events),
    onSave: async (current) => {
      if (!binding) return
      setErr(null)
      const token = await ensureToken()
      const next = { ...current, updatedAt: nowIso() }
      await saveEvents(token, binding.folderId, next)
      markPersisted(next)
      if (stripUpdatedAt(valueRef.current) === stripUpdatedAt(current)) {
        setEvents(next)
        markSaved(next, 'draft')
      }
      setMsg('Черновик сохранён')
    },
  })

  if (!binding || !data || !data.events) return <Onboarding />

  const updateItem = (idx: number, patch: Partial<CabinetEvent>) => {
    const nextItems = [...events.items]
    nextItems[idx] = { ...nextItems[idx], ...patch }
    setEvents({ ...events, items: nextItems })
  }

  const addCreatedMetric = (metric: Metric, attach: CreateMetricAttach) => {
    if (selectedIdx < 0 || !selected) return
    const createdMetrics = [...(selected.createdMetrics ?? []), metric]
    let effects = [...(selected.effects ?? [])]
    if (attach === 'new-row') {
      effects.push({
        id: newId('fx'),
        metricId: metric.id,
        delta: 0,
      })
    } else {
      effects = effects.map((e) =>
        e.id === attach.effectId ? { ...e, metricId: metric.id } : e,
      )
    }
    updateItem(selectedIdx, { createdMetrics, effects })
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

  const clearSelected = () => {
    if (!selected || savedIds.has(selected.id)) return
    const nextItems = events.items.filter((x) => x.id !== selected.id)
    setEvents({ ...events, items: nextItems })
    setSelectedId(nextItems[0]?.id ?? null)
    setErr(null)
    setMsg(null)
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
      markPersisted(nextEvents)
      markSaved(nextEvents, 'manual')
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

        const at = item.at || nowIso()
        // Idempotent by metric id — safe on re-save after event already hit ledger.
        indicators = mergeCreatedMetrics(indicators, created, {
          kind: 'event',
          title: item.title?.trim() || 'Событие',
          turn: item.turn,
          eventId: item.id,
          at,
        })

        if (alreadyApplied.has(item.id)) continue

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
      markPersisted(nextEvents)
      markSaved(nextEvents, 'manual')
      setMsg('События сохранены')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения')
    }
  }

  const saveBusy = busy || phase === 'saving'
  const saveLabel =
    phase === 'saving'
      ? 'Сохранение…'
      : phase === 'saved'
        ? 'Сохранено'
        : 'Сохранить'

  return (
    <div className="page page-wide">
      <div className="panel">
        <h2>События</h2>
        <p className="muted">
          Изменения показателей применяются сразу при первом сохранении события с
          дельтами или новыми показателями. Ход обязателен. Удаление откатывает
          уже применённые эффекты этого события. Черновик пишется на Drive без
          применения дельт.
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
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => void deleteSelected()}
                >
                  Удалить
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!canClearSelected}
                  title={
                    canClearSelected
                      ? 'Убрать ещё не сохранённое событие'
                      : 'Очистить можно только до первого сохранения'
                  }
                  onClick={clearSelected}
                >
                  Очистить
                </button>
              </div>
            </div>
          ) : (
            <p className="muted">Выберите событие слева или создайте новое.</p>
          )}
        </MasterDetailList>

        <div className="btn-row" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saveBusy}
            onClick={() => void save()}
          >
            {saveLabel}
          </button>
        </div>
        <div role="status" aria-live="polite">
          {msg ? <p className="ok">{msg}</p> : null}
          {phase === 'draft' && !msg ? (
            <p className="ok">Черновик сохранён</p>
          ) : null}
          {phase === 'saving' && !msg ? (
            <p className="muted">Сохранение…</p>
          ) : null}
        </div>
        {err ? <p className="error">{err}</p> : null}
      </div>
    </div>
  )
}
