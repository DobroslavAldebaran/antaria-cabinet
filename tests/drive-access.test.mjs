import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DRIVE_TOKEN_EXPIRY_MARGIN_MS,
  DriveAccessRequiredError,
  readDriveAccessExpiry,
  usableDriveAccess,
} from '../src/lib/driveAccess.ts'
import { loadCabinet } from '../src/lib/drive.ts'
import { emptyMeta } from '../src/schema/province.ts'

test('only a token for the current user with enough remaining lifetime is usable', () => {
  const now = Date.now()
  const access = { token: 'test-token', uid: 'user-a', expiresAt: now + DRIVE_TOKEN_EXPIRY_MARGIN_MS + 1 }
  assert.equal(usableDriveAccess(access, 'user-a', now), true)
  assert.equal(usableDriveAccess(access, 'user-b', now), false)
  assert.equal(usableDriveAccess(null, 'user-a', now), false)
  assert.equal(usableDriveAccess(access, 'user-a', now + 1), false)
})

test('the provider expiry is respected, without extending it to four hours', async (t) => {
  t.mock.method(Date, 'now', () => 1_000_000)
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://oauth2.googleapis.com/tokeninfo?access_token=test%20token')
    assert.equal(init.cache, 'no-store')
    return Response.json({ expires_in: '1800' })
  })
  assert.equal(await readDriveAccessExpiry('test token'), 2_800_000)
})

test('unknown or rejected token expiry cannot be treated as a valid long session', async (t) => {
  for (const response of [Response.json({}), Response.json({ expires_in: -1 }), Response.json({ expires_in: 60 }), new Response('', { status: 400 })]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => response)
    await assert.rejects(readDriveAccessExpiry('test-token'), DriveAccessRequiredError)
    mock.mock.restore()
  }
})

function mockCabinetRead(t, document, failure) {
  const files = [
    { id: 'meta', name: 'antaria.json' },
    { id: 'orders', name: 'orders' },
    { id: 'verdicts', name: 'verdicts' },
  ]
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.includes(`/${document}?alt=media`)) return failure()
    if (url.includes('/meta?alt=media')) return Response.json(emptyMeta())
    if (url.includes("q='orders'%20in%20parents")) return Response.json({ files: [{ id: 'order', name: 'turn-01.json' }] })
    if (url.includes("q='verdicts'%20in%20parents")) return Response.json({ files: [{ id: 'verdict', name: 'turn-01.json' }] })
    return Response.json({ files })
  })
}

test('an expired token during a document read aborts loading instead of returning empty defaults', async (t) => {
  mockCabinetRead(t, 'meta', () => new Response('', { status: 401 }))
  await assert.rejects(loadCabinet('expired-token', 'cabinet'), DriveAccessRequiredError)
})

test('a server error during a document read cannot erase the loaded document', async (t) => {
  mockCabinetRead(t, 'meta', () => new Response('', { status: 503 }))
  await assert.rejects(loadCabinet('test-token', 'cabinet'), /Drive API 503/)
})

test('a network failure while loading an order is not silently skipped', async (t) => {
  mockCabinetRead(t, 'order', () => { throw new TypeError('Network unavailable') })
  await assert.rejects(loadCabinet('test-token', 'cabinet'), /Network unavailable/)
})

test('a rejected token while loading a verdict is not silently skipped', async (t) => {
  mockCabinetRead(t, 'verdict', () => new Response('', { status: 401 }))
  await assert.rejects(loadCabinet('test-token', 'cabinet'), DriveAccessRequiredError)
})
