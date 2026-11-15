import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyEffectsToIndicators,
  revertEventFromIndicators,
  sumPendingByMetric,
  syncEventToIndicators,
} from '../src/schema/metrics.ts'
import { IndicatorsSchema, CabinetEventSchema } from '../src/schema/province.ts'

const at = '2025-01-01T00:00:00Z'
const effect = (metricId, delta, note) => ({ id: `fx-${metricId}-${delta}`, metricId, delta, note })
const event = (effects, overrides = {}) => CabinetEventSchema.parse({
  id: 'event-a', title: 'Test event', turn: 0, at, effects, ...overrides,
})
const indicators = () => IndicatorsSchema.parse({
  metrics: [{ id: 'funds', label: 'Funds', value: 1000 }, { id: 'stock', label: 'Stock', value: 50 }],
  ledger: [{ id: 'start-funds', metricId: 'funds', kind: 'start', balanceAfter: 1000, title: 'Start', at }],
  schemaVersion: 1, updatedAt: at,
})
const value = (data, id = 'funds') => data.metrics.find((metric) => metric.id === id)?.value
const deltas = (data) => data.ledger.filter((row) => row.eventId === 'event-a' && row.delta !== undefined)
const pending = (data, item, id = 'funds') => sumPendingByMetric([], [], [item], data.ledger).get(id) ?? 0

test('first save and repeated saves apply an event exactly once', () => {
  const item = event([effect('funds', 100)])
  const saved = syncEventToIndicators(indicators(), item)
  assert.equal(value(saved), 1100)
  assert.equal(deltas(saved)[0].balanceAfter, 1100)
  assert.equal(syncEventToIndicators(saved, item), saved)
  assert.equal(pending(saved, item), 0)
})

test('unchanged fractional effects have exactly zero pending adjustment', () => {
  const item = event([effect('funds', 0.1), effect('funds', 0.2)])
  const saved = syncEventToIndicators(indicators(), item)
  assert.equal(pending(saved, item), 0)
})

test('an event that only created a metric can apply deltas on a later save', () => {
  const createdMetrics = [{ id: 'new-stock', label: 'New stock', value: 10 }]
  const saved = syncEventToIndicators(indicators(), event([], { createdMetrics }))
  const revised = event([effect('new-stock', -4)], { createdMetrics })
  assert.equal(pending(saved, revised, 'new-stock'), -4)
  const updated = syncEventToIndicators(saved, revised)
  assert.equal(value(updated, 'new-stock'), 6)
  assert.equal(syncEventToIndicators(updated, revised), updated)
})

test('changing a positive delta to a negative delta updates the balance and later history', () => {
  const saved = syncEventToIndicators(indicators(), event([effect('funds', 100)]))
  const later = applyEffectsToIndicators(saved, [effect('funds', 30)], {
    kind: 'manual', title: 'Later change', at: '2025-01-02T00:00:00Z',
  })
  const revised = event([effect('funds', -200)])
  assert.equal(pending(later, revised), -300)
  const updated = syncEventToIndicators(later, revised)
  assert.equal(value(updated), 830)
  assert.deepEqual(deltas(updated).map((row) => [row.delta, row.balanceAfter]), [[-200, 800]])
  assert.equal(updated.ledger.at(-1).balanceAfter, 830)
  assert.equal(updated.ledger[0].balanceAfter, 1000)
  assert.equal(updated.ledger[1].id, saved.ledger[1].id)
  assert.equal(syncEventToIndicators(updated, revised), updated)
  assert.equal(pending(updated, revised), 0)
  assert.equal(value(later), 1130)
})

test('removing all deltas restores their amounts and adjusts later balances', () => {
  const saved = syncEventToIndicators(indicators(), event([effect('funds', -100)]))
  const later = applyEffectsToIndicators(saved, [effect('funds', 10)], { kind: 'manual', title: 'Later' })
  const revised = event([])
  assert.equal(pending(later, revised), 100)
  const updated = syncEventToIndicators(later, revised)
  assert.equal(value(updated), 1010)
  assert.equal(deltas(updated).length, 0)
  assert.equal(updated.ledger.at(-1).balanceAfter, 1010)
  assert.equal(syncEventToIndicators(updated, revised), updated)
})

test('moving a delta between metrics reverses the old metric and applies the new one', () => {
  const saved = syncEventToIndicators(indicators(), event([effect('funds', -100)]))
  const revised = event([effect('stock', -20)])
  assert.equal(pending(saved, revised), 100)
  assert.equal(pending(saved, revised, 'stock'), -20)
  const updated = syncEventToIndicators(saved, revised)
  assert.equal(value(updated), 1000)
  assert.equal(value(updated, 'stock'), 30)
  assert.deepEqual(deltas(updated).map((row) => [row.metricId, row.delta, row.balanceAfter]), [['stock', -20, 30]])
})

test('multiple effects per metric keep separate notes and correct running balances', () => {
  const saved = syncEventToIndicators(indicators(), event([
    effect('funds', 100, 'First'), effect('stock', 5), effect('funds', -50, 'Second'),
  ]))
  const revised = event([effect('funds', -200, 'Updated'), effect('stock', -10), effect('funds', 20, 'Refund')])
  const updated = syncEventToIndicators(saved, revised)
  assert.equal(value(updated), 820)
  assert.equal(value(updated, 'stock'), 40)
  assert.deepEqual(deltas(updated).filter((row) => row.metricId === 'funds').map((row) => [row.delta, row.balanceAfter, row.note]), [
    [-200, 800, 'Updated'], [20, 820, 'Refund'],
  ])
  assert.equal(syncEventToIndicators(updated, revised), updated)
})

test('event corrections preserve created metrics and other events using them', () => {
  const createdMetrics = [{ id: 'new-stock', label: 'New stock', value: 10 }]
  const saved = syncEventToIndicators(indicators(), event([effect('new-stock', 5)], { createdMetrics }))
  const later = syncEventToIndicators(saved, event([effect('new-stock', 2)], { id: 'event-b', title: 'Second event' }))
  const revised = event([effect('new-stock', -3)], { createdMetrics })
  const updated = syncEventToIndicators(later, revised)
  assert.equal(value(updated, 'new-stock'), 9)
  assert.deepEqual(updated.ledger.filter((row) => row.metricId === 'new-stock').map((row) => row.balanceAfter), [10, 7, 9])
  assert.equal(syncEventToIndicators(updated, revised), updated)
  const removedEffects = syncEventToIndicators(updated, event([], { createdMetrics }))
  assert.equal(value(removedEffects, 'new-stock'), 12)
  assert.equal(removedEffects.ledger.find((row) => row.eventId === 'event-b').delta, 2)
})

test('new metrics and effects can be added to an already applied event', () => {
  const saved = syncEventToIndicators(indicators(), event([effect('funds', 100)]))
  const revised = event([effect('funds', -50), effect('new-stock', 3)], {
    createdMetrics: [{ id: 'new-stock', label: 'New stock', value: 10 }],
  })
  const updated = syncEventToIndicators(saved, revised)
  assert.equal(value(updated), 950)
  assert.equal(value(updated, 'new-stock'), 13)
  assert.deepEqual(updated.ledger.filter((row) => row.metricId === 'new-stock').map((row) => row.balanceAfter), [10, 13])
  assert.equal(syncEventToIndicators(updated, revised), updated)
})

test('title and turn changes update history without changing amounts or row IDs', () => {
  const saved = syncEventToIndicators(indicators(), event([effect('funds', 100)]))
  const revised = event([effect('funds', 100)], { title: 'Renamed', turn: 2 })
  const updated = syncEventToIndicators(saved, revised)
  assert.equal(value(updated), 1100)
  assert.equal(deltas(updated)[0].title, 'Renamed')
  assert.equal(deltas(updated)[0].turn, 2)
  assert.equal(deltas(updated)[0].id, deltas(saved)[0].id)
  assert.equal(syncEventToIndicators(updated, revised), updated)
})

test('legacy string deltas and missing balances are corrected without double application', () => {
  const saved = syncEventToIndicators(indicators(), event([effect('funds', 100)]))
  const legacy = { ...saved, ledger: saved.ledger.map((row) => row.eventId ? { ...row, delta: '100', balanceAfter: undefined } : row) }
  const updated = syncEventToIndicators(legacy, event([effect('funds', -200)]))
  assert.equal(value(updated), 800)
  assert.equal(deltas(updated)[0].balanceAfter, 800)
})

test('deleting a corrected event reverses its current delta and repairs later balances', () => {
  const saved = syncEventToIndicators(indicators(), event([effect('funds', -200)]))
  const later = applyEffectsToIndicators(saved, [effect('funds', 30)], { kind: 'manual', title: 'Later' })
  const deleted = revertEventFromIndicators(later, 'event-a')
  assert.equal(value(deleted), 1030)
  assert.equal(deleted.ledger.at(-1).balanceAfter, 1030)
  assert.equal(deltas(deleted).length, 0)
  assert.equal(revertEventFromIndicators(deleted, 'event-a'), deleted)
})
