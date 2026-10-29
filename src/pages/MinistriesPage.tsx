import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCabinet } from '../cabinet/CabinetProvider'
import { CharacterPicker } from '../components/CharacterPicker'
import { MasterDetailList } from '../components/MasterDetailList'
import { MinistryParentPicker } from '../components/MinistryParentPicker'
import { useDraftAutosave } from '../hooks/useDraftAutosave'
import { saveMinistries } from '../lib/drive'
import {
  flattenMinistryTree,
  ministryDepthMap,
} from '../schema/ministries'
import {
  emptyMinistries,
  newId,
  nowIso,
  type MinistriesDoc,
  type Ministry,
} from '../schema/province'
import { Onboarding } from './Onboarding'

function stripUpdatedAt(doc: MinistriesDoc): string {
  return JSON.stringify({ ...doc, updatedAt: '' })
}

export function MinistriesPage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [searchParams] = useSearchParams()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  const seededFolder = useRef<string | null>(null)

  const ministries = useMemo(
    () => data?.ministries ?? emptyMinistries(),
    [data?.ministries],
  )
  const characters = data?.characters?.items ?? []
  const tree = useMemo(
    () => flattenMinistryTree(ministries.items),
    [ministries.items],
  )
  const depthById = useMemo(
    () => ministryDepthMap(ministries.items),
    [ministries.items],
  )
  const orderedItems = useMemo(
    () => tree.map((n) => ({ id: n.id })),
    [tree],
  )

  useEffect(() => {
    const q = searchParams.get('id')
    if (q) setSelectedId(q)
  }, [searchParams])

  useEffect(() => {
    if (!binding || !data?.ministries) return
    if (seededFolder.current === binding.folderId) return
    seededFolder.current = binding.folderId
    setSavedIds(new Set(data.ministries.items.map((i) => i.id)))
  }, [binding, data])

  useEffect(() => {
    if (!orderedItems.length) {
      setSelectedId(null)
      return
    }
    if (selectedId && orderedItems.some((i) => i.id === selectedId)) return
    setSelectedId(orderedItems[0]?.id ?? null)
  }, [orderedItems, selectedId])

  const selectedIdx = ministries.items.findIndex((i) => i.id === selectedId)
  const selected = selectedIdx >= 0 ? ministries.items[selectedIdx] : null

  const canClearSelected =
    Boolean(selected) && selected != null && !savedIds.has(selected.id)

  const setMinistries = (next: MinistriesDoc) => {
    if (!data) return
    setData({ ...data, ministries: next })
  }

  const markPersisted = (next: MinistriesDoc) => {
    setSavedIds(new Set(next.items.map((i) => i.id)))
  }

  const { phase, markSaved, valueRef } = useDraftAutosave({
    value: ministries,
    resetKey: binding?.folderId ?? '',
    enabled: Boolean(binding && data?.ministries),
    onSave: async (current) => {
      if (!binding) return
      setErr(null)
      const token = await ensureToken()
      const next = { ...current, updatedAt: nowIso() }
      await saveMinistries(token, binding.folderId, next)
      markPersisted(next)
      if (stripUpdatedAt(valueRef.current) === stripUpdatedAt(current)) {
        setMinistries(next)
        markSaved(next, 'draft')
      }
      setMsg('Черновик сохранён')
    },
  })

  if (!binding || !data || !data.ministries) return <Onboarding />

  const updateItem = (idx: number, patch: Partial<Ministry>) => {
    const nextItems = [...ministries.items]
    nextItems[idx] = { ...nextItems[idx], ...patch }
    setMinistries({ ...ministries, items: nextItems })
  }

  const createMinistry = () => {
    const item: Ministry = {
      id: newId('min'),
      name: 'Новое министерство',
      description: '',
      at: nowIso(),
    }
    setMinistries({ ...ministries, items: [...ministries.items, item] })
    setSelectedId(item.id)
    setErr(null)
  }

  const clearSelected = () => {
    if (!selected || savedIds.has(selected.id)) return
    const nextItems = ministries.items.filter((x) => x.id !== selected.id)
    setMinistries({ ...ministries, items: nextItems })
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
      const nextItems = ministries.items
        .filter((x) => x.id !== selected.id)
        .map((x) => {
          if (x.parentId !== selected.id) return x
          const { parentId: _p, ...rest } = x
          return rest
        })
      const next: MinistriesDoc = {
        ...ministries,
        items: nextItems,
        updatedAt: nowIso(),
      }
      await saveMinistries(token, binding.folderId, next)
      setData({ ...data, ministries: next })
      markPersisted(next)
      markSaved(next, 'manual')
      setSelectedId(next.items[0]?.id ?? null)
      setMsg('Министерство удалено')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка удаления')
    }
  }

  const save = async () => {
    setErr(null)
    setMsg(null)
    try {
      const token = await ensureToken()
      const next = { ...ministries, updatedAt: nowIso() }
      await saveMinistries(token, binding.folderId, next)
      setData({ ...data, ministries: next })
      markPersisted(next)
      markSaved(next, 'manual')
      setMsg('Министерства сохранены')
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
        <h2>Министерства</h2>
        <p className="muted">
          Структура министерств: название, описание, управляющий из персонажей и
          основное министерство. Черновик пишется на Drive автоматически.
        </p>

        <MasterDetailList
          items={orderedItems}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreate={createMinistry}
          createLabel="Новое министерство"
          emptyLabel="Пока нет министерств"
          getItemClassName={(id) => {
            const depth = depthById.get(id) ?? 0
            return depth > 0 ? `is-child depth-${Math.min(depth, 6)}` : undefined
          }}
          renderItemLabel={(id) => {
            const item = ministries.items.find((x) => x.id === id)
            const name = item?.name?.trim() || 'Без названия'
            const manager = item?.managerCharacterId
              ? characters.find((c) => c.id === item.managerCharacterId)
              : undefined
            const caption = manager?.name?.trim() ?? ''
            return (
              <span className="master-detail-text">
                <span className="master-detail-label">{name}</span>
                {caption ? (
                  <span className="master-detail-caption muted">{caption}</span>
                ) : null}
              </span>
            )
          }}
        >
          {selected && selectedIdx >= 0 ? (
            <div className="stack">
              <div className="field">
                <label>Название</label>
                <input
                  value={selected.name}
                  onChange={(e) =>
                    updateItem(selectedIdx, { name: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Описание</label>
                <textarea
                  rows={5}
                  value={selected.description ?? ''}
                  onChange={(e) =>
                    updateItem(selectedIdx, { description: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Управляющий</label>
                <CharacterPicker
                  characters={characters}
                  value={selected.managerCharacterId}
                  onChange={(managerCharacterId) => {
                    if (!managerCharacterId) {
                      const { managerCharacterId: _m, ...rest } =
                        ministries.items[selectedIdx]
                      const nextItems = [...ministries.items]
                      nextItems[selectedIdx] = rest
                      setMinistries({ ...ministries, items: nextItems })
                      return
                    }
                    updateItem(selectedIdx, { managerCharacterId })
                  }}
                />
              </div>
              <div className="field">
                <label>Основное министерство</label>
                <MinistryParentPicker
                  ministries={ministries.items}
                  currentId={selected.id}
                  value={selected.parentId}
                  onChange={(parentId) => {
                    if (!parentId) {
                      const { parentId: _p, ...rest } =
                        ministries.items[selectedIdx]
                      const nextItems = [...ministries.items]
                      nextItems[selectedIdx] = rest
                      setMinistries({ ...ministries, items: nextItems })
                      return
                    }
                    updateItem(selectedIdx, { parentId })
                  }}
                />
              </div>
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
                      ? 'Убрать ещё не сохранённое министерство'
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
              Выберите министерство слева или создайте новое.
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
