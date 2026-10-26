import {
  AntariaMetaSchema,
  BoardSchema,
  emptyBoard,
  emptyIndicators,
  emptyMaps,
  emptyMeta,
  emptyMilitary,
  emptyNews,
  emptyProfile,
  emptyRelations,
  IndicatorsSchema,
  MapsSchema,
  MilitarySchema,
  NewsLocalSchema,
  nowIso,
  OrdersTurnSchema,
  ProfileSchema,
  RelationsSchema,
  type AntariaMeta,
  type Board,
  type Indicators,
  type Maps,
  type Military,
  type NewsLocal,
  type OrdersTurn,
  type Profile,
  type Relations,
} from '../schema/province'
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

export async function initCabinetFolder(
  accessToken: string,
  folderId: string,
): Promise<void> {
  const meta = emptyMeta()
  meta.updatedAt = nowIso()
  await upsertJson(accessToken, folderId, 'antaria.json', meta)
  await upsertJson(accessToken, folderId, 'profile.json', emptyProfile())
  await upsertJson(accessToken, folderId, 'indicators.json', emptyIndicators())
  await upsertJson(accessToken, folderId, 'board.json', emptyBoard())
  await upsertJson(accessToken, folderId, 'relations.json', emptyRelations())
  await upsertJson(accessToken, folderId, 'news-local.json', emptyNews())
  await upsertJson(accessToken, folderId, 'maps.json', emptyMaps())
  await upsertJson(accessToken, folderId, 'military.json', emptyMilitary())
  const orders = await findChild(accessToken, folderId, 'orders')
  if (!orders) {
    await createSubfolder(accessToken, folderId, 'orders')
  }
}

export type CabinetData = {
  meta: AntariaMeta
  profile: Profile
  indicators: Indicators
  board: Board
  relations: Relations
  news: NewsLocal
  maps: Maps
  military: Military
  orders: OrdersTurn[]
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
  const indicators = await readOrDefault(
    accessToken,
    folderId,
    'indicators.json',
    (r) => IndicatorsSchema.parse(r),
    () => emptyIndicators(meta.currentTurn),
  )
  const board = await readOrDefault(
    accessToken,
    folderId,
    'board.json',
    (r) => BoardSchema.parse(r),
    emptyBoard,
  )
  const relations = await readOrDefault(
    accessToken,
    folderId,
    'relations.json',
    (r) => RelationsSchema.parse(r),
    emptyRelations,
  )
  const news = await readOrDefault(
    accessToken,
    folderId,
    'news-local.json',
    (r) => NewsLocalSchema.parse(r),
    emptyNews,
  )
  const maps = await readOrDefault(
    accessToken,
    folderId,
    'maps.json',
    (r) => MapsSchema.parse(r),
    emptyMaps,
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

  return { meta, profile, indicators, board, relations, news, maps, military, orders }
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
  await upsertJson(accessToken, folderId, 'indicators.json', {
    ...indicators,
    updatedAt: nowIso(),
  })
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

export async function saveRelations(
  accessToken: string,
  folderId: string,
  relations: Relations,
): Promise<void> {
  await upsertJson(accessToken, folderId, 'relations.json', {
    ...relations,
    updatedAt: nowIso(),
  })
}

export async function saveNews(
  accessToken: string,
  folderId: string,
  news: NewsLocal,
): Promise<void> {
  await upsertJson(accessToken, folderId, 'news-local.json', {
    ...news,
    updatedAt: nowIso(),
  })
}

export async function saveMaps(
  accessToken: string,
  folderId: string,
  maps: Maps,
): Promise<void> {
  await upsertJson(accessToken, folderId, 'maps.json', {
    ...maps,
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

export function cabinetToExport(data: CabinetData): AntariaExport {
  return {
    format: EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    app: 'antaria-cabinet',
    province: data.meta,
    profile: data.profile,
    indicators: data.indicators,
    board: data.board,
    orders: data.orders,
    relations: data.relations,
    newsLocal: data.news,
    maps: data.maps,
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
  await saveRelations(accessToken, folderId, exp.relations)
  await saveNews(accessToken, folderId, exp.newsLocal)
  await saveMaps(accessToken, folderId, exp.maps)
  await saveMilitary(accessToken, folderId, exp.military)
  for (const turn of exp.orders) {
    await saveOrdersTurn(accessToken, folderId, turn)
  }
}
