import { useEffect, useId, useRef } from 'react'
import { CharactersPanel } from './CharactersPanel'

export function CharactersDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open) {
      if (!el.open) el.showModal()
    } else if (el.open) {
      el.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="metric-history-dialog characters-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
    >
      <div className="characters-dialog-panel">
        <header className="metric-history-head">
          <h2 id={titleId}>Персонажи</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Закрыть
          </button>
        </header>
        <p className="muted characters-dialog-lead">
          Создайте или отредактируйте персонажа. Изменения пишутся на Drive
          автоматически.
        </p>
        {open ? <CharactersPanel /> : null}
      </div>
    </dialog>
  )
}
