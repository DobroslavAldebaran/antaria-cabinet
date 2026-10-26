import { z } from 'zod'
import {
  AntariaMetaSchema,
  BoardSchema,
  IndicatorsSchema,
  MapsSchema,
  NewsLocalSchema,
  OrdersTurnSchema,
  ProfileSchema,
  RelationsSchema,
  SCHEMA_VERSION,
} from './province'

export const EXPORT_FORMAT = 'antaria-export' as const
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024

export const AntariaExportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  schemaVersion: z.literal(SCHEMA_VERSION),
  exportedAt: z.string(),
  app: z.literal('antaria-cabinet'),
  province: AntariaMetaSchema,
  profile: ProfileSchema,
  indicators: IndicatorsSchema,
  board: BoardSchema,
  orders: z.array(OrdersTurnSchema).default([]),
  relations: RelationsSchema,
  newsLocal: NewsLocalSchema,
  maps: MapsSchema,
})

export type AntariaExport = z.infer<typeof AntariaExportSchema>

export function parseExportJson(raw: unknown): AntariaExport {
  return AntariaExportSchema.parse(raw)
}

export function parseExportText(text: string): AntariaExport {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) {
    throw new Error(`Файл больше лимита ${MAX_IMPORT_BYTES} байт`)
  }
  const data: unknown = JSON.parse(text)
  return parseExportJson(data)
}
