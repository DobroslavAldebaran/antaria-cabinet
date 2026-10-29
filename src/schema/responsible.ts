import { flattenMinistryTree } from './ministries'
import type {
  Character,
  Ministry,
  ResponsibleOther,
} from './province'

export type ResponsibleOption =
  | {
      kind: 'ministry'
      id: string
      label: string
      depth: number
    }
  | {
      kind: 'character'
      id: string
      label: string
      caption: string
      depth: number
      avatarUrl?: string
    }
  | {
      kind: 'other'
      id: string
      label: string
      depth: number
    }
  | {
      kind: 'header'
      label: string
    }

function characterLabel(c: Character): string {
  return c.name?.trim() || 'Без имени'
}

function ministryLabel(m: Ministry): string {
  return m.name?.trim() || 'Без названия'
}

function optionMatches(option: ResponsibleOption, query: string): boolean {
  if (option.kind === 'header') return false
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (option.kind === 'character') {
    const caption = option.caption.toLowerCase()
    return option.label.toLowerCase().includes(q) || caption.includes(q)
  }
  return option.label.toLowerCase().includes(q)
}

/** Build picker rows: ministry tree + managers, unassigned characters, Остальное. */
export function buildResponsibleOptions(
  ministries: Ministry[],
  characters: Character[],
  others: ResponsibleOther[],
): ResponsibleOption[] {
  const byCharacterId = new Map(characters.map((c) => [c.id, c]))
  const managerIds = new Set(
    ministries
      .map((m) => m.managerCharacterId)
      .filter((id): id is string => Boolean(id)),
  )
  const tree = flattenMinistryTree(ministries)
  const ministryById = new Map(ministries.map((m) => [m.id, m]))
  const out: ResponsibleOption[] = []

  for (const node of tree) {
    const ministry = ministryById.get(node.id)
    if (!ministry) continue
    out.push({
      kind: 'ministry',
      id: ministry.id,
      label: ministryLabel(ministry),
      depth: node.depth,
    })
    const managerId = ministry.managerCharacterId
    if (managerId) {
      const manager = byCharacterId.get(managerId)
      if (manager) {
        out.push({
          kind: 'character',
          id: manager.id,
          label: characterLabel(manager),
          caption: manager.caption?.trim() ?? '',
          depth: node.depth,
          avatarUrl: manager.avatarUrl,
        })
      }
    }
  }

  const unassigned = characters
    .filter((c) => !managerIds.has(c.id))
    .sort((a, b) =>
      characterLabel(a).localeCompare(characterLabel(b), 'ru'),
    )
  if (unassigned.length > 0) {
    out.push({ kind: 'header', label: 'Без министерства' })
    for (const c of unassigned) {
      out.push({
        kind: 'character',
        id: c.id,
        label: characterLabel(c),
        caption: c.caption?.trim() ?? '',
        depth: 0,
        avatarUrl: c.avatarUrl,
      })
    }
  }

  const sortedOthers = [...others].sort((a, b) =>
    (a.name?.trim() || '').localeCompare(b.name?.trim() || '', 'ru'),
  )
  if (sortedOthers.length > 0) {
    out.push({ kind: 'header', label: 'Остальное' })
    for (const item of sortedOthers) {
      out.push({
        kind: 'other',
        id: item.id,
        label: item.name?.trim() || 'Без названия',
        depth: 0,
      })
    }
  }

  return out
}

export function filterResponsibleOptions(
  options: ResponsibleOption[],
  query: string,
): ResponsibleOption[] {
  const q = query.trim()
  if (!q) return options

  const out: ResponsibleOption[] = []
  let pendingHeader: ResponsibleOption | null = null
  for (const option of options) {
    if (option.kind === 'header') {
      pendingHeader = option
      continue
    }
    if (!optionMatches(option, q)) continue
    if (pendingHeader) {
      out.push(pendingHeader)
      pendingHeader = null
    }
    out.push(option)
  }
  return out
}

export function resolveResponsibleLabel(
  value: string | undefined,
  ministries: Ministry[],
  characters: Character[],
  others: ResponsibleOther[],
): { label: string; missing: boolean } {
  if (!value) return { label: 'Не выбран', missing: false }
  const ministry = ministries.find((m) => m.id === value)
  if (ministry) return { label: ministryLabel(ministry), missing: false }
  const character = characters.find((c) => c.id === value)
  if (character) {
    const caption = character.caption?.trim()
    const name = characterLabel(character)
    return {
      label: caption ? `${name} · ${caption}` : name,
      missing: false,
    }
  }
  const other = others.find((o) => o.id === value)
  if (other) {
    return { label: other.name?.trim() || 'Без названия', missing: false }
  }
  return { label: 'Не найден', missing: true }
}

export function findOtherByName(
  others: ResponsibleOther[],
  name: string,
): ResponsibleOther | undefined {
  const key = name.trim().toLowerCase()
  if (!key) return undefined
  return others.find((o) => (o.name?.trim().toLowerCase() ?? '') === key)
}
