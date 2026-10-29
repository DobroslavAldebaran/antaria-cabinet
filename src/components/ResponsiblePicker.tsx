import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  buildResponsibleOptions,
  filterResponsibleOptions,
  findOtherByName,
  resolveResponsibleLabel,
  type ResponsibleOption,
} from '../schema/responsible'
import {
  emptyResponsibleOthers,
  newId,
  nowIso,
  type Character,
  type Ministry,
  type ResponsibleOthersDoc,
} from '../schema/province'

function depthClass(depth: number): string {
  if (depth <= 0) return ''
  return `is-child depth-${Math.min(depth, 6)}`
}

export function ResponsiblePicker({
  ministries,
  characters,
  others,
  value,
  onChange,
  onOthersChange,
  disabled,
}: {
  ministries: Ministry[]
  characters: Character[]
  others: ResponsibleOthersDoc
  value: string | undefined
  onChange: (responsibleId: string | undefined) => void
  onOthersChange: (next: ResponsibleOthersDoc) => void
  disabled?: boolean
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const options = useMemo(
    () =>
      buildResponsibleOptions(ministries, characters, others.items ?? []),
    [ministries, characters, others.items],
  )

  const filtered = useMemo(
    () => filterResponsibleOptions(options, query),
    [options, query],
  )

  const resolved = resolveResponsibleLabel(
    value,
    ministries,
    characters,
    others.items ?? [],
  )

  const trimmedQuery = query.trim()
  const exactMatch = useMemo(() => {
    if (!trimmedQuery) return false
    const q = trimmedQuery.toLowerCase()
    return options.some(
      (o) =>
        o.kind !== 'header' &&
        o.label.toLowerCase() === q,
    )
  }, [options, trimmedQuery])

  const canAdd = Boolean(trimmedQuery) && !exactMatch

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

  const selectOption = (option: ResponsibleOption) => {
    if (option.kind === 'header') return
    onChange(option.id)
    setOpen(false)
  }

  const addOther = () => {
    const name = trimmedQuery
    if (!name) return
    const existing = findOtherByName(others.items ?? [], name)
    if (existing) {
      onChange(existing.id)
      setOpen(false)
      return
    }
    const item = {
      id: newId('oth'),
      name,
      at: nowIso(),
    }
    const base = others.items ? others : emptyResponsibleOthers()
    const next: ResponsibleOthersDoc = {
      ...base,
      schemaVersion: base.schemaVersion,
      items: [...(base.items ?? []), item],
      updatedAt: nowIso(),
    }
    onOthersChange(next)
    onChange(item.id)
    setOpen(false)
  }

  return (
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
        <span
          className={
            resolved.missing ? 'entity-picker-label muted' : 'entity-picker-label'
          }
        >
          {resolved.label}
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
            placeholder="Поиск или новое значение"
            aria-label="Поиск ответственного"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                setOpen(false)
              }
              if (e.key === 'Enter' && canAdd) {
                e.preventDefault()
                addOther()
              }
            }}
          />
          <ul id={listId} role="listbox" aria-label="Ответственный">
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
            {filtered.length === 0 && !canAdd ? (
              <li className="muted entity-picker-empty" role="presentation">
                Ничего не найдено
              </li>
            ) : (
              filtered.map((option, index) => {
                if (option.kind === 'header') {
                  return (
                    <li
                      key={`header-${option.label}-${index}`}
                      className="entity-picker-section"
                      role="presentation"
                    >
                      {option.label}
                    </li>
                  )
                }
                const selectedOpt = option.id === value
                const nest = depthClass(option.depth)
                const className = [
                  'metric-picker-option',
                  'entity-picker-option',
                  selectedOpt ? 'is-selected' : '',
                  nest,
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <li
                    key={`${option.kind}-${option.id}-${index}`}
                    role="presentation"
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedOpt}
                      className={className}
                      onClick={() => selectOption(option)}
                    >
                      {option.kind === 'character' ? (
                        option.avatarUrl ? (
                          <img
                            className="entity-picker-avatar"
                            src={option.avatarUrl}
                            alt=""
                          />
                        ) : (
                          <span
                            className="entity-picker-avatar is-empty"
                            aria-hidden
                          />
                        )
                      ) : null}
                      <span className="master-detail-text">
                        <span className="master-detail-label">
                          {option.label}
                        </span>
                        {option.kind === 'character' && option.caption ? (
                          <span className="master-detail-caption muted">
                            {option.caption}
                          </span>
                        ) : null}
                        {option.kind === 'ministry' ? (
                          <span className="master-detail-caption muted">
                            Министерство
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                )
              })
            )}
            {canAdd ? (
              <li role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="metric-picker-option"
                  onClick={addOther}
                >
                  Добавить «{trimmedQuery}»
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
