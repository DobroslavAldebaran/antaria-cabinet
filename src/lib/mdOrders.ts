import { newId, type OrderItem } from '../schema/province'
import { sanitizeText } from './sanitize'

/** Best-effort parse of Antaria-style order markdown into order items. */
export function parseOrdersMarkdown(md: string): OrderItem[] {
  const text = sanitizeText(md, 200_000)
  const chunks = text.split(/\n(?=#{1,3}\s|^\*\*[^*\n]+\*\*\s*$)/m).filter(Boolean)
  // Fallback: split by double newlines if few chunks
  const blocks =
    chunks.length > 1
      ? chunks
      : text.split(/\n{2,}/).filter((b) => b.trim().length > 0)

  const items: OrderItem[] = []

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) continue

    let title = lines[0]
      .replace(/^#{1,3}\s*/, '')
      .replace(/^\*\*(.+)\*\*$/, '$1')
      .trim()
    if (!title) continue

    const secret = /скрытн|секрет/i.test(block)
    title = title.replace(/\s*\((Скрытно|СЕКРЕТНО|секретно)\)\s*/gi, '').trim()

    const goal = matchField(block, /(?:\*\*)?Цель(?:\*\*)?\s*[:=]\s*(.+)/i)
    const budget = matchField(block, /(?:\*\*)?Бюджет(?:\*\*)?\s*[:=]\s*(.+)/i)
    const responsible = matchField(
      block,
      /(?:\*\*)?(?:Ответственный|_Ответственный_)(?:\*\*)?\s*[:=]\s*(.+)/i,
    )
    const expectation = matchField(
      block,
      /(?:\*\*)?(?:Ожидание|_Ожидание_)(?:\*\*)?\s*[:=]\s*(.+)/i,
    )
    const execution = matchField(
      block,
      /(?:\*\*)?Выполнение(?:\*\*)?\s*[:=]\s*([\s\S]+?)(?=\n(?:\*\*)?(?:Бюджет|Ожидание|Цель)|$)/i,
    )

    items.push({
      id: newId('ord'),
      title,
      goal: goal ?? undefined,
      body: sanitizeText(execution ?? lines.slice(1).join('\n')),
      budget: budget ?? undefined,
      responsible: responsible?.replace(/\*\*/g, '') ?? undefined,
      secret,
      expectation: expectation ?? undefined,
    })
  }

  return items
}

function matchField(block: string, re: RegExp): string | null {
  const m = block.match(re)
  return m?.[1]?.trim() ? sanitizeText(m[1].trim(), 10_000) : null
}
