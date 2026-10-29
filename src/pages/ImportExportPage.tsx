import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCabinet } from '../cabinet/CabinetProvider'
import { cabinetToExport } from '../lib/drive'
import type { AntariaExport } from '../schema/export'
import { MAX_IMPORT_BYTES, parseExportText } from '../schema/export'
import { Onboarding } from './Onboarding'

type ImportPhase =
  | { kind: 'idle' }
  | { kind: 'reading'; fileName: string }
  | { kind: 'saving'; fileName: string }
  | {
      kind: 'done'
      fileName: string
      province: string
      summary: {
        orders: number
        verdicts: number
        events: number
        characters: number
        board: number
        ministries: number
        responsibleOthers: number
      }
    }
  | { kind: 'error'; fileName?: string; message: string }

export function ImportExportPage() {
  const { binding, data, downloadExport, importExport, unbind, busy } = useCabinet()
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [importPhase, setImportPhase] = useState<ImportPhase>({ kind: 'idle' })
  const fileRef = useRef<HTMLInputElement>(null)

  if (!binding) return <Onboarding />

  const importing = importPhase.kind === 'reading' || importPhase.kind === 'saving'
  const snapshot = data ? cabinetToExport(data) : null

  const resetImport = () => {
    setImportPhase({ kind: 'idle' })
    if (fileRef.current) fileRef.current.value = ''
  }

  const onPickFile = (file: File) => {
    setExportMsg(null)
    if (file.size > MAX_IMPORT_BYTES) {
      setImportPhase({
        kind: 'error',
        fileName: file.name,
        message: `Файл больше лимита ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} МБ`,
      })
      return
    }
    setImportPhase({ kind: 'reading', fileName: file.name })
    const reader = new FileReader()
    reader.onerror = () =>
      setImportPhase({
        kind: 'error',
        fileName: file.name,
        message: 'Не удалось прочитать файл',
      })
    reader.onload = () => {
      void (async () => {
        try {
          const text = String(reader.result ?? '')
          const exp = parseExportText(text)
          setImportPhase({ kind: 'saving', fileName: file.name })
          await importExport(exp)
          setImportPhase({
            kind: 'done',
            fileName: file.name,
            province: exp.province.provinceName || 'без имени',
            summary: summarize(exp),
          })
          if (fileRef.current) fileRef.current.value = ''
        } catch (ex) {
          setImportPhase({
            kind: 'error',
            fileName: file.name,
            message: ex instanceof Error ? ex.message : 'Ошибка импорта',
          })
        }
      })()
    }
    reader.readAsText(file)
  }

  return (
    <div className="page">
      <div className="panel">
        <h2>Экспорт</h2>
        <p className="muted">
          Формат <code>antaria-export-v1</code>: контракт для ИИ и будущей БД.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!data || busy || importing}
          onClick={() => {
            downloadExport()
            setExportMsg('Файл экспорта скачан на устройство')
          }}
        >
          Скачать antaria-export-v1.json
        </button>
        {exportMsg && <p className="ok">{exportMsg}</p>}
        {snapshot && (
          <pre className="muted" style={{ marginTop: '1rem', fontSize: '0.75rem', overflow: 'auto' }}>
            {JSON.stringify(
              {
                format: snapshot.format,
                schemaVersion: snapshot.schemaVersion,
                province: snapshot.province.provinceName,
                orders: snapshot.orders.length,
                verdicts: snapshot.verdicts.length,
                events: snapshot.events.items.length,
                characters: snapshot.characters.items.length,
                ministries: snapshot.ministries.items.length,
                responsibleOthers: snapshot.responsibleOthers.items.length,
              },
              null,
              2,
            )}
          </pre>
        )}
      </div>

      <div className="panel">
        <h2>Импорт</h2>
        <p className="muted">
          Лимит {Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} МБ. Файл проверяется схемой, затем
          полностью записывается на Drive (заменяет данные кабинета).
        </p>

        {importPhase.kind === 'done' ? (
          <div className="import-result import-result--ok" role="status">
            <p className="import-result__title">Импорт завершён</p>
            <p>
              Провинция <strong>{importPhase.province}</strong> записана на Google Drive.
            </p>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              Файл: {importPhase.fileName}
            </p>
            <ul className="import-result__stats">
              <li>Приказы (ходы): {importPhase.summary.orders}</li>
              <li>Вердикты (ходы): {importPhase.summary.verdicts}</li>
              <li>События: {importPhase.summary.events}</li>
              <li>Персонажи: {importPhase.summary.characters}</li>
              <li>Пункты доски: {importPhase.summary.board}</li>
              <li>Министерства: {importPhase.summary.ministries}</li>
              <li>Ответственные (прочее): {importPhase.summary.responsibleOthers}</li>
            </ul>
            <div className="btn-row">
              <Link className="btn btn-primary" to="/app">
                Открыть дашборд
              </Link>
              <button type="button" className="btn" onClick={resetImport}>
                Импортировать другой файл
              </button>
            </div>
          </div>
        ) : (
          <>
            {(importPhase.kind === 'reading' || importPhase.kind === 'saving') && (
              <div className="import-result import-result--busy" role="status">
                <p className="import-result__title">
                  {importPhase.kind === 'reading' ? 'Чтение файла…' : 'Запись на Drive…'}
                </p>
                <p className="muted">{importPhase.fileName}</p>
              </div>
            )}

            {importPhase.kind === 'error' && (
              <div className="import-result import-result--err" role="alert">
                <p className="import-result__title">Импорт не удался</p>
                <p className="error">{importPhase.message}</p>
                {importPhase.fileName && (
                  <p className="muted" style={{ fontSize: '0.85rem' }}>
                    Файл: {importPhase.fileName}
                  </p>
                )}
                <button type="button" className="btn" onClick={resetImport}>
                  Попробовать снова
                </button>
              </div>
            )}

            {importPhase.kind === 'idle' && (
              <label className={`file-drop ${busy ? 'is-disabled' : ''}`}>
                <span className="btn">Выберите JSON-файл</span>
                <span className="muted">или перетащите сюда antaria-export-v1.json</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  disabled={busy || importing}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) onPickFile(file)
                  }}
                />
              </label>
            )}
          </>
        )}
      </div>

      <div className="panel">
        <h3>Папка Drive</h3>
        <p className="muted">
          Текущая: {binding.folderName} (<code>{binding.folderId}</code>)
        </p>
        <button type="button" className="btn btn-ghost" onClick={unbind} disabled={importing}>
          Отвязать папку
        </button>
      </div>
    </div>
  )
}

function summarize(exp: AntariaExport) {
  return {
    orders: exp.orders.length,
    verdicts: exp.verdicts.length,
    events: exp.events.items.length,
    characters: exp.characters.items.length,
    board: exp.board.items.length,
    ministries: exp.ministries.items.length,
    responsibleOthers: exp.responsibleOthers.items.length,
  }
}
