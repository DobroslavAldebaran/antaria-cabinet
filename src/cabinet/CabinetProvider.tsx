import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  cabinetToExport,
  createCabinetFolder,
  initCabinetFolder,
  loadCabinet,
  writeExportToDrive,
  type CabinetData,
} from '../lib/drive'
import {
  clearFolderBinding,
  loadFolderBinding,
  saveFolderBinding,
  type FolderBinding,
} from '../lib/folderStorage'
import type { AntariaExport } from '../schema/export'
import { parseExportJson } from '../schema/export'
import { normalizeIndicators } from '../schema/metrics'
import { writeAudit } from '../lib/registry'

type CabinetContextValue = {
  binding: FolderBinding | null
  data: CabinetData | null
  busy: boolean
  error: string | null
  ensureToken: () => Promise<string>
  createFolder: () => Promise<void>
  bindFolder: (folderId: string, folderName: string) => Promise<void>
  reload: () => Promise<void>
  setData: (data: CabinetData) => void
  persistExport: (exp: AntariaExport) => Promise<void>
  downloadExport: () => void
  importExport: (exp: AntariaExport) => Promise<void>
  unbind: () => void
}

const CabinetContext = createContext<CabinetContextValue | null>(null)

export function CabinetProvider({ children }: { children: ReactNode }) {
  const { user, accessToken, refreshDriveToken, profile } = useAuth()
  const [binding, setBinding] = useState<FolderBinding | null>(null)
  const [data, setData] = useState<CabinetData | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedUid, setLoadedUid] = useState<string | null>(null)

  const ensureToken = useCallback(async () => {
    if (accessToken) return accessToken
    return refreshDriveToken()
  }, [accessToken, refreshDriveToken])

  const reload = useCallback(async () => {
    if (!user) return
    const b = loadFolderBinding(user.uid)
    setBinding(b)
    if (!b) {
      setData(null)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const token = await ensureToken()
      const cabinet = await loadCabinet(token, b.folderId)
      setData(cabinet)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки Drive')
    } finally {
      setBusy(false)
    }
  }, [user, ensureToken])

  useEffect(() => {
    if (!user || profile?.status !== 'approved') {
      setBinding(null)
      setData(null)
      setLoadedUid(null)
      return
    }
    if (loadedUid === user.uid) return
    setLoadedUid(user.uid)
    void reload()
  }, [user, profile?.status, loadedUid, reload])

  const createFolder = useCallback(async () => {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      const token = await ensureToken()
      const folder = await createCabinetFolder(token)
      await initCabinetFolder(token, folder.id)
      const next = { folderId: folder.id, folderName: folder.name }
      saveFolderBinding(user.uid, next)
      setBinding(next)
      setData(await loadCabinet(token, folder.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать папку')
      throw e
    } finally {
      setBusy(false)
    }
  }, [user, ensureToken])

  const bindFolder = useCallback(
    async (folderId: string, folderName: string) => {
      if (!user) return
      setBusy(true)
      setError(null)
      try {
        const token = await ensureToken()
        await initCabinetFolder(token, folderId)
        const next = { folderId, folderName }
        saveFolderBinding(user.uid, next)
        setBinding(next)
        setData(await loadCabinet(token, folderId))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось привязать папку')
        throw e
      } finally {
        setBusy(false)
      }
    },
    [user, ensureToken],
  )

  const persistExport = useCallback(
    async (exp: AntariaExport) => {
      if (!user || !binding) throw new Error('Нет папки Drive')
      const token = await ensureToken()
      const cabinet: CabinetData = {
        meta: exp.province,
        profile: exp.profile,
        indicators: normalizeIndicators(exp.indicators),
        board: exp.board,
        military: exp.military,
        orders: exp.orders,
        verdicts: exp.verdicts,
        events: exp.events,
        characters: exp.characters,
      }
      await writeExportToDrive(token, binding.folderId, cabinet)
      setData(cabinet)
    },
    [user, binding, ensureToken],
  )

  const downloadExport = useCallback(() => {
    if (!data || !user) return
    const exp = cabinetToExport(data)
    const blob = new Blob([JSON.stringify(exp, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `antaria-export-v1-${exp.province.provinceName || 'cabinet'}.json`
    a.click()
    URL.revokeObjectURL(url)
    void writeAudit({
      type: 'export',
      actorUid: user.uid,
      createdAt: new Date().toISOString(),
    })
  }, [data, user])

  const importExport = useCallback(
    async (exp: AntariaExport) => {
      if (!user || !binding) throw new Error('Нет папки Drive')
      const parsed = parseExportJson(exp)
      await persistExport(parsed)
      void writeAudit({
        type: 'import',
        actorUid: user.uid,
        createdAt: new Date().toISOString(),
        detail: parsed.province.provinceName,
      })
    },
    [user, binding, persistExport],
  )

  const unbind = useCallback(() => {
    if (!user) return
    clearFolderBinding(user.uid)
    setBinding(null)
    setData(null)
  }, [user])

  const value = useMemo(
    () => ({
      binding,
      data,
      busy,
      error,
      ensureToken,
      createFolder,
      bindFolder,
      reload,
      setData,
      persistExport,
      downloadExport,
      importExport,
      unbind,
    }),
    [
      binding,
      data,
      busy,
      error,
      ensureToken,
      createFolder,
      bindFolder,
      reload,
      persistExport,
      downloadExport,
      importExport,
      unbind,
    ],
  )

  return (
    <CabinetContext.Provider value={value}>{children}</CabinetContext.Provider>
  )
}

export function useCabinet(): CabinetContextValue {
  const ctx = useContext(CabinetContext)
  if (!ctx) throw new Error('useCabinet вне CabinetProvider')
  return ctx
}
