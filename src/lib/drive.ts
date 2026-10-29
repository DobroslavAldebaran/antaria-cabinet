import {
  AntariaMetaSchema,
  BoardSchema,
  emptyBoard,
  emptyEvents,
  emptyIndicators,
  emptyMeta,
  emptyMilitary,
  emptyProfile,
  EventsSchema,
  IndicatorsSchema,
  MilitarySchema,
  nowIso,
  OrdersTurnSchema,
  ProfileSchema,
  VerdictTurnSchema,
  type AntariaMeta,
  type Board,
  type EventsDoc,
  type Indicators,
  type Military,
  type OrdersTurn,
  type Profile,
  type VerdictTurn,
} from '../schema/province'
import { normalizeIndicators } from '../schema/metrics'
import type { AntariaExport } from '../schema/export'
import { EXPORT_FORMAT } from '../schema/export'
import { SCHEMA_VERSION } from '../schema/province'

const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

type DriveFile = { id: string; name: string; mimeType?: string }

async function driveFetch(
  accessToken: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  const res = await fetch(url, { ...init, headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Drive API ${res.status}: ${body.slice(0, 300)}`)
  }
  return res
}

export async function createCabinetFolder(
  accessToken: string,
  name = 'Antaria Cabinet',
): Promise<DriveFile> {
  const res = await driveFetch(accessToken, `${DRIVE_FILES}?fields=id,name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })
  return res.json() as Promise<DriveFile>
}

export async function createSubfolder(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<DriveFile> {
  const res = await driveFetch(accessToken, `${DRIVE_FILES}?fields=id,name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  })
  return res.json() as Promise<DriveFile>
}

export async function listChildren(
  accessToken: string,
  folderId: string,
): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`)
  const res = await driveFetch(
    accessToken,
    `${DRIVE_FILES}?q=${q}&fields=files(id,name,mimeType)&pageSize=200`,
  )
  const data = (await res.json()) as { files?: DriveFile[] }
  return data.files ?? []
}

async function findChild(
  accessToken: string,
  folderId: string,
  name: string,
): Promise<DriveFile | undefined> {
  const files = await listChildren(accessToken, folderId)
  return files.find((f) => f.name === name)
}

export async function readJsonFile<T>(
  accessToken: string,
  fileId: string,
): Promise<T> {
  const res = await driveFetch(
    accessToken,
    `${DRIVE_FILES}/${fileId}?alt=media`,
  )
  return res.json() as Promise<T>
}

export async function writeJsonFile(
  accessToken: string,
  folderId: string,
  name: string,
  data: unknown,
  existingId?: string,
): Promise<string> {
  const body = JSON.stringify(data, null, 2)
  if (existingId) {
    await driveFetch(
      accessToken,
      `${DRIVE_UPLOAD}/${existingId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
    )
    return existingId
  }
  const metadata = {
    name,
    parents: [folderId],
    mimeType: 'application/json',
  }
  const boundary = 'antaria_boundary'
  const multipart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${body}\r\n` +
    `--${boundary}--`
  const res = await driveFetch(
    accessToken,
    `${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    },
  )
  const file = (await res.json()) as DriveFile
  return file.id
}

const MEDIA_MAX_BYTES = 5 * 1024 * 1024

export async function ensureMediaFolder(
  accessToken: string,
  cabinetFolderId: string,
): Promise<DriveFile> {
  const existing = await findChild(accessToken, cabinetFolderId, 'media')
  if (existing) return existing
  return createSubfolder(accessToken, cabinetFolderId, 'media')
}

export async function setAnyoneReader(
  accessToken: string,
  fileId: string,
): Promise<void> {
  await driveFetch(accessToken, `${DRIVE_FILES}/${fileId}/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone',
    }),
  })
}

/** Hotlinkable URL for TipTap img src after anyone-reader permission. */
export function mediaPublicUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=view&id=${fileId}`
}

export async function uploadMediaFile(
  accessToken: string,
  mediaFolderId: string,
  blob: Blob,
  name: string,
  mime: string,
): Promise<{ id: string; url: string }> {
  if (!mime.startsWith('image/')) {
    throw new Error('Можно загружать только изображения')
  }
  if (blob.size > MEDIA_MAX_BYTES) {
    throw new Error('Файл больше 5 МБ')
  }

  const safeName = name.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'image'
  const metadata = {
    name: safeName,
    parents: [mediaFolderId],
    mimeType: mime,
  }
  const boundary = 'antaria_media_boundary'
  const metaPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n`
  const binHeader =
    `--${boundary}\r\n` + `Content-Type: ${mime}\r\n\r\n`
  const footer = `\r\n--${boundary}--`
  const body = new Blob([metaPart, binHeader, blob, footer])

  const res = await driveFetch(
    accessToken,
    `${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  )
  const file = (await res.json()) as DriveFile
  await setAnyoneReader(accessToken, file.id)
  return { id: file.id, url: mediaPublicUrl(file.id) }
}

async function upsertJson<T>(
  accessToken: string,
  folderId: string,
  name: string,
  data: T,
): Promise<void> {
  const existing = await findChild(accessToken, folderId, name)
  await writeJsonFile(accessToken, folderId, name, data, existing?.id)
}

async function readOrDefault<T>(
  accessToken: string,
  folderId: string,
  name: string,
  parse: (raw: unknown) => T,
  fallback: () => T,
): Promise<T> {
  const existing = await findChild(accessToken, folderId, name)
  if (!existing) return fallback()
  try {
    const raw = await readJsonFile<unknown>(accessToken, existing.id)
    return parse(raw)
  } catch {
    return fallback()
  }
}

/** Создаёт только отсутствующие файлы; существующие не перезаписывает. */
export async function initCabinetFolder(
  accessToken: string,
  folderId: string,
): Promise<void> {
  const ensure = async (name: string, data: unknown) => {
    const existing = await findChild(accessToken, folderId, name)
    if (existing) return
    await writeJsonFile(accessToken, folderId, name, data)
  }
  const meta = emptyMeta()
  meta.updatedAt = nowIso()
  await ensure('antaria.json', meta)
  await ensure('profile.json', emptyProfile())
  await ensure('indicators.json', emptyIndicators())
  await ensure('board.json', emptyBoard())
  await ensure('military.json', emptyMilitary())
  await ensure('events.json', emptyEvents())
  const orders = await findChild(accessToken, folderId, 'orders')
  if (!orders) {
    await createSubfolder(accessToken, folderId, 'orders')
  }
  const verdicts = await findChild(accessToken, folderId, 'verdicts')
  if (!verdicts) {
    await createSubfolder(accessToken, folderId, 'verdicts')
  }
}

export type CabinetData = {
  meta: AntariaMeta
  profile: Profile
  indicators: Indicators
  board: Board
  military: Military
  orders: OrdersTurn[]
  verdicts: VerdictTurn[]
  events: EventsDoc
}

export async function loadCabinet(
  accessToken: string,
  folderId: string,
): Promise<CabinetData> {
  const meta = await readOrDefault(
    accessToken,
    folderId,
    'antaria.json',
    (r) => AntariaMetaSchema.parse(r),
    emptyMeta,
  )
  const profile = await readOrDefault(
    accessToken,
    folderId,
    'profile.json',
    (r) => ProfileSchema.parse(r),
    emptyProfile,
  )
  const indicators = normalizeIndicators(
    await readOrDefault(
      accessToken,
      folderId,
      'indicators.json',
      (r) => IndicatorsSchema.parse(r),
      () => emptyIndicators(meta.currentTurn),
    ),
  )
  const board = await readOrDefault(
    accessToken,
    folderId,
    'board.json',
    (r) => BoardSchema.parse(r),
    emptyBoard,
  )
  const military = await readOrDefault(
    accessToken,
    folderId,
    'military.json',
    (r) => MilitarySchema.parse(r),
    emptyMilitary,
  )

  let ordersFolder = await findChild(accessToken, folderId, 'orders')
  if (!ordersFolder) {
    ordersFolder = await createSubfolder(accessToken, folderId, 'orders')
  }
  const orderFiles = await listChildren(accessToken, ordersFolder.id)
  const orders: OrdersTurn[] = []
  for (const f of orderFiles.filter((x) => x.name.endsWith('.json'))) {
    try {
      const raw = await readJsonFile<unknown>(accessToken, f.id)
      orders.push(OrdersTurnSchema.parse(raw))
    } catch {
      /* skip invalid */
    }
  }
  orders.sort((a, b) => b.turn - a.turn)

  let verdictsFolder = await findChild(accessToken, folderId, 'verdicts')
  if (!verdictsFolder) {
    verdictsFolder = await createSubfolder(accessToken, folderId, 'verdicts')
  }
  const verdictFiles = await listChildren(accessToken, verdictsFolder.id)
  const verdicts: VerdictTurn[] = []
  for (const f of verdictFiles.filter((x) => x.name.endsWith('.json'))) {
    try {
      const raw = await readJsonFile<unknown>(accessToken, f.id)
      verdicts.push(VerdictTurnSchema.parse(raw))
    } catch {
      /* skip invalid */
    }
  }
  verdicts.sort((a, b) => b.turn - a.turn)

  const events = await readOrDefault(
    accessToken,
    folderId,
    'events.json',
    (r) => EventsSchema.parse(r),
    emptyEvents,
  )

  return {
    meta,
    profile,
    indicators,
    board,
    military,
    orders,
    verdicts,
    events,
  }
}

export async function saveMeta(
  accessToken: string,
  folderId: string,
  meta: AntariaMeta,
): Promise<void> {
  await upsertJson(accessToken, folderId, 'antaria.json', {
    ...meta,
    updatedAt: nowIso(),
  })
}

export async function saveProfile(
  accessToken: string,
  folderId: string,
  profile: Profile,
): Promise<void> {
  await upsertJson(accessToken, folderId, 'profile.json', {
    ...profile,
    updatedAt: nowIso(),
  })
}

export async function saveIndicators(
  accessToken: string,
  folderId: string,
  indicators: Indicators,
): Promise<void> {
  const next = normalizeIndicators({
    ...indicators,
    updatedAt: nowIso(),
  })
  await upsertJson(accessToken, folderId, 'indicators.json', next)
}

export async function saveBoard(
  accessToken: string,
  folderId: string,
  board: Board,
): Promise<void> {
  await upsertJson(accessToken, folderId, 'board.json', {
    ...board,
    updatedAt: nowIso(),
  })
}

export async function saveMilitary(
  accessToken: string,
  folderId: string,
  military: Military,
): Promise<void> {
  await upsertJson(accessToken, folderId, 'military.json', {
    ...military,
    updatedAt: nowIso(),
  })
}

export async function saveOrdersTurn(
  accessToken: string,
  folderId: string,
  turn: OrdersTurn,
): Promise<void> {
  let ordersFolder = await findChild(accessToken, folderId, 'orders')
  if (!ordersFolder) {
    ordersFolder = await createSubfolder(accessToken, folderId, 'orders')
  }
  const name = `turn-${String(turn.turn).padStart(2, '0')}.json`
  const existing = await findChild(accessToken, ordersFolder.id, name)
  await writeJsonFile(
    accessToken,
    ordersFolder.id,
    name,
    { ...turn, updatedAt: nowIso() },
    existing?.id,
  )
}

/** Write every pack and trash turn files that disappeared from the list. */
export async function saveAllOrdersTurns(
  accessToken: string,
  folderId: string,
  next: OrdersTurn[],
  previousTurns: number[],
): Promise<void> {
  const keep = new Set(next.map((pack) => pack.turn))
  for (const pack of next) {
    await saveOrdersTurn(accessToken, folderId, pack)
  }
  for (const turn of previousTurns) {
    if (!keep.has(turn)) {
      await deleteOrdersTurn(accessToken, folderId, turn)
    }
  }
}

export async function saveVerdictTurn(
  accessToken: string,
  folderId: string,
  turn: VerdictTurn,
): Promise<void> {
  let verdictsFolder = await findChild(accessToken, folderId, 'verdicts')
  if (!verdictsFolder) {
    verdictsFolder = await createSubfolder(accessToken, folderId, 'verdicts')
  }
  const name = `turn-${String(turn.turn).padStart(2, '0')}.json`
  const existing = await findChild(accessToken, verdictsFolder.id, name)
  await writeJsonFile(
    accessToken,
    verdictsFolder.id,
    name,
    { ...turn, updatedAt: nowIso() },
    existing?.id,
  )
}

async function trashFile(
  accessToken: string,
  fileId: string,
): Promise<void> {
  await driveFetch(accessToken, `${DRIVE_FILES}/${fileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
}

export async function deleteOrdersTurn(
  accessToken: string,
  folderId: string,
  turn: number,
): Promise<void> {
  const ordersFolder = await findChild(accessToken, folderId, 'orders')
  if (!ordersFolder) return
  const name = `turn-${String(turn).padStart(2, '0')}.json`
  const existing = await findChild(accessToken, ordersFolder.id, name)
  if (existing) await trashFile(accessToken, existing.id)
}

export async function deleteVerdictTurn(
  accessToken: string,
  folderId: string,
  turn: number,
): Promise<void> {
  const verdictsFolder = await findChild(accessToken, folderId, 'verdicts')
  if (!verdictsFolder) return
  const name = `turn-${String(turn).padStart(2, '0')}.json`
  const existing = await findChild(accessToken, verdictsFolder.id, name)
  if (existing) await trashFile(accessToken, existing.id)
}

export async function saveEvents(
  accessToken: string,
  folderId: string,
  events: EventsDoc,
): Promise<void> {
  await upsertJson(accessToken, folderId, 'events.json', {
    ...events,
    updatedAt: nowIso(),
  })
}

export function cabinetToExport(data: CabinetData): AntariaExport {
  return {
    format: EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    app: 'antaria-cabinet',
    province: data.meta,
    profile: data.profile,
    indicators: normalizeIndicators(data.indicators),
    board: data.board,
    orders: data.orders,
    verdicts: data.verdicts,
    events: data.events,
    military: data.military,
  }
}

export async function writeExportToDrive(
  accessToken: string,
  folderId: string,
  data: CabinetData,
): Promise<void> {
  const exp = cabinetToExport(data)
  await saveMeta(accessToken, folderId, exp.province)
  await saveProfile(accessToken, folderId, exp.profile)
  await saveIndicators(accessToken, folderId, exp.indicators)
  await saveBoard(accessToken, folderId, exp.board)
  await saveMilitary(accessToken, folderId, exp.military)
  await saveEvents(accessToken, folderId, exp.events)
  for (const turn of exp.orders) {
    await saveOrdersTurn(accessToken, folderId, turn)
  }
  for (const turn of exp.verdicts) {
    await saveVerdictTurn(accessToken, folderId, turn)
  }
}
