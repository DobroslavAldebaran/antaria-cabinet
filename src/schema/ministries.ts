import type { Ministry } from './province'

export type MinistryTreeNode = {
  id: string
  depth: number
}

/** Flatten ministries: roots (missing/broken parent), then DFS children. */
export function flattenMinistryTree(items: Ministry[]): MinistryTreeNode[] {
  const byId = new Map(items.map((m) => [m.id, m]))
  const children = new Map<string, Ministry[]>()

  for (const m of items) {
    const parentOk = Boolean(m.parentId && byId.has(m.parentId))
    if (!parentOk) continue
    const list = children.get(m.parentId!) ?? []
    list.push(m)
    children.set(m.parentId!, list)
  }

  for (const list of children.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }

  const roots = items
    .filter((m) => !m.parentId || !byId.has(m.parentId))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  const out: MinistryTreeNode[] = []
  const visit = (m: Ministry, depth: number) => {
    out.push({ id: m.id, depth })
    for (const child of children.get(m.id) ?? []) {
      visit(child, depth + 1)
    }
  }
  for (const root of roots) visit(root, 0)
  return out
}

export function ministryDepthMap(items: Ministry[]): Map<string, number> {
  return new Map(flattenMinistryTree(items).map((n) => [n.id, n.depth]))
}
