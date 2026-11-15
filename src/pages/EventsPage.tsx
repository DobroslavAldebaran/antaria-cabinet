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
import { DraftSaveError } from '../components/DraftSaveError'
import { saveEvents, saveIndicators } from '../lib/drive'
import {
  normalizeMetrics,
  revertEventFromIndicators,
  syncEventToIndicators,
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  const seededFolder = useRef<string | null>(null)

  const events = useMemo(
    () => data?.events ?? emptyEvents(),
    [data?.events],
  )
  const items = events.items
  const selectedId = searchParams.get('id') ?? items[0]?.id ?? null
  const setSelectedId = (id: string | null) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (id) next.set('id', id)
      else next.delete('id')
      return next
    }, { replace: true })
  }

  useEffect(() => {
    if (!binding || !data?.events) return
    if (seededFolder.current === binding.folderId) return
    seededFolder.current = binding.folderId
    setSavedIds(new Set(data.events.items.map((i) => i.id)))
  }, [binding, data])

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

  const { phase, markSaved, valueRef, saveError, retryAutosave } = useDraftAutosave({
    value: events,
    resetKey: binding?.folderId ?? '',
    enabled: Boolean(binding && data?.events) && !saving,
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
    if (!selected || savingRef.current) return
    savingRef.current = true
    setSaving(true)
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
      const latestEvents = stripUpdatedAt(valueRef.current) === stripUpdatedAt(events)
        ? nextEvents
        : { ...valueRef.current, items: valueRef.current.items.filter((item) => item.id !== selected.id) }
      setData({ ...data, indicators, events: latestEvents })
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
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const save = async () => {
    if (savingRef.current) return
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

    savingRef.current = true
    setSaving(true)
    try {
      const token = await ensureToken()
      let indicators = data.indicators
      for (const item of events.items) {
        indicators = syncEventToIndicators(indicators, item)
      }

      const nextEvents = { ...events, updatedAt: nowIso() }
      if (indicators !== data.indicators) {
        await saveIndicators(token, binding.folderId, indicators)
      }
      await saveEvents(token, binding.folderId, nextEvents)
      const latestEvents = stripUpdatedAt(valueRef.current) === stripUpdatedAt(events)
        ? nextEvents
        : valueRef.current
      setData({ ...data, indicators, events: latestEvents })
      markPersisted(nextEvents)
      markSaved(nextEvents, 'manual')
      setMsg('События сохранены')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const saveBusy = busy || saving || phase === 'saving'
  const saveLabel =
    saving || phase === 'saving'
      ? 'Сохранение…'
      : phase === 'saved'
        ? 'Сохранено'
        : 'Сохранить'

  return (
    <div className="page page-wide">
      <div className="panel">
        <h2>События</h2>
        <p className="muted">
          Кнопка «Сохранить» применяет изменения показателей и обновляет историю,
          в том числе после правки уже сохранённых событий. Ход обязателен.
          Удаление откатывает применённые изменения события. Автосохранение
          сохраняет только черновик, без изменения показателей и истории.
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
            const title = item?.title?.trim() || 'Без названия'
            return (
              <>
                <span className="master-detail-turn">
                  {item?.turn != null && Number.isFinite(item.turn)
                    ? item.turn
                    : '?'}
                </span>
                <span className="master-detail-label">{title}</span>
              </>
            )
          }}
        >
          {selected && selectedIdx >= 0 ? (
            <div className="stack" key={selected.id}>
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
                    if (raw === '') {
                      updateItem(selectedIdx, { turn: undefined })
                      return
                    }
                    const n = Number(raw)
                    updateItem(selectedIdx, {
                      turn: Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0,
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
                disabled={busy || saving}
              />
              {(data.indicators.ledger ?? []).some((row) => row.eventId === selected.id) ? (
                <p className="muted">
                  В истории показаны применённые изменения. Чтобы применить правки
                  черновика к показателям и истории, нажмите «Сохранить».
                </p>
              ) : null}
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={saveBusy}
                  onClick={() => void deleteSelected()}
                >
                  Удалить
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={saveBusy || !canClearSelected}
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
            <p className="muted">
              {selectedId
                ? 'Событие по ссылке не найдено. Выберите событие слева.'
                : 'Выберите событие слева или создайте новое.'}
            </p>
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
          {msg && !saveError ? <p className="ok">{msg}</p> : null}
          {phase === 'draft' && !msg ? (
            <p className="ok">Черновик сохранён</p>
          ) : null}
          {phase === 'saving' && !msg ? (
            <p className="muted">Сохранение…</p>
          ) : null}
        </div>
        <DraftSaveError error={saveError} onRetry={retryAutosave} />
        {err ? <p className="error">{err}</p> : null}
      </div>
    </div>
  )
}
