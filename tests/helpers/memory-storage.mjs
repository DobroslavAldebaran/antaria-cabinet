export function createMemoryStorage() {
  const entries = new Map()
  return {
    get length() { return entries.size },
    key(index) { return [...entries.keys()][index] ?? null },
    getItem(key) { return entries.get(String(key)) ?? null },
    setItem(key, value) { entries.set(String(key), String(value)) },
    removeItem(key) { entries.delete(String(key)) },
    clear() { entries.clear() },
  }
}
