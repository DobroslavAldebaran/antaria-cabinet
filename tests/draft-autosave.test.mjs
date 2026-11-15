import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { createHookHarness, createVirtualBrowser } from './helpers/hook-harness.mjs'

// Substitute only React's lifecycle primitives. Execute the application's actual hook.
const reactStub = `export const useState = (...a) => globalThis.__draftHookRuntime.useState(...a);
export const useRef = (...a) => globalThis.__draftHookRuntime.useRef(...a);
export const useEffect = (...a) => globalThis.__draftHookRuntime.useEffect(...a);
export const useCallback = (...a) => globalThis.__draftHookRuntime.useCallback(...a);`
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'react' && context.parentURL?.endsWith('/src/hooks/useDraftAutosave.ts')) {
      return { url: `data:text/javascript,${encodeURIComponent(reactStub)}`, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
const { useDraftAutosave } = await import('../src/hooks/useDraftAutosave.ts')
const delayMs = 10
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
function setup(t, onSave) {
  const browser = createVirtualBrowser()
  const harness = createHookHarness(useDraftAutosave, { value: 'saved', resetKey: 'folder-a', delayMs, onSave })
  t.after(() => { harness.unmount(); browser.restore() })
  return { harness, browser }
}

test('a failed Drive draft save exposes the error and retains unsaved changes', async (t) => {
  let attempts = 0
  const { harness, browser } = setup(t, async () => {
    attempts++
    throw new Error('Drive API 401: expired access')
  })
  harness.render({ value: 'unsaved order text' })
  await browser.advance(delayMs, harness)
  assert.equal(harness.result.phase, 'error')
  assert.equal(harness.result.saveError, 'Drive API 401: expired access')
  assert.equal(harness.result.dirty, true)
  assert.equal(harness.result.valueRef.current, 'unsaved order text')
  await browser.advance(delayMs * 100, harness)
  assert.equal(attempts, 1, 'a rejected token must not cause an endless retry loop')
})

test('retryAutosave writes the latest edit and clears the previous save error', async (t) => {
  const writes = []
  let fail = true
  const { harness, browser } = setup(t, async (value) => {
    writes.push(value)
    if (fail) throw new Error('Access expired')
    harness.result.markSaved(value, 'draft')
  })
  harness.render({ value: 'first draft' })
  await browser.advance(delayMs, harness)
  fail = false
  harness.render({ value: 'latest draft' })
  harness.result.retryAutosave()
  await harness.settle()
  await browser.advance(delayMs, harness)
  assert.deepEqual(writes, ['first draft', 'latest draft'])
  assert.equal(harness.result.phase, 'draft')
  assert.equal(harness.result.saveError, null)
  assert.equal(harness.result.dirty, false)
})

test('edits made during a pending save queue the latest value without overlapping writes', async (t) => {
  const firstSave = deferred()
  const writes = []
  let active = 0
  let maxActive = 0
  const { harness, browser } = setup(t, async (value) => {
    const markSaved = harness.result.markSaved
    active++
    maxActive = Math.max(maxActive, active)
    writes.push(value)
    if (writes.length === 1) await firstSave.promise
    active--
    // Mirror pages: never acknowledge an earlier snapshot as the current draft.
    if (harness.result.valueRef.current === value) markSaved(value, 'draft')
  })
  harness.render({ value: 'first draft' })
  await browser.advance(delayMs, harness)
  assert.equal(harness.result.phase, 'saving')
  harness.render({ value: 'latest draft' })
  await browser.advance(delayMs * 2, harness)
  assert.deepEqual(writes, ['first draft'])
  firstSave.resolve()
  await harness.settle()
  assert.equal(harness.result.dirty, true)
  await browser.advance(delayMs, harness)
  assert.deepEqual(writes, ['first draft', 'latest draft'])
  assert.equal(maxActive, 1)
  assert.equal(harness.result.dirty, false)
})

test('completion from an old folder cannot change the new folder baseline or status', async (t) => {
  const pending = deferred()
  const { harness, browser } = setup(t, async (value) => {
    const oldMarkSaved = harness.result.markSaved
    await pending.promise
    oldMarkSaved(value, 'draft')
  })
  harness.render({ value: 'folder A draft' })
  await browser.advance(delayMs, harness)
  harness.render({ resetKey: 'folder-b', value: 'folder B saved order' })
  assert.equal(harness.result.dirty, false)
  pending.resolve()
  await harness.settle()
  assert.equal(harness.result.valueRef.current, 'folder B saved order')
  assert.equal(harness.result.dirty, false)
  assert.equal(harness.result.phase, 'idle')
  assert.equal(harness.result.saveError, null)
})

test('restoring Drive access retries a failed autosave without requiring another edit', async (t) => {
  let online = false
  const writes = []
  const { harness, browser } = setup(t, async (value) => {
    writes.push(value)
    if (!online) throw new Error('Access expired')
    harness.result.markSaved(value, 'draft')
  })
  harness.render({ value: 'protected draft' })
  await browser.advance(delayMs, harness)
  online = true
  browser.dispatch('antaria:drive-access-restored')
  await harness.settle()
  await browser.advance(delayMs, harness)
  assert.deepEqual(writes, ['protected draft', 'protected draft'])
  assert.equal(harness.result.dirty, false)
  assert.equal(harness.result.saveError, null)
})

test('disabled autosave waits and resumes with the latest value when enabled', async (t) => {
  const writes = []
  const { harness, browser } = setup(t, async (value) => {
    writes.push(value)
    harness.result.markSaved(value, 'draft')
  })
  harness.render({ enabled: false, value: 'first draft' })
  await browser.advance(delayMs, harness)
  harness.render({ value: 'latest draft' })
  await browser.advance(delayMs, harness)
  assert.deepEqual(writes, [])
  assert.equal(harness.result.dirty, true)
  harness.render({ enabled: true })
  await browser.advance(delayMs, harness)
  assert.deepEqual(writes, ['latest draft'])
  assert.equal(harness.result.dirty, false)
})
