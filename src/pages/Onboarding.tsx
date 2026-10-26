import { useState } from 'react'
import { useCabinet } from '../cabinet/CabinetProvider'

export function Onboarding() {
  const { createFolder, bindFolder, busy, error, ensureToken } = useCabinet()
  const [folderId, setFolderId] = useState('')
  const [folderName, setFolderName] = useState('Antaria Cabinet')
  const [localError, setLocalError] = useState<string | null>(null)

  return (
    <div className="page">
      <div className="panel">
        <h2>Подключение Google Drive</h2>
        <p className="muted">
          Создайте папку приложения или укажите ID папки, созданной/открытой этим приложением
          (OAuth scope <code>drive.file</code>).
        </p>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              void createFolder().catch((e: unknown) =>
                setLocalError(e instanceof Error ? e.message : 'Ошибка'),
              )
            }
          >
            Создать папку «Antaria Cabinet»
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              void ensureToken().catch((e: unknown) =>
                setLocalError(e instanceof Error ? e.message : 'Нет токена Drive'),
              )
            }
          >
            Обновить токен Drive
          </button>
        </div>
        <div className="stack" style={{ marginTop: '1.25rem' }}>
          <div className="field">
            <label htmlFor="folderName">Имя (для записи)</label>
            <input
              id="folderName"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="folderId">ID папки Drive</label>
            <input
              id="folderId"
              value={folderId}
              onChange={(e) => setFolderId(e.target.value.trim())}
              placeholder="из URL drive.google.com/drive/folders/..."
            />
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy || !folderId}
            onClick={() =>
              void bindFolder(folderId, folderName || 'Antaria Cabinet').catch((e: unknown) =>
                setLocalError(e instanceof Error ? e.message : 'Ошибка'),
              )
            }
          >
            Привязать папку
          </button>
        </div>
        {(error || localError) && <p className="error">{error || localError}</p>}
      </div>
    </div>
  )
}
