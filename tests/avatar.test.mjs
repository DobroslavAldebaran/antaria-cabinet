import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadCharacterAvatar } from '../src/lib/characterAvatar.ts'
import { uploadMediaFile } from '../src/lib/drive.ts'
import { buildResponsibleOptions } from '../src/schema/responsible.ts'

test('an uploaded avatar loads authenticated Drive media instead of its old hotlink', async (t) => {
  const calls = []
  const image = new Blob(['avatar pixels'], { type: 'image/png' })
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init })
    return new Response(image)
  })
  let loadedBlob
  t.mock.method(URL, 'createObjectURL', (blob) => {
    loadedBlob = blob
    return 'blob:avatar-preview'
  })
  const revoked = []
  t.mock.method(URL, 'revokeObjectURL', (url) => revoked.push(url))
  const result = await loadCharacterAvatar({
    avatarFileId: 'saved-avatar',
    avatarUrl: 'https://drive.google.com/uc?export=view&id=saved-avatar',
  }, async () => 'drive-token')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://www.googleapis.com/drive/v3/files/saved-avatar?alt=media')
  assert.equal(calls[0].init.headers.get('Authorization'), 'Bearer drive-token')
  assert.equal(await loadedBlob.text(), 'avatar pixels')
  assert.equal(result.src, 'blob:avatar-preview')
  assert.doesNotMatch(result.src, /drive-token/)
  result.release()
  assert.deepEqual(revoked, ['blob:avatar-preview'])
})

test('external avatars remain usable without requesting Drive access', async () => {
  const result = await loadCharacterAvatar({ avatarUrl: 'https://example.com/avatar.png' }, async () => {
    assert.fail('external image must not trigger authorization')
  })
  assert.equal(result.src, 'https://example.com/avatar.png')
  result.release()
  const empty = await loadCharacterAvatar({}, async () => assert.fail('no image requires no token'))
  assert.equal(empty.src, undefined)
})

test('a failed media request does not fall back to a broken public Drive URL', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('File not found', { status: 404 }))
  t.mock.method(URL, 'createObjectURL', () => assert.fail('failed responses must not become image URLs'))
  await assert.rejects(loadCharacterAvatar({
    avatarFileId: 'missing', avatarUrl: 'https://drive.google.com/uc?id=missing',
  }, async () => 'token'), /Drive API 404/)
})

test('character avatar uploads keep the image private while editor images retain public access', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init })
    return Response.json({ id: 'uploaded-avatar' })
  })
  const image = new Blob(['image'], { type: 'image/png' })
  const avatar = await uploadMediaFile('token', 'media-folder', image, 'avatar.png', 'image/png', { publicRead: false })
  assert.equal(avatar.id, 'uploaded-avatar')
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /uploadType=multipart/)
  await uploadMediaFile('token', 'media-folder', image, 'editor.png', 'image/png')
  assert.equal(calls.length, 3)
  assert.match(calls[2].url, /\/uploaded-avatar\/permissions$/)
})

test('responsible pickers retain the Drive avatar ID for managers and other characters', () => {
  const characters = [
    { id: 'manager', name: 'Manager', caption: '', avatarFileId: 'manager-avatar' },
    { id: 'other', name: 'Other', caption: '', avatarFileId: 'other-avatar' },
  ]
  const options = buildResponsibleOptions([
    { id: 'ministry', name: 'Ministry', managerCharacterId: 'manager' },
  ], characters, [])
  assert.equal(options.find((o) => o.id === 'manager').avatarFileId, 'manager-avatar')
  assert.equal(options.find((o) => o.id === 'other').avatarFileId, 'other-avatar')
})
