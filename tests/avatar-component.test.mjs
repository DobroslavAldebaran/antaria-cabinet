import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { createHookHarness, createVirtualBrowser } from './helpers/hook-harness.mjs'

const mocks = new Map([
  ['react', `export const useState = (...args) => globalThis.__draftHookRuntime.useState(...args);
    export const useEffect = (...args) => globalThis.__draftHookRuntime.useEffect(...args);`],
  ['../cabinet/CabinetProvider', 'export const useCabinet = () => globalThis.__avatarCabinet;'],
  ['../lib/characterAvatar', 'export const loadCharacterAvatar = (...args) => globalThis.__avatarLoad(...args);'],
])
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith('/src/components/CharacterAvatar.tsx') && mocks.has(specifier)) {
      return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
const { CharacterAvatar } = await import('../src/components/CharacterAvatar.tsx')

function setup(t, load, props = {}) {
  const browser = createVirtualBrowser()
  globalThis.__avatarCabinet = { ensureToken: async () => 'test-token' }
  globalThis.__avatarLoad = load
  const harness = createHookHarness((avatar) => {
    const image = CharacterAvatar(avatar)
    return image.type(image.props)
  }, { avatarFileId: 'drive-avatar', className: 'entity-picker-avatar', ...props })
  t.after(() => { harness.unmount(); browser.restore() })
  return { harness, browser }
}

test('avatar previews replace loading placeholders with blob images and release URLs on unmount', async (t) => {
  const released = []
  const { harness } = setup(t, async () => ({ src: 'blob:loaded-avatar', release: () => released.push('blob:loaded-avatar') }))
  assert.equal(harness.result.type, 'span')
  await harness.settle()
  assert.equal(harness.result.type, 'img')
  assert.equal(harness.result.props.src, 'blob:loaded-avatar')
  harness.unmount()
  assert.deepEqual(released, ['blob:loaded-avatar'])
})

test('a preview removed during loading releases the late blob without showing the stale image', async (t) => {
  let complete
  let released = 0
  const { harness } = setup(t, () => new Promise((resolve) => { complete = resolve }))
  harness.unmount()
  complete({ src: 'blob:late-avatar', release: () => released++ })
  await harness.settle()
  assert.equal(released, 1)
  assert.equal(harness.result.type, 'span')
})

test('restoring Drive access retries a failed avatar without a page reload or a retry loop', async (t) => {
  let attempts = 0
  const { harness, browser } = setup(t, async () => {
    if (++attempts === 1) throw new Error('Expired token')
    return { src: 'blob:restored-avatar', release() {} }
  })
  await harness.settle()
  assert.equal(harness.result.type, 'span')
  assert.equal(harness.result.props.title, 'Не удалось загрузить аватар')
  assert.equal(attempts, 1)
  browser.dispatch('antaria:drive-access-restored')
  await harness.settle()
  assert.equal(harness.result.type, 'img')
  assert.equal(harness.result.props.src, 'blob:restored-avatar')
  assert.equal(attempts, 2)
})

test('an invalid external avatar becomes a placeholder instead of a broken-image icon', async (t) => {
  const { harness } = setup(t, async () => assert.fail('external avatar needs no Drive request'), {
    avatarFileId: undefined, avatarUrl: 'https://example.com/missing.png',
  })
  assert.equal(harness.result.type, 'img')
  harness.result.props.onError()
  await harness.settle()
  assert.equal(harness.result.type, 'span')
  assert.equal(harness.result.props.className, 'entity-picker-avatar is-empty')
})
