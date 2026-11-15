import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

// Keep Drive/auth and the rich-text editor out of the routing regression test.
const mocks = new Map([
  ['../cabinet/CabinetProvider', 'export const useCabinet = () => globalThis.testCabinet'],
  ['../lib/drive', 'export const saveEvents = async () => {}; export const saveIndicators = async () => {}'],
  ['../components/RichTextEditor', 'export const RichTextEditor = () => null'],
  ['./Onboarding', 'export const Onboarding = () => null'],
])
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith('/src/pages/EventsPage.tsx') && mocks.has(specifier)) {
      return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
const { EventsPage } = await import('../src/pages/EventsPage.tsx')
const { MetricHistoryDialog } = await import('../src/components/MetricHistoryDialog.tsx')
const at = '2025-01-01T00:00:00Z'
const items = [
  { id: 'event-a', title: 'First event', turn: 0, at, effects: [], createdMetrics: [] },
  { id: 'event-b', title: 'Second event', turn: 0, at, effects: [], createdMetrics: [] },
]
function render(path, events = items) {
  globalThis.testCabinet = {
    binding: { folderId: 'test-folder' },
    data: { events: { items: events, schemaVersion: 1, updatedAt: at }, indicators: { metrics: [], ledger: [] } },
    busy: false, setData() {}, ensureToken: async () => 'test-token',
  }
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(EventsPage)))
}

test('a history deep link selects the requested second event on the first render', () => {
  const markup = render('/app/events?id=event-b')
  assert.match(markup, /class="master-detail-item is-selected" aria-current="true"[^>]*>.*?Second event/)
  assert.match(markup, /<input value="Second event"/)
  assert.doesNotMatch(markup, /<input value="First event"/)
})

test('opening events without an ID selects the first event', () => {
  assert.match(render('/app/events'), /<input value="First event"/)
})

test('an unavailable event ID never silently opens a different event', () => {
  const markup = render('/app/events?id=missing')
  assert.match(markup, /Событие по ссылке не найдено/)
  assert.doesNotMatch(markup, /aria-current="true"/)
  assert.doesNotMatch(markup, /<input value="First event"/)
})

test('a deep link also resolves after an initially empty event list is loaded', () => {
  assert.doesNotMatch(render('/app/events?id=event-b', []), /aria-current="true"/)
  assert.match(render('/app/events?id=event-b'), /<input value="Second event"/)
})

test('history links encode the complete event ID', () => {
  const markup = renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(MetricHistoryDialog, {
      metricId: 'funds', metrics: [{ id: 'funds', label: 'Funds', value: 10 }],
      entries: [{ id: 'row', metricId: 'funds', kind: 'event', title: 'Event', eventId: 'id & extra=1', delta: 10 }],
      open: true, onClose() {},
    }),
  ))
  assert.match(markup, /href="\/app\/events\?id=id%20%26%20extra%3D1"/)
})
