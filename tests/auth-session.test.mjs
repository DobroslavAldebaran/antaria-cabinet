import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import {
  DRIVE_ACCESS_RESTORED_EVENT,
  DriveAccessRequiredError,
  rejectDriveAccess,
} from '../src/lib/driveAccess.ts'

// Exercise the real provider callbacks and effects without a browser or Firebase account.
const mocks = new Map([
  ['react', `
    export const createContext = () => ({ Provider: 'provider' });
    export const useCallback = (fn) => fn;
    export const useMemo = (fn) => fn();
    export const useContext = () => null;
    export const useRef = (...args) => globalThis.authHarness.useRef(...args);
    export const useState = (...args) => globalThis.authHarness.useState(...args);
    export const useEffect = (...args) => globalThis.authHarness.useEffect(...args);
  `],
  ['firebase/auth', `
    export class GoogleAuthProvider {
      addScope() {} setCustomParameters() {}
      static credentialFromResult(result) { return result.credential; }
    }
    export const onAuthStateChanged = (auth, callback) => {
      globalThis.authHarness.observer = callback;
      return () => {};
    };
    export const signInWithPopup = (...args) => globalThis.authHarness.signIn(...args);
    export const reauthenticateWithPopup = (...args) => globalThis.authHarness.reauthenticate(...args);
    export const signOut = () => { globalThis.authHarness.signOutCount++; };
  `],
  ['../lib/config', 'export const isFirebaseConfigured = () => true;'],
  ['../lib/firebase', 'export const getFirebaseAuth = () => globalThis.authHarness.auth;'],
  ['../lib/drive', "export const DRIVE_SCOPE = 'test-drive-scope';"],
  ['../lib/registry', `
    export const ensureUserRegistry = async () => globalThis.authHarness.registry
      ? globalThis.authHarness.registry()
      : ({ status: 'approved', role: 'user' });
    export const getAppUser = async () => ({ status: 'approved', role: 'user' });
    export const getSettings = async () => ({});
  `],
])
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith('/src/auth/AuthProvider.tsx') && mocks.has(specifier)) {
      return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
const { AuthProvider } = await import('../src/auth/AuthProvider.tsx')

const account = { uid: 'firebase-user', email: 'user@example.test', displayName: 'Test' }
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}

function harness(t) {
  const slots = []
  const effects = []
  let cursor = 0
  const timers = new Map()
  let timerId = 0
  const browser = Object.assign(new EventTarget(), {
    setTimeout(callback) { timers.set(++timerId, callback); return timerId },
    clearTimeout(id) { timers.delete(id) },
  })
  const state = {
    auth: { currentUser: null }, signOutCount: 0, signInCount: 0, refreshCount: 0,
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useEffect(callback, deps) {
      const index = cursor++
      const previous = slots[index]
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        effects.push(() => {
          previous?.cleanup?.()
          slots[index] = { deps, cleanup: callback() }
        })
      }
    },
    render() {
      cursor = 0
      const view = AuthProvider({ children: null }).props.value
      while (effects.length) effects.shift()()
      return view
    },
    async observe(user) {
      state.auth.currentUser = user
      await state.observer(user)
      return state.render()
    },
    async signIn() {
      state.signInCount++
      await state.observe(account)
      return { user: account, credential: { accessToken: 'login-token' } }
    },
    async reauthenticate() {
      state.refreshCount++
      await state.observe({ ...account })
      return { user: account, credential: { accessToken: `renewed-${state.refreshCount}` } }
    },
    expire() { for (const callback of [...timers.values()]) callback() },
  }
  globalThis.authHarness = state
  globalThis.window = browser
  t.mock.method(globalThis, 'fetch', async () => Response.json({ expires_in: 3600 }))
  state.render()
  t.after(() => {
    for (const slot of slots) slot?.cleanup?.()
    delete globalThis.authHarness
    delete globalThis.window
  })
  return state
}

test('an absent or expired Drive token requests reconnect without opening a background popup', async (t) => {
  const session = harness(t)
  let view = await session.observe(account)
  await assert.rejects(view.ensureDriveToken(), DriveAccessRequiredError)
  assert.equal(session.refreshCount, 0)
  assert.equal(session.signOutCount, 0)
  await view.refreshDriveToken()
  session.render()
  session.expire()
  view = session.render()
  await assert.rejects(view.ensureDriveToken(), DriveAccessRequiredError)
  assert.equal(view.user.uid, account.uid)
  assert.equal(view.profile.status, 'approved')
  assert.equal(view.loading, false)
  assert.equal(session.signOutCount, 0)
})

test('same-account reauthentication retains the editor gates and emits a retry event', async (t) => {
  const session = harness(t)
  let view = await session.observe(account)
  let restored = 0
  window.addEventListener(DRIVE_ACCESS_RESTORED_EVENT, () => restored++)
  await view.refreshDriveToken()
  view = session.render()
  assert.equal(view.loading, false)
  assert.equal(view.profile.status, 'approved')
  assert.equal(view.accessToken, 'renewed-1')
  assert.equal(restored, 1)
})

test('a repeated same-account notification during initial registry loading cannot leave gates stuck', async (t) => {
  const session = harness(t)
  const registry = deferred()
  session.registry = () => registry.promise
  const loading = session.observe(account)
  assert.equal(session.render().loading, true)
  await session.observe({ ...account })
  registry.resolve({ status: 'approved', role: 'user' })
  await loading
  assert.equal(session.render().loading, false)
  assert.equal(session.render().profile.status, 'approved')
})

test('a blocked renewal popup preserves the account, route and open editor', async (t) => {
  const session = harness(t)
  let view = await session.observe(account)
  session.reauthenticate = async () => { throw Object.assign(new Error('blocked'), { code: 'auth/popup-blocked' }) }
  await assert.rejects(view.refreshDriveToken(), /Окно Google заблокировано/)
  view = session.render()
  assert.equal(view.user.uid, account.uid)
  assert.equal(view.profile.status, 'approved')
  assert.equal(view.loading, false)
  assert.equal(session.signOutCount, 0)
  assert.match(view.error, /Разрешите всплывающие окна/)
})

test('initial cabinet loading waits for the in-flight sign-in provider token', async (t) => {
  const session = harness(t)
  const popup = deferred()
  session.signIn = async () => {
    session.signInCount++
    await session.observe(account)
    return popup.promise
  }
  const signingIn = session.render().signIn()
  await Promise.resolve()
  await Promise.resolve()
  const loadingToken = session.render().ensureDriveToken()
  popup.resolve({ user: account, credential: { accessToken: 'initial-token' } })
  assert.equal(await loadingToken, 'initial-token')
  await signingIn
  assert.equal(session.signInCount, 1)
  assert.equal(session.refreshCount, 0)
  assert.equal(session.render().loading, false)
})

test('concurrent renewal requests share one popup, and failed expiry checks retain a working token', async (t) => {
  const session = harness(t)
  let view = await session.observe(account)
  await view.refreshDriveToken()
  view = session.render()
  const popup = deferred()
  session.reauthenticate = () => {
    session.refreshCount++
    return popup.promise
  }
  const first = view.refreshDriveToken()
  const second = view.refreshDriveToken()
  assert.equal(first, second)
  popup.resolve({ user: account, credential: { accessToken: 'new-token' } })
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Network unavailable') })
  await assert.rejects(first, /Network unavailable/)
  assert.equal(await session.render().ensureDriveToken(), 'renewed-1')
  assert.equal(session.refreshCount, 2)
})

test('a late rejection for an old token cannot invalidate the replacement token', async (t) => {
  const session = harness(t)
  let view = await session.observe(account)
  await view.refreshDriveToken()
  view = session.render()
  await view.refreshDriveToken()
  view = session.render()
  rejectDriveAccess('renewed-1')
  assert.equal(await view.ensureDriveToken(), 'renewed-2')
  rejectDriveAccess('renewed-2')
  assert.equal(session.render().accessToken, null)
  await assert.rejects(view.ensureDriveToken(), DriveAccessRequiredError)
})
