import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { OrdersTurnSchema, ResponsibleOthersSchema } from '../src/schema/province.ts'
import { readOrdersDraft } from '../src/lib/ordersDraftStorage.ts'
import { createHookHarness, createVirtualBrowser } from './helpers/hook-harness.mjs'
import { createMemoryStorage } from './helpers/memory-storage.mjs'

const mocks = new Map([
  ['react', ['useState', 'useRef', 'useEffect', 'useCallback', 'useMemo'].map((name) =>
    `export const ${name} = (...args) => globalThis.__draftHookRuntime.${name}(...args);`).join('\n')],
  ['react-router-dom', 'export const useSearchParams = () => [globalThis.__ordersTest.searchParams];'],
  ['../auth/AuthProvider', 'export const useAuth = () => globalThis.__ordersTest.auth;'],
  ['../cabinet/CabinetProvider', 'export const useCabinet = () => globalThis.__ordersTest.cabinet;'],
  ['../lib/drive', `export const saveAllOrdersTurns = (...args) => globalThis.__ordersTest.saveOrders(...args);
    export const saveResponsibleOthers = (...args) => globalThis.__ordersTest.saveOthers(...args);`],
])
for (const name of ['EffectsEditor', 'MasterDetailList', 'OrderExport', 'ResponsiblePicker', 'RichTextEditor']) {
  mocks.set(`../components/${name}`, `export function ${name}() { return null }`)
}
mocks.set('./Onboarding', 'export function Onboarding() { return null }')
registerHooks({
  resolve(specifier, context, nextResolve) {
    const target = context.parentURL?.endsWith('/src/pages/OrdersPage.tsx') ||
      (specifier === 'react' && context.parentURL?.endsWith('/src/hooks/useDraftAutosave.ts'))
    if (target && mocks.has(specifier)) {
      return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
const { OrdersPage } = await import('../src/pages/OrdersPage.tsx')
const at = '2026-01-01T00:00:00Z'
const orders = () => [OrdersTurnSchema.parse({ schemaVersion: 1, turn: 7, updatedAt: at,
  items: [{ id: 'order-a', title: 'Order A', body: 'remote order text' }],
})]
const cabinetData = (packs = orders()) => ({
  orders: packs, responsibleOthers: ResponsibleOthersSchema.parse({ schemaVersion: 1, updatedAt: at }),
  meta: { currentTurn: 7 }, indicators: { metrics: [], ledger: [] }, verdicts: [],
  ministries: { items: [] }, characters: { items: [] },
})
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!node || typeof node !== 'object' || !node.props) return []
  return [node, ...elements(node.props.children)]
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  return node?.props ? text(node.props.children) : ''
}
function component(harness, name) {
  const found = elements(harness.result).find((element) => element.type?.name === name)
  assert.ok(found, `${name} should be present in the rendered page`)
  return found
}
function button(harness, label) {
  const found = elements(harness.result).find((element) => element.type === 'button' && text(element) === label)
  assert.ok(found, `Button ${label} should be present in the rendered page`)
  return found
}
function setup(t, options = {}) {
  const originalStorage = globalThis.localStorage
  const browser = createVirtualBrowser()
  globalThis.localStorage = createMemoryStorage()
  let harness
  let stateSetter
  let latestData
  const driver = {
    searchParams: new URLSearchParams(), auth: { user: { uid: 'user-a' } }, writes: [],
    ensureToken: options.ensureToken ?? (async () => 'valid-drive-token'),
    async saveOrders(token, folderId, next, previousTurns) {
      driver.writes.push({ token, folderId, next: structuredClone(next), previousTurns: [...previousTurns] })
      await options.saveOrders?.(token, folderId, next, previousTurns)
    },
    saveOthers: options.saveOthers ?? (async () => {}),
  }
  globalThis.__ordersTest = driver
  const mount = (data = cabinetData(options.orders)) => {
    harness = createHookHarness(({ uid, folderId }) => {
      const [current, setData] = globalThis.__draftHookRuntime.useState(data)
      latestData = current
      stateSetter = setData
      if (driver.auth.user.uid !== uid) driver.auth = { user: { uid } }
      driver.cabinet = { binding: { folderId }, data: current, setData, busy: false, ensureToken: driver.ensureToken }
      return OrdersPage()
    }, { uid: 'user-a', folderId: 'folder-a' })
  }
  mount()
  t.after(() => {
    harness.unmount()
    browser.restore()
    globalThis.localStorage = originalStorage
    delete globalThis.__ordersTest
  })
  return {
    browser, driver,
    get harness() { return harness },
    get data() { return latestData },
    edit(body) { component(harness, 'RichTextEditor').props.onChange(body) },
    remount(data) { harness.unmount(); mount(data) },
    switchFolder(folderId, data) { stateSetter(data); harness.render({ folderId }) },
  }
}

test('every order edit gets a browser copy even when its Drive token has expired', async (t) => {
  const ctx = setup(t, { ensureToken: async () => { throw new Error('Drive access expired') } })
  ctx.edit('first protected edit')
  assert.equal(readOrdersDraft('user-a', 'folder-a').value.orders[0].items[0].body, 'first protected edit')
  await ctx.harness.settle()
  await ctx.browser.advance(1500, ctx.harness)
  assert.match(text(ctx.harness.result), /Не удалось сохранить на Drive: Drive access expired/)
  ctx.edit('second protected edit')
  assert.equal(readOrdersDraft('user-a', 'folder-a').value.orders[0].items[0].body, 'second protected edit')
  await ctx.harness.settle()
  await ctx.browser.advance(1500, ctx.harness)
  assert.equal(ctx.data.orders[0].items[0].body, 'second protected edit')
  assert.equal(ctx.driver.writes.length, 0)
})

test('remount restores a local draft and autosaves it without another keystroke', async (t) => {
  const ctx = setup(t)
  ctx.edit('recovered order text')
  await ctx.harness.settle()
  ctx.remount(cabinetData())
  assert.equal(component(ctx.harness, 'RichTextEditor').props.value, 'recovered order text')
  assert.match(text(ctx.harness.result), /Восстановлен черновик приказов/)
  await ctx.browser.advance(1500, ctx.harness)
  assert.equal(ctx.driver.writes[0].next[0].items[0].body, 'recovered order text')
  assert.equal(readOrdersDraft('user-a', 'folder-a'), null)
})

test('an older autosave completion preserves edits typed while the request was pending', async (t) => {
  const pending = deferred()
  let requests = 0
  const ctx = setup(t, { saveOrders: async () => { if (++requests === 1) await pending.promise } })
  ctx.edit('earlier text')
  await ctx.harness.settle()
  await ctx.browser.advance(1500, ctx.harness)
  ctx.edit('latest text')
  await ctx.harness.settle()
  pending.resolve()
  await ctx.harness.settle()
  assert.equal(ctx.data.orders[0].items[0].body, 'latest text')
  assert.equal(readOrdersDraft('user-a', 'folder-a').value.orders[0].items[0].body, 'latest text')
  assert.doesNotMatch(text(ctx.harness.result), /Черновик сохранён на Drive/)
  await ctx.browser.advance(1500, ctx.harness)
  assert.equal(ctx.driver.writes[1].next[0].items[0].body, 'latest text')
  assert.equal(readOrdersDraft('user-a', 'folder-a'), null)
})

test('manual save completion does not revert text entered while saving', async (t) => {
  const pending = deferred()
  let requests = 0
  const ctx = setup(t, { saveOrders: async () => { if (++requests === 1) await pending.promise } })
  ctx.edit('manual save snapshot')
  await ctx.harness.settle()
  button(ctx.harness, 'Сохранить').props.onClick()
  await ctx.harness.settle()
  ctx.edit('typed during manual save')
  await ctx.harness.settle()
  pending.resolve()
  await ctx.harness.settle()
  assert.equal(ctx.data.orders[0].items[0].body, 'typed during manual save')
  assert.equal(readOrdersDraft('user-a', 'folder-a').value.orders[0].items[0].body, 'typed during manual save')
  await ctx.browser.advance(1500, ctx.harness)
  assert.equal(ctx.driver.writes[1].next[0].items[0].body, 'typed during manual save')
  assert.equal(readOrdersDraft('user-a', 'folder-a'), null)
})

test('adding and selecting a responsible person in one event preserves both draft changes', async (t) => {
  const ctx = setup(t)
  const picker = component(ctx.harness, 'ResponsiblePicker')
  const next = { ...ctx.data.responsibleOthers, items: [{ id: 'other-new', name: 'New responsible', at }] }
  // ResponsiblePicker.addOther invokes these two callbacks in the same event.
  picker.props.onOthersChange(next)
  picker.props.onChange('other-new')
  await ctx.harness.settle()
  assert.equal(ctx.data.orders[0].items[0].responsible, 'other-new')
  assert.deepEqual(ctx.data.responsibleOthers.items, next.items)
  await ctx.browser.advance(1500, ctx.harness)
  assert.equal(readOrdersDraft('user-a', 'folder-a'), null)
})

test('successful Drive save after a storage quota failure does not recover stale text on remount', async (t) => {
  const ctx = setup(t)
  ctx.edit('old local copy')
  await ctx.harness.settle()
  const storage = globalThis.localStorage
  const originalSetItem = storage.setItem
  storage.setItem = () => { throw new Error('Quota exceeded') }
  ctx.edit('latest text despite local quota failure')
  await ctx.harness.settle()
  assert.match(text(ctx.harness.result), /Не удалось сохранить копию в браузере/)
  button(ctx.harness, 'Сохранить').props.onClick()
  await ctx.harness.settle()
  assert.equal(ctx.driver.writes[0].next[0].items[0].body, 'latest text despite local quota failure')
  assert.equal(readOrdersDraft('user-a', 'folder-a'), null)
  storage.setItem = originalSetItem
  ctx.remount(structuredClone(ctx.data))
  assert.equal(component(ctx.harness, 'RichTextEditor').props.value, 'latest text despite local quota failure')
  assert.doesNotMatch(text(ctx.harness.result), /Восстановлен черновик приказов/)
})

test('deleting the last local order still sends its persisted turn for removal on Drive', async (t) => {
  const ctx = setup(t)
  button(ctx.harness, 'Удалить').props.onClick()
  const local = readOrdersDraft('user-a', 'folder-a')
  assert.deepEqual(local.value.orders, [])
  assert.deepEqual(local.persistedTurns, [7])
  await ctx.harness.settle()
  ctx.remount(cabinetData())
  await ctx.browser.advance(1500, ctx.harness)
  assert.deepEqual(ctx.driver.writes[0].next, [])
  assert.deepEqual(ctx.driver.writes[0].previousTurns, [7])
  assert.equal(readOrdersDraft('user-a', 'folder-a'), null)
})

test('partial writes retain newly created turns so deleting their orders cannot leave orphan files', async (t) => {
  let attempts = 0
  const ctx = setup(t, { orders: [], saveOthers: async () => { if (++attempts === 1) throw new Error('Other document write failed') } })
  component(ctx.harness, 'MasterDetailList').props.onCreate()
  await ctx.harness.settle()
  await ctx.browser.advance(1500, ctx.harness)
  assert.match(text(ctx.harness.result), /Other document write failed/)
  assert.deepEqual(readOrdersDraft('user-a', 'folder-a').persistedTurns, [7])
  button(ctx.harness, 'Удалить').props.onClick()
  await ctx.harness.settle()
  await ctx.browser.advance(1500, ctx.harness)
  assert.deepEqual(ctx.driver.writes[1].next, [])
  assert.deepEqual(ctx.driver.writes[1].previousTurns, [7])
})

test('completion from another folder cannot overwrite the current folder deletion bookkeeping', async (t) => {
  const pending = deferred()
  let requests = 0
  const ctx = setup(t, { saveOrders: async () => { if (++requests === 1) await pending.promise } })
  ctx.edit('folder A text')
  await ctx.harness.settle()
  await ctx.browser.advance(1500, ctx.harness)
  const folderBOrders = orders().map((pack) => ({ ...pack, turn: 12 }))
  ctx.switchFolder('folder-b', cabinetData(folderBOrders))
  pending.resolve()
  await ctx.harness.settle()
  button(ctx.harness, 'Удалить').props.onClick()
  await ctx.harness.settle()
  await ctx.browser.advance(1500, ctx.harness)
  assert.equal(ctx.driver.writes[1].folderId, 'folder-b')
  assert.deepEqual(ctx.driver.writes[1].previousTurns, [12])
})
