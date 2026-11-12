import { useEffect, useId, useRef, useState } from 'react'
import type { CabinetData } from '../lib/drive'
import type { OrderItem } from '../schema/province'

const groups = {
  ordinary: { title: 'Приказы', button: 'Экспорт обычных' },
  secret: { title: 'Тайные приказы', button: 'Экспорт тайных' },
  military: { title: 'Военные приказы', button: 'Экспорт военных' },
} as const

type Group = keyof typeof groups
type ExportProps = {
  rows: { turn: number; item: OrderItem }[]
  data: CabinetData
  getToken: () => Promise<string>
}

export function OrderExport({ rows, data, getToken }: ExportProps) {
  const [group, setGroup] = useState<Group | null>(null)
  const secretTurns = new Set(data.orders.filter((pack) => pack.visibility === 'secret').map((pack) => pack.turn))
  const byGroup: Record<Group, typeof rows> = { ordinary: [], secret: [], military: [] }
  for (const row of rows) {
    const secret = row.item.secret || secretTurns.has(row.turn)
    const category = secret ? 'secret' : row.item.military ? 'military' : 'ordinary'
    byGroup[category].push(row)
  }

  return (
    <>
      <div className="btn-row order-export-buttons" aria-label="Экспорт приказов" role="group">
        {(Object.keys(groups) as Group[]).map((key) => (
          <button key={key} type="button" className="btn" disabled={!byGroup[key].length}
            onClick={() => setGroup(key)}>
            {groups[key].button}
          </button>
        ))}
      </div>
      {group && <ExportDialog key={group} title={groups[group].title} rows={byGroup[group]}
        data={data} getToken={getToken} onClose={() => setGroup(null)} />}
    </>
  )
}

function ExportDialog({ title, rows, data, getToken, onClose }: ExportProps & {
  title: string
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useId()
  const [selected, setSelected] = useState(() => new Set(rows.map(({ item }) => item.id)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const chosen = rows.filter(({ item }) => selected.has(item.id))

  useEffect(() => { dialog.current?.showModal() }, [])

  async function download(format: 'docx' | 'pdf') {
    if (busy || !chosen.length) return
    setBusy(true)
    setError('')
    try {
      const { makeOrdersDocx } = await import('../lib/orderDocument')
      let file = await makeOrdersDocx(title, chosen.map(({ item }) => item), data, getToken)
      if (format === 'pdf') {
        const { docxToPdf } = await import('../lib/orderPdf')
        file = await docxToPdf(file)
      }
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = [title, data.meta.provinceName.trim()].filter(Boolean).join(' — ') + '.' + format
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать документ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialog} className="metric-history-dialog" aria-labelledby={heading}
      onCancel={(e) => { if (busy) e.preventDefault() }} onClose={onClose}>
      <div className="metric-history-panel">
        <header className="metric-history-head">
          <h2 id={heading}>{title}</h2>
          <button type="button" className="btn btn-ghost" disabled={busy}
            onClick={() => dialog.current?.close()}>Закрыть</button>
        </header>
        {rows.length > 1 && (
          <div>
            <button type="button" className="btn btn-ghost" disabled={busy}
              onClick={() => setSelected(chosen.length === rows.length ? new Set() : new Set(rows.map(({ item }) => item.id)))}>
              {chosen.length === rows.length ? 'Снять все отметки' : 'Выбрать все'}
            </button>
          </div>
        )}
        <div className="order-export-list" role="group" aria-label="Приказы для экспорта">
          {rows.map(({ item, turn }) => (
            <label key={item.id}>
              <input type="checkbox" checked={selected.has(item.id)} disabled={busy}
                onChange={(e) => {
                  const next = new Set(selected)
                  if (e.target.checked) next.add(item.id)
                  else next.delete(item.id)
                  setSelected(next)
                }} />
              <span>{item.title.trim() || 'Без названия'}</span>
              <small className="muted">Ход {turn}</small>
            </label>
          ))}
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" disabled={busy || !chosen.length}
            onClick={() => void download('docx')}>Скачать Word</button>
          <button type="button" className="btn" disabled={busy || !chosen.length}
            onClick={() => void download('pdf')}>Скачать PDF</button>
        </div>
        {busy && <p className="muted" role="status">Подготовка документа…</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </dialog>
  )
}
