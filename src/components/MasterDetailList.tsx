import type { ReactNode } from 'react'

export function MasterDetailList({
  items,
  selectedId,
  onSelect,
  onCreate,
  createLabel,
  emptyLabel,
  renderItemLabel,
  children,
}: {
  items: { id: string }[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  createLabel: string
  emptyLabel?: string
  renderItemLabel: (id: string) => ReactNode
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
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={
                      selected
                        ? 'master-detail-item is-selected'
                        : 'master-detail-item'
                    }
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
