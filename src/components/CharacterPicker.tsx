import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Character } from '../schema/province'
import { CharactersDialog } from './CharactersDialog'

function matchesQuery(character: Character, query: string): boolean {
  if (!query) return true
  const q = query.trim().toLowerCase()
  if (!q) return true
  const name = character.name?.toLowerCase() ?? ''
  const caption = character.caption?.toLowerCase() ?? ''
  return name.includes(q) || caption.includes(q)
}

export function CharacterPicker({
  characters,
  value,
  onChange,
  disabled,
}: {
  characters: Character[]
  value: string | undefined
  onChange: (characterId: string | undefined) => void
  disabled?: boolean
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = value
    ? characters.find((c) => c.id === value)
    : undefined
  const missing = Boolean(value) && !selected

  const triggerLabel = selected
    ? selected.caption?.trim()
      ? `${selected.name.trim() || 'Без имени'} · ${selected.caption.trim()}`
      : selected.name.trim() || 'Без имени'
    : missing
      ? 'Не найден'
      : 'Не выбран'

  const filtered = useMemo(
    () => characters.filter((c) => matchesQuery(c, query)),
    [characters, query],
  )

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      queueMicrotask(() => searchRef.current?.focus())
    }
  }, [open])

  return (
    <div className="entity-picker-row">
      <div className="metric-picker entity-picker" ref={rootRef}>
        <button
          type="button"
          className="btn metric-picker-trigger entity-picker-trigger"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setOpen(true)
            }
            if (e.key === 'Escape') setOpen(false)
          }}
        >
          <span className="entity-picker-trigger-main">
            {selected?.avatarUrl ? (
              <img
                className="entity-picker-avatar"
                src={selected.avatarUrl}
                alt=""
              />
            ) : (
              <span className="entity-picker-avatar is-empty" aria-hidden />
            )}
            <span
              className={
                missing ? 'entity-picker-label muted' : 'entity-picker-label'
              }
            >
              {triggerLabel}
            </span>
          </span>
          <span className="metric-picker-chevron" aria-hidden />
        </button>
        {open ? (
          <div className="metric-picker-list entity-picker-dropdown">
            <input
              ref={searchRef}
              type="search"
              className="entity-picker-search"
              value={query}
              placeholder="Поиск по имени или подписи"
              aria-label="Поиск персонажа"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setOpen(false)
                }
              }}
            />
            <ul id={listId} role="listbox" aria-label="Персонажи">
              <li role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={!value}
                  className={
                    !value
                      ? 'metric-picker-option is-selected'
                      : 'metric-picker-option'
                  }
                  onClick={() => {
                    onChange(undefined)
                    setOpen(false)
                  }}
                >
                  Не выбран
                </button>
              </li>
              {filtered.length === 0 ? (
                <li className="muted entity-picker-empty" role="presentation">
                  Никого не найдено
                </li>
              ) : (
                filtered.map((c) => {
                  const selectedOpt = c.id === value
                  const name = c.name?.trim() || 'Без имени'
                  const caption = c.caption?.trim() ?? ''
                  return (
                    <li key={c.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={selectedOpt}
                        className={
                          selectedOpt
                            ? 'metric-picker-option is-selected entity-picker-option'
                            : 'metric-picker-option entity-picker-option'
                        }
                        onClick={() => {
                          onChange(c.id)
                          setOpen(false)
                        }}
                      >
                        {c.avatarUrl ? (
                          <img
                            className="entity-picker-avatar"
                            src={c.avatarUrl}
                            alt=""
                          />
                        ) : (
                          <span
                            className="entity-picker-avatar is-empty"
                            aria-hidden
                          />
                        )}
                        <span className="master-detail-text">
                          <span className="master-detail-label">{name}</span>
                          {caption ? (
                            <span className="master-detail-caption muted">
                              {caption}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="btn entity-picker-more"
        disabled={disabled}
        aria-label="Персонажи"
        aria-haspopup="dialog"
        aria-expanded={dialogOpen}
        onClick={() => {
          setOpen(false)
          setDialogOpen(true)
        }}
      >
        ...
      </button>
      <CharactersDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  )
}
