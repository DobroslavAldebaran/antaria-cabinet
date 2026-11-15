import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acknowledgeOrdersDraft, readOrdersDraft, trackOrdersDraftTurns, writeOrdersDraft } from '../src/lib/ordersDraftStorage.ts'
import { OrdersTurnSchema, ResponsibleOthersSchema } from '../src/schema/province.ts'
import { createMemoryStorage } from './helpers/memory-storage.mjs'

const at = '2026-01-01T00:00:00Z'
const value = (body = 'order draft') => ({
  orders: [OrdersTurnSchema.parse({ schemaVersion: 1, turn: 7, updatedAt: at,
    items: [{ id: 'order-a', title: 'Draft', body, goal: 'A goal', responsible: 'character:abc',
      fixedExpense: { metricId: 'budget', amount: 50 }, effects: [{ id: 'fx', metricId: 'stock', delta: 2 }] }],
  })],
  responsibleOthers: ResponsibleOthersSchema.parse({ schemaVersion: 1, updatedAt: at, items: [{ id: 'other-a', name: 'New responsible', at }] }),
})
function setup(t) {
  const original = globalThis.localStorage
  const storage = createMemoryStorage()
  globalThis.localStorage = storage
  t.after(() => { globalThis.localStorage = original })
  return storage
}

test('local order text and associated draft fields survive a storage round trip', (t) => {
  setup(t)
  const draft = value('<p>Приказ со всеми данными</p>')
  writeOrdersDraft('user-a', 'folder-a', draft, [1, 7])
  assert.deepEqual(readOrdersDraft('user-a', 'folder-a'), { version: 1, value: draft, persistedTurns: [1, 7] })
})

test('draft recovery is isolated by both account and Drive folder', (t) => {
  setup(t)
  writeOrdersDraft('user-a', 'folder-a', value('A / A'), [7])
  writeOrdersDraft('user-b', 'folder-a', value('B / A'), [7])
  writeOrdersDraft('user-a', 'folder-b', value('A / B'), [7])
  assert.equal(readOrdersDraft('user-a', 'folder-a').value.orders[0].items[0].body, 'A / A')
  assert.equal(readOrdersDraft('user-b', 'folder-a').value.orders[0].items[0].body, 'B / A')
  assert.equal(readOrdersDraft('user-a', 'folder-b').value.orders[0].items[0].body, 'A / B')
  assert.equal(readOrdersDraft('user-b', 'folder-b'), null)
})

test('acknowledging an older write preserves newer text and the uploaded turns', (t) => {
  setup(t)
  writeOrdersDraft('user-a', 'folder-a', value('latest text'), [2])
  acknowledgeOrdersDraft('user-a', 'folder-a', value('earlier in-flight text'), [7])
  const draft = readOrdersDraft('user-a', 'folder-a')
  assert.equal(draft.value.orders[0].items[0].body, 'latest text')
  assert.deepEqual(draft.persistedTurns, [2, 7])
})

test('only a successful write of the exact local snapshot clears the recovery copy', (t) => {
  const storage = setup(t)
  const saved = value()
  writeOrdersDraft('user-a', 'folder-a', saved, [7])
  writeOrdersDraft('user-b', 'folder-a', value('other account'), [7])
  acknowledgeOrdersDraft('user-a', 'folder-a', saved, [7])
  assert.equal(readOrdersDraft('user-a', 'folder-a'), null)
  assert.equal(storage.length, 1)
  assert.equal(readOrdersDraft('user-b', 'folder-a').value.orders[0].items[0].body, 'other account')
})

test('a successful latest Drive write clears a known stale copy after browser storage quota failure', (t) => {
  setup(t)
  const stale = value('stale local copy')
  const latest = value('latest text saved on Drive')
  writeOrdersDraft('user-a', 'folder-a', stale, [7])
  const capturedCopy = readOrdersDraft('user-a', 'folder-a').value
  acknowledgeOrdersDraft('user-a', 'folder-a', latest, [7], capturedCopy)
  assert.equal(readOrdersDraft('user-a', 'folder-a'), null)
})

test('acknowledging a known stale copy still preserves a newer copy created during the write', (t) => {
  setup(t)
  writeOrdersDraft('user-a', 'folder-a', value('stale local copy'), [2])
  const capturedCopy = readOrdersDraft('user-a', 'folder-a').value
  writeOrdersDraft('user-a', 'folder-a', value('newer copy created during the request'), [2])
  acknowledgeOrdersDraft('user-a', 'folder-a', value('snapshot written on Drive'), [7], capturedCopy)
  const draft = readOrdersDraft('user-a', 'folder-a')
  assert.equal(draft.value.orders[0].items[0].body, 'newer copy created during the request')
  assert.deepEqual(draft.persistedTurns, [2, 7])
})

test('deleting the last order retains persisted turn IDs for the later Drive deletion', (t) => {
  setup(t)
  const empty = { ...value(), orders: [] }
  writeOrdersDraft('user-a', 'folder-a', empty, [7])
  assert.deepEqual(readOrdersDraft('user-a', 'folder-a'), { version: 1, value: empty, persistedTurns: [7] })
})

test('tracking partially uploaded turns preserves the latest local text and unions turn IDs', (t) => {
  setup(t)
  const latest = value('latest unsaved text')
  writeOrdersDraft('user-a', 'folder-a', latest, [2])
  trackOrdersDraftTurns('user-a', 'folder-a', [2, 7, 8])
  assert.deepEqual(readOrdersDraft('user-a', 'folder-a'), { version: 1, value: latest, persistedTurns: [2, 7, 8] })
  trackOrdersDraftTurns('user-a', 'other-folder', [7])
  assert.equal(readOrdersDraft('user-a', 'other-folder'), null)
})

test('malformed and unsupported recovery data throw without removing the original copy', (t) => {
  const storage = setup(t)
  writeOrdersDraft('user-a', 'folder-a', value(), [7])
  const key = storage.key(0)
  for (const raw of ['{broken json', JSON.stringify({ version: 2, value: value(), persistedTurns: [7] })]) {
    storage.setItem(key, raw)
    assert.throws(() => readOrdersDraft('user-a', 'folder-a'))
    assert.equal(storage.getItem(key), raw)
    assert.throws(() => acknowledgeOrdersDraft('user-a', 'folder-a', value(), [7]))
    assert.equal(storage.getItem(key), raw)
  }
})

test('unavailable browser storage raises a write failure instead of claiming the copy is saved', (t) => {
  setup(t)
  globalThis.localStorage = { setItem() { throw new Error('Quota exceeded') } }
  assert.throws(() => writeOrdersDraft('user-a', 'folder-a', value(), [7]), /Quota exceeded/)
})
