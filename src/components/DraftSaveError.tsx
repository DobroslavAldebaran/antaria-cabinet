export function DraftSaveError({ error, onRetry }: {
  error: string | null
  onRetry: () => void
}) {
  if (!error) return null
  return (
    <div role="alert">
      <p className="error">Не удалось сохранить черновик на Drive: {error}</p>
      <button type="button" className="btn btn-ghost" onClick={onRetry}>
        Повторить сохранение
      </button>
    </div>
  )
}
