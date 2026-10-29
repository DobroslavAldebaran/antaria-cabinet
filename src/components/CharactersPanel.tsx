import { useEffect, useMemo, useRef, useState } from 'react'
import { useCabinet } from '../cabinet/CabinetProvider'
import { useDraftAutosave } from '../hooks/useDraftAutosave'
import {
  ensureMediaFolder,
  saveCharacters,
  uploadMediaFile,
} from '../lib/drive'
import {
  emptyCharacters,
  newId,
  nowIso,
  type Character,
  type CharactersDoc,
} from '../schema/province'
import { MasterDetailList } from './MasterDetailList'
import { RichTextEditor } from './RichTextEditor'

function stripUpdatedAt(doc: CharactersDoc): string {
  return JSON.stringify({ ...doc, updatedAt: '' })
}

export function CharactersPanel({
  initialSelectedId,
}: {
  initialSelectedId?: string | null
}) {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId ?? null,
  )
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  const [avatarBusy, setAvatarBusy] = useState(false)
  const seededFolder = useRef<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const characters = useMemo(
    () => data?.characters ?? emptyCharacters(),
    [data?.characters],
  )
  const items = characters.items

  useEffect(() => {
    if (initialSelectedId) setSelectedId(initialSelectedId)
  }, [initialSelectedId])

  useEffect(() => {
    if (!binding || !data?.characters) return
    if (seededFolder.current === binding.folderId) return
    seededFolder.current = binding.folderId
    setSavedIds(new Set(data.characters.items.map((i) => i.id)))
  }, [binding, data])

  useEffect(() => {
    if (!items.length) {
      setSelectedId(null)
      return
    }
    if (selectedId && items.some((i) => i.id === selectedId)) return
    setSelectedId(items[0]?.id ?? null)
  }, [items, selectedId])

  const selectedIdx = items.findIndex((i) => i.id === selectedId)
  const selected = selectedIdx >= 0 ? items[selectedIdx] : null

  const canClearSelected =
    Boolean(selected) && selected != null && !savedIds.has(selected.id)

  const setCharacters = (next: CharactersDoc) => {
    if (!data) return
    setData({ ...data, characters: next })
  }

  const markPersisted = (next: CharactersDoc) => {
    setSavedIds(new Set(next.items.map((i) => i.id)))
  }

  const { phase, markSaved, valueRef } = useDraftAutosave({
    value: characters,
    resetKey: binding?.folderId ?? '',
    enabled: Boolean(binding && data?.characters),
    onSave: async (current) => {
      if (!binding) return
      setErr(null)
      const token = await ensureToken()
      const next = { ...current, updatedAt: nowIso() }
      await saveCharacters(token, binding.folderId, next)
      markPersisted(next)
      if (stripUpdatedAt(valueRef.current) === stripUpdatedAt(current)) {
        setCharacters(next)
        markSaved(next, 'draft')
      }
      setMsg('Черновик сохранён')
    },
  })

  if (!binding || !data || !data.characters) return null

  const updateItem = (idx: number, patch: Partial<Character>) => {
    const nextItems = [...characters.items]
    nextItems[idx] = { ...nextItems[idx], ...patch }
    setCharacters({ ...characters, items: nextItems })
  }

  const createCharacter = () => {
    const item: Character = {
      id: newId('chr'),
      name: 'Новый персонаж',
      description: '',
      caption: '',
      at: nowIso(),
    }
    setCharacters({ ...characters, items: [...characters.items, item] })
    setSelectedId(item.id)
    setErr(null)
  }

  const clearSelected = () => {
    if (!selected || savedIds.has(selected.id)) return
    const nextItems = characters.items.filter((x) => x.id !== selected.id)
    setCharacters({ ...characters, items: nextItems })
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
      const next: CharactersDoc = {
        ...characters,
        items: characters.items.filter((x) => x.id !== selected.id),
        updatedAt: nowIso(),
      }
      await saveCharacters(token, binding.folderId, next)
      setData({ ...data, characters: next })
      markPersisted(next)
      markSaved(next, 'manual')
      setSelectedId(next.items[0]?.id ?? null)
      setMsg('Персонаж удалён')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка удаления')
    }
  }

  const uploadAvatar = async (file: File) => {
    if (selectedIdx < 0) return
    setErr(null)
    setAvatarBusy(true)
    try {
      const token = await ensureToken()
      const media = await ensureMediaFolder(token, binding.folderId)
      const { id, url } = await uploadMediaFile(
        token,
        media.id,
        file,
        file.name,
        file.type || 'image/png',
      )
      updateItem(selectedIdx, { avatarUrl: url, avatarFileId: id })
      setMsg('Аватар загружен')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка загрузки аватара')
    } finally {
      setAvatarBusy(false)
    }
  }

  const clearAvatar = () => {
    if (selectedIdx < 0 || !data) return
    const nextItems = [...characters.items]
    const current = nextItems[selectedIdx]
    const { avatarUrl: _url, avatarFileId: _fileId, ...rest } = current
    nextItems[selectedIdx] = rest
    setCharacters({ ...characters, items: nextItems })
  }

  const save = async () => {
    setErr(null)
    setMsg(null)
    try {
      const token = await ensureToken()
      const next = { ...characters, updatedAt: nowIso() }
      await saveCharacters(token, binding.folderId, next)
      setData({ ...data, characters: next })
      markPersisted(next)
      markSaved(next, 'manual')
      setMsg('Персонажи сохранены')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения')
    }
  }

  const saveBusy = busy || phase === 'saving' || avatarBusy
  const saveLabel =
    phase === 'saving'
      ? 'Сохранение…'
      : phase === 'saved'
        ? 'Сохранено'
        : 'Сохранить'

  return (
    <>
      <MasterDetailList
        items={characters.items}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={createCharacter}
        createLabel="Новый персонаж"
        emptyLabel="Пока нет персонажей"
        renderItemLabel={(id) => {
          const item = characters.items.find((x) => x.id === id)
          const name = item?.name?.trim() || 'Без имени'
          const caption = item?.caption?.trim() ?? ''
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
              <label>Имя</label>
              <input
                value={selected.name}
                onChange={(e) =>
                  updateItem(selectedIdx, { name: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label>Подпись</label>
              <input
                value={selected.caption}
                onChange={(e) =>
                  updateItem(selectedIdx, { caption: e.target.value })
                }
                placeholder="Кратко под именем в списке"
              />
            </div>
            <div className="field">
              <label>Аватар</label>
              <div className="character-avatar-row">
                {selected.avatarUrl ? (
                  <img
                    className="character-avatar-preview"
                    src={selected.avatarUrl}
                    alt=""
                  />
                ) : (
                  <div
                    className="character-avatar-preview is-empty"
                    aria-hidden
                  />
                )}
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn"
                    disabled={avatarBusy || busy}
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    {avatarBusy ? 'Загрузка…' : 'Загрузить'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={!selected.avatarUrl || avatarBusy || busy}
                    onClick={clearAvatar}
                  >
                    Убрать
                  </button>
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) void uploadAvatar(file)
                  }}
                />
              </div>
            </div>
            <div className="field">
              <label>Описание</label>
              <RichTextEditor
                value={selected.description ?? ''}
                onChange={(description) =>
                  updateItem(selectedIdx, { description })
                }
                folderId={binding.folderId}
                getAccessToken={ensureToken}
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
                    ? 'Убрать ещё не сохранённого персонажа'
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
            Выберите персонажа слева или создайте нового.
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
    </>
  )
}
