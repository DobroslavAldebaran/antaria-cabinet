import { z } from 'zod'

export const SCHEMA_VERSION = 1 as const

export const BoardStatusSchema = z.enum([
  'planned',
  'in_progress',
  'reserved',
  'done',
  'failed',
])
export type BoardStatus = z.infer<typeof BoardStatusSchema>

export const AntariaMetaSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  provinceName: z.string().default(''),
  ruler: z.string().default(''),
  faction: z.string().default(''),
  currentTurn: z.number().int().nonnegative().default(0),
  updatedAt: z.string(),
})
export type AntariaMeta = z.infer<typeof AntariaMetaSchema>

export const MinistrySchema = z.object({
  id: z.string(),
  name: z.string(),
  head: z.string().optional(),
  role: z.string().optional(),
  notes: z.string().optional(),
})

export const ProfileSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  publicLore: z.string().default(''),
  privateLore: z.string().default(''),
  ministries: z.array(MinistrySchema).default([]),
  updatedAt: z.string(),
})
export type Profile = z.infer<typeof ProfileSchema>

export const MetricSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  note: z.string().optional(),
})
export type Metric = z.infer<typeof MetricSchema>

export const MetricLedgerKindSchema = z.enum([
  'start',
  'order',
  'between_turns',
  'manual',
  'verdict',
  'event',
])
export type MetricLedgerKind = z.infer<typeof MetricLedgerKindSchema>

export const MetricLedgerEntrySchema = z.object({
  id: z.string(),
  metricId: z.string(),
  kind: MetricLedgerKindSchema,
  turn: z.number().int().optional(),
  delta: z.union([z.string(), z.number()]).optional(),
  balanceAfter: z.union([z.string(), z.number()]).optional(),
  title: z.string(),
  orderTurn: z.number().int().optional(),
  orderId: z.string().optional(),
  verdictTurn: z.number().int().optional(),
  eventId: z.string().optional(),
  note: z.string().optional(),
  at: z.string().optional(),
})
export type MetricLedgerEntry = z.infer<typeof MetricLedgerEntrySchema>

export const EffectSchema = z.object({
  id: z.string(),
  metricId: z.string(),
  delta: z.number(),
  note: z.string().optional(),
})
export type Effect = z.infer<typeof EffectSchema>

export const IndicatorsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  turn: z.number().int().nonnegative().default(0),
  metrics: z.array(MetricSchema).default([]),
  /** Additive: old indicators without ledger still parse. */
  ledger: z.array(MetricLedgerEntrySchema).default([]),
  updatedAt: z.string(),
})
export type Indicators = z.infer<typeof IndicatorsSchema>

export const MilitaryUnitSchema = z.object({
  id: z.string(),
  name: z.string(),
  count: z.number().default(0),
  hire: z.union([z.string(), z.number()]).optional(),
  upkeep: z.union([z.string(), z.number()]).optional(),
  note: z.string().optional(),
})
export type MilitaryUnit = z.infer<typeof MilitaryUnitSchema>

export const MilitarySchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  units: z.array(MilitaryUnitSchema).default([]),
  updatedAt: z.string(),
})
export type Military = z.infer<typeof MilitarySchema>

export const BoardItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: BoardStatusSchema,
  turn: z.number().int().optional(),
  links: z.array(z.string()).default([]),
  notes: z.string().optional(),
})

export const BoardSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  items: z.array(BoardItemSchema).default([]),
  updatedAt: z.string(),
})
export type Board = z.infer<typeof BoardSchema>

export const OrderItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  goal: z.string().optional(),
  body: z.string().default(''),
  budget: z.string().optional(),
  responsible: z.string().optional(),
  secret: z.boolean().default(false),
  expectation: z.string().optional(),
  /** Additive: old orders without effects still parse. */
  effects: z.array(EffectSchema).default([]),
  /** Draft metrics introduced by this order; merge into indicators on verdict commit. */
  createdMetrics: z.array(MetricSchema).default([]),
})
export type OrderItem = z.infer<typeof OrderItemSchema>

export const OrdersTurnSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  turn: z.number().int().nonnegative(),
  visibility: z.enum(['open', 'secret', 'mixed']).default('open'),
  items: z.array(OrderItemSchema).default([]),
  updatedAt: z.string(),
})
export type OrdersTurn = z.infer<typeof OrdersTurnSchema>

export const VerdictCommitSchema = z.object({
  id: z.string(),
  at: z.string(),
  orderIds: z.array(z.string()).default([]),
  effects: z.array(EffectSchema).default([]),
})
export type VerdictCommit = z.infer<typeof VerdictCommitSchema>

export const VerdictTurnSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  turn: z.number().int().nonnegative(),
  body: z.string().default(''),
  /** Draft: small orders marked for the next commit. */
  orderIds: z.array(z.string()).default([]),
  /** Draft: verdict-own effects for the next commit. */
  effects: z.array(EffectSchema).default([]),
  /** Draft metrics introduced by this verdict; merge into indicators on commit. */
  createdMetrics: z.array(MetricSchema).default([]),
  commits: z.array(VerdictCommitSchema).default([]),
  updatedAt: z.string(),
})
export type VerdictTurn = z.infer<typeof VerdictTurnSchema>

export const CabinetEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string().optional(),
  turn: z.number().int().optional(),
  at: z.string(),
  effects: z.array(EffectSchema).default([]),
  /** Metrics introduced by this event; merge into indicators on first save. */
  createdMetrics: z.array(MetricSchema).default([]),
})
export type CabinetEvent = z.infer<typeof CabinetEventSchema>

export const EventsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  items: z.array(CabinetEventSchema).default([]),
  updatedAt: z.string(),
})
export type EventsDoc = z.infer<typeof EventsSchema>

export const RelationPartySchema = z.object({
  id: z.string(),
  name: z.string(),
  stance: z.string().default('neutral'),
  treaties: z.array(z.string()).default([]),
  notes: z.string().optional(),
})

export const RelationsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  parties: z.array(RelationPartySchema).default([]),
  updatedAt: z.string(),
})
export type Relations = z.infer<typeof RelationsSchema>

export const NewsItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().optional(),
  date: z.string().optional(),
  excerpt: z.string().optional(),
  source: z.string().optional(),
})

export const NewsLocalSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  items: z.array(NewsItemSchema).default([]),
  updatedAt: z.string(),
})
export type NewsLocal = z.infer<typeof NewsLocalSchema>

export const MapItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().optional(),
  driveFileId: z.string().optional(),
  note: z.string().optional(),
})

export const MapsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  items: z.array(MapItemSchema).default([]),
  updatedAt: z.string(),
})
export type Maps = z.infer<typeof MapsSchema>

export function nowIso(): string {
  return new Date().toISOString()
}

export function emptyMeta(): AntariaMeta {
  return AntariaMetaSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
  })
}

export function emptyProfile(): Profile {
  return ProfileSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
  })
}

export function emptyIndicators(turn = 0): Indicators {
  return IndicatorsSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    turn,
    updatedAt: nowIso(),
  })
}

export function emptyBoard(): Board {
  return BoardSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
  })
}

export function emptyRelations(): Relations {
  return RelationsSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
  })
}

export function emptyNews(): NewsLocal {
  return NewsLocalSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
  })
}

export function emptyMaps(): Maps {
  return MapsSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
  })
}

export function emptyMilitary(): Military {
  return MilitarySchema.parse({
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
  })
}

export function emptyOrdersTurn(turn: number): OrdersTurn {
  return OrdersTurnSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    turn,
    updatedAt: nowIso(),
  })
}

export function emptyVerdictTurn(turn: number): VerdictTurn {
  return VerdictTurnSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    turn,
    updatedAt: nowIso(),
  })
}

export function emptyEvents(): EventsDoc {
  return EventsSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
  })
}

export function newId(prefix = 'id'): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}
