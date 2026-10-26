import { useState } from 'react'
import { useCabinet } from '../cabinet/CabinetProvider'
import { cabinetToExport } from '../lib/drive'
import { MAX_IMPORT_BYTES, parseExportText } from '../schema/export'
import { Onboarding } from './Onboarding'

export function ImportExportPage() {
  const { binding, data, downloadExport, importExport, unbind, busy } = useCabinet()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (!binding) return <Onboarding />

  return (
    <div className="page">
      <div className="panel">
        <h2>Экспорт</h2>
        <p className="muted">
          Формат <code>antaria-export-v1</code> — контракт для ИИ и будущей БД. Скачайте JSON и
          передайте модели или импортируйте позже через API.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!data || busy}
          onClick={() => {
            downloadExport()
            setMsg('Файл экспорта скачан')
          }}
        >
          Скачать antaria-export-v1.json
        </button>
        {data && (
          <pre className="muted" style={{ marginTop: '1rem', fontSize: '0.75rem', overflow: 'auto' }}>
            {JSON.stringify(
              {
                format: cabinetToExport(data).format,
                schemaVersion: cabinetToExport(data).schemaVersion,
                province: cabinetToExport(data).province.provinceName,
                orders: cabinetToExport(data).orders.length,
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
          Лимит {Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} МБ. Файл проходит zod-валидацию, затем
          полностью записывается на Drive.
        </p>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            setErr(null)
            setMsg(null)
            if (file.size > MAX_IMPORT_BYTES) {
              setErr('Файл слишком большой')
              return
            }
            const reader = new FileReader()
            reader.onload = () => {
              void (async () => {
                try {
                  const text = String(reader.result ?? '')
                  const exp = parseExportText(text)
                  await importExport(exp)
                  setMsg(`Импортировано: ${exp.province.provinceName || 'без имени'}`)
                } catch (ex) {
                  setErr(ex instanceof Error ? ex.message : 'Ошибка импорта')
                }
              })()
            }
            reader.readAsText(file)
          }}
        />
        {msg && <p className="ok">{msg}</p>}
        {err && <p className="error">{err}</p>}
      </div>

      <div className="panel">
        <h3>Папка Drive</h3>
        <p className="muted">
          Текущая: {binding.folderName} (<code>{binding.folderId}</code>)
        </p>
        <button type="button" className="btn btn-ghost" onClick={unbind}>
          Отвязать папку
        </button>
      </div>
    </div>
  )
}
