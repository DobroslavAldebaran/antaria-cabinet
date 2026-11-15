import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { createHookHarness, createVirtualBrowser } from './helpers/hook-harness.mjs'

const mocks = new Map([
  ['react', `
    export const useState = (...args) => globalThis.__draftHookRuntime.useState(...args);
    export const useRef = (...args) => globalThis.__draftHookRuntime.useRef(...args);
    export const useEffect = (...args) => globalThis.__draftHookRuntime.useEffect(...args);
    export const useId = () => globalThis.__draftHookRuntime.useRef('export-id-' + globalThis.__exportIds++).current;
  `],
  ['../lib/orderDocument', 'export const makeOrdersDocx = (...args) => globalThis.__exportTest.makeDocx(...args);'],
  ['../lib/orderPdf', 'export const docxToPdf = (...args) => globalThis.__exportTest.makePdf(...args);'],
])
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith('/src/components/OrderExport.tsx') && mocks.has(specifier)) {
      return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
const { OrderExport } = await import('../src/components/OrderExport.tsx')

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
function button(harness, caption) {
  const found = elements(harness.result).find((node) => node.type === 'button' && text(node) === caption)
  assert.ok(found, `Button ${caption} should be present`)
  return found
}
function turnSelect(harness) {
  const select = elements(harness.result).find((node) => node.type === 'select')
  assert.ok(select, 'The export dialog should have a turn selector')
  const label = elements(harness.result).find((node) => node.type === 'label' && node.props.htmlFor === select.props.id)
  assert.equal(text(label), 'Ход')
  return select
}
function shownOrders(harness) {
  const group = elements(harness.result).find((node) => node.props['aria-label'] === 'Приказы для экспорта')
  assert.ok(group)
  return elements(group).filter((node) => node.type === 'label').map((label) => ({
    title: text(elements(label).find((node) => node.type === 'span')),
    checkbox: elements(label).find((node) => node.type === 'input' && node.props.type === 'checkbox'),
  }))
}
async function selectTurn(ctx, turn) {
  turnSelect(ctx.dialog).props.onChange({ target: { value: String(turn) } })
  await ctx.dialog.settle()
}
async function waitForDownload(ctx, caption) {
  button(ctx.dialog, caption).props.onClick()
  // Dynamic imports complete in a later event-loop turn, beyond hook microtasks.
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setImmediate(resolve))
    await ctx.dialog.settle()
    if (!button(ctx.dialog, caption).props.disabled) return
  }
  assert.fail('The document download did not finish')
}
async function setup(t, currentTurn = 0) {
  const browser = createVirtualBrowser()
  const original = { document: globalThis.document, createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL }
  const driver = {
    exports: [], pdfs: [], downloads: [],
    async makeDocx(title, orders) {
      driver.exports.push({ title, ids: orders.map((order) => order.id) })
      return new Blob(['docx'])
    },
    async makePdf(file) { driver.pdfs.push(file); return new Blob(['pdf']) },
  }
  globalThis.__exportIds = 0
  globalThis.__exportTest = driver
  URL.createObjectURL = () => 'blob:orders-export'
  URL.revokeObjectURL = () => {}
  globalThis.document = { createElement(tag) {
    assert.equal(tag, 'a')
    return { click() { driver.downloads.push(this.download) } }
  } }
  const rows = [[0, 'zero-a'], [0, 'zero-b'], [2, 'two-a'], [2, 'two-b'], [10, 'ten-a']]
    .map(([turn, id]) => ({ turn, item: { id, title: id, secret: false, military: false } }))
  const data = { meta: { currentTurn, provinceName: 'Test province' }, orders: [] }
  const parent = createHookHarness(OrderExport, { rows, data, getToken: async () => 'test-token' })
  let dialog
  t.after(() => {
    dialog?.unmount()
    parent.unmount()
    browser.restore()
    globalThis.document = original.document
    URL.createObjectURL = original.createObjectURL
    URL.revokeObjectURL = original.revokeObjectURL
    delete globalThis.__exportTest
    delete globalThis.__exportIds
  })
  button(parent, 'Экспорт обычных').props.onClick()
  await parent.settle()
  const dialogElement = elements(parent.result).find((node) => typeof node.type === 'function')
  assert.ok(dialogElement, 'Opening export should mount its dialog')
  dialog = createHookHarness(dialogElement.type, dialogElement.props)
  return { dialog, driver, browser }
}

test('export defaults to the current turn, including zero, and lists turns numerically', async (t) => {
  const ctx = await setup(t)
  assert.equal(turnSelect(ctx.dialog).props.value, '0')
  assert.deepEqual(shownOrders(ctx.dialog).map((row) => row.title), ['zero-a', 'zero-b'])
  const turnOptions = elements(turnSelect(ctx.dialog)).filter((node) => node.type === 'option')
  const values = turnOptions.map((option) => String(option.props.value))
  assert.deepEqual(values.filter((value) => value !== 'all'), ['10', '2', '0'])
  assert.ok(values.includes('all'))
})

test('a group without current-turn orders defaults to its most recent turn', async (t) => {
  const ctx = await setup(t, 8)
  assert.equal(turnSelect(ctx.dialog).props.value, '10')
  assert.deepEqual(shownOrders(ctx.dialog).map((row) => row.title), ['ten-a'])
})

test('choosing a turn filters the export list and all turns restores the full list', async (t) => {
  const ctx = await setup(t)
  await selectTurn(ctx, 2)
  assert.deepEqual(shownOrders(ctx.dialog).map((row) => row.title), ['two-a', 'two-b'])
  await selectTurn(ctx, 'all')
  assert.deepEqual(shownOrders(ctx.dialog).map((row) => row.title), ['zero-a', 'zero-b', 'two-a', 'two-b', 'ten-a'])
})

test('Word and PDF export only checked orders from the visible turn', async (t) => {
  const ctx = await setup(t)
  await selectTurn(ctx, 2)
  shownOrders(ctx.dialog)[0].checkbox.props.onChange({ target: { checked: false } })
  await ctx.dialog.settle()
  await waitForDownload(ctx, 'Скачать Word')
  await waitForDownload(ctx, 'Скачать PDF')
  assert.deepEqual(ctx.driver.exports.map((entry) => entry.ids), [['two-b'], ['two-b']])
  assert.equal(ctx.driver.pdfs.length, 1)
  assert.ok(ctx.driver.downloads[0].endsWith('.docx'))
  assert.ok(ctx.driver.downloads[1].endsWith('.pdf'))
})

test('select all operates on the visible turn and preserves selections on other turns', async (t) => {
  const ctx = await setup(t)
  button(ctx.dialog, 'Снять все отметки').props.onClick()
  await ctx.dialog.settle()
  assert.ok(shownOrders(ctx.dialog).every((row) => !row.checkbox.props.checked))
  assert.equal(button(ctx.dialog, 'Скачать Word').props.disabled, true)
  await selectTurn(ctx, 2)
  assert.ok(shownOrders(ctx.dialog).every((row) => row.checkbox.props.checked))
  await selectTurn(ctx, 0)
  assert.ok(shownOrders(ctx.dialog).every((row) => !row.checkbox.props.checked))
  button(ctx.dialog, 'Выбрать все').props.onClick()
  await ctx.dialog.settle()
  await selectTurn(ctx, 'all')
  assert.ok(shownOrders(ctx.dialog).every((row) => row.checkbox.props.checked))
})
