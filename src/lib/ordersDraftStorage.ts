import { z } from 'zod'
import {
  OrdersTurnSchema,
  ResponsibleOthersSchema,
} from '../schema/province'

const OrdersDraftValueSchema = z.object({
  orders: z.array(OrdersTurnSchema),
  responsibleOthers: ResponsibleOthersSchema,
})

const OrdersDraftSchema = z.object({
  version: z.literal(1),
  value: OrdersDraftValueSchema,
  persistedTurns: z.array(z.number().int().nonnegative()),
})

export type OrdersDraftValue = z.infer<typeof OrdersDraftValueSchema>
export type OrdersDraft = z.infer<typeof OrdersDraftSchema>

function key(uid: string, folderId: string): string {
  return `antaria.orders-draft.${encodeURIComponent(uid)}.${encodeURIComponent(folderId)}`
}

export function readOrdersDraft(uid: string, folderId: string): OrdersDraft | null {
  const raw = localStorage.getItem(key(uid, folderId))
  if (!raw) return null
  // Do not discard a damaged or newer-format copy; it may still be recoverable.
  const parsed = OrdersDraftSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) throw new Error('Не удалось прочитать локальный черновик приказов')
  return parsed.data
}

export function writeOrdersDraft(
  uid: string,
  folderId: string,
  value: OrdersDraftValue,
  persistedTurns: number[],
): void {
  localStorage.setItem(key(uid, folderId), JSON.stringify({ version: 1, value, persistedTurns }))
}

/** Remember turns that may be created by a write which later fails partway. */
export function trackOrdersDraftTurns(uid: string, folderId: string, turns: number[]): void {
  const draft = readOrdersDraft(uid, folderId)
  if (draft) {
    writeOrdersDraft(uid, folderId, draft.value, [...new Set([...draft.persistedTurns, ...turns])])
  }
}

/** A late Drive response must not delete edits made while that request was in flight. */
export function acknowledgeOrdersDraft(
  uid: string,
  folderId: string,
  saved: OrdersDraftValue,
  persistedTurns: number[],
  supersededCopy?: OrdersDraftValue,
): void {
  const draft = readOrdersDraft(uid, folderId)
  if (!draft) return
  const stored = JSON.stringify(draft.value)
  if (stored === JSON.stringify(OrdersDraftValueSchema.parse(saved))
    || (supersededCopy && stored === JSON.stringify(supersededCopy))) {
    localStorage.removeItem(key(uid, folderId))
  } else {
    writeOrdersDraft(uid, folderId, draft.value,
      [...new Set([...draft.persistedTurns, ...persistedTurns])])
  }
}
