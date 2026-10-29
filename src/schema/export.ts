import { z } from 'zod'
import {
  AntariaMetaSchema,
  BoardSchema,
  EventsSchema,
  IndicatorsSchema,
  MilitarySchema,
  OrdersTurnSchema,
  ProfileSchema,
  SCHEMA_VERSION,
  VerdictTurnSchema,
  emptyEvents,
  emptyMilitary,
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
  /** Additive: old exports without verdicts/events still parse. */
  verdicts: z.array(VerdictTurnSchema).default([]),
  events: EventsSchema.default(() => emptyEvents()),
  /** Additive: old exports without military still parse. */
  military: MilitarySchema.default(() => emptyMilitary()),
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
