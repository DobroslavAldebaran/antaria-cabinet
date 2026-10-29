import type { ReactNode } from 'react'

export function MasterDetailList({
  items,
  selectedId,
  onSelect,
  onCreate,
  createLabel,
  emptyLabel,
  renderItemLabel,
  getItemClassName,
  children,
}: {
  items: { id: string }[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  createLabel: string
  emptyLabel?: string
  renderItemLabel: (id: string) => ReactNode
  getItemClassName?: (id: string) => string | undefined
  children: ReactNode
}) {
  return (
    <div className="master-detail">
      <aside className="master-detail-list" aria-label="Список">
        <button type="button" className="btn master-detail-new" onClick={onCreate}>
          {createLabel}
        </button>
        {items.length === 0 ? (
          <p className="muted master-detail-empty">{emptyLabel ?? 'Пока пусто'}</p>
        ) : (
          <ul className="master-detail-items">
            {items.map((item) => {
              const selected = item.id === selectedId
              const extra = getItemClassName?.(item.id)
              const className = [
                'master-detail-item',
                selected ? 'is-selected' : '',
                extra ?? '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={className}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => onSelect(item.id)}
                  >
                    {renderItemLabel(item.id)}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </aside>
      <section className="master-detail-editor" aria-live="polite">
        {children}
      </section>
    </div>
  )
}
