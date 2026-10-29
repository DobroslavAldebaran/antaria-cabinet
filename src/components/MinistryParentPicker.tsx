import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Ministry } from '../schema/province'

export function MinistryParentPicker({
  ministries,
  currentId,
  value,
  onChange,
  disabled,
}: {
  ministries: Ministry[]
  currentId: string
  value: string | undefined
  onChange: (parentId: string | undefined) => void
  disabled?: boolean
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const blocked = useMemo(() => {
    const ids = new Set<string>([currentId])
    let grew = true
    while (grew) {
      grew = false
      for (const m of ministries) {
        if (m.parentId && ids.has(m.parentId) && !ids.has(m.id)) {
          ids.add(m.id)
          grew = true
        }
      }
    }
    return ids
  }, [ministries, currentId])

  const options = useMemo(
    () => ministries.filter((m) => !blocked.has(m.id)),
    [ministries, blocked],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((m) => (m.name?.toLowerCase() ?? '').includes(q))
  }, [options, query])

  const selected = value ? ministries.find((m) => m.id === value) : undefined
  const missing = Boolean(value) && !selected
  const triggerLabel = selected
    ? selected.name.trim() || 'Без названия'
    : missing
      ? 'Не найдено'
      : 'Нет'

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
    <div className="metric-picker entity-picker" ref={rootRef}>
      <button
        type="button"
        className="btn metric-picker-trigger"
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
        <span className={missing ? 'muted' : undefined}>{triggerLabel}</span>
        <span className="metric-picker-chevron" aria-hidden />
      </button>
      {open ? (
        <div className="metric-picker-list entity-picker-dropdown">
          <input
            ref={searchRef}
            type="search"
            className="entity-picker-search"
            value={query}
            placeholder="Поиск министерства"
            aria-label="Поиск основного министерства"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                setOpen(false)
              }
            }}
          />
          <ul id={listId} role="listbox" aria-label="Основное министерство">
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
                Нет
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="muted entity-picker-empty" role="presentation">
                Нет вариантов
              </li>
            ) : (
              filtered.map((m) => {
                const selectedOpt = m.id === value
                return (
                  <li key={m.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedOpt}
                      className={
                        selectedOpt
                          ? 'metric-picker-option is-selected'
                          : 'metric-picker-option'
                      }
                      onClick={() => {
                        onChange(m.id)
                        setOpen(false)
                      }}
                    >
                      {m.name.trim() || 'Без названия'}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
