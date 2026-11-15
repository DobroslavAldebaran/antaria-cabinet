import { readMediaBlob } from './drive'

export type AvatarSource = { avatarFileId?: string; avatarUrl?: string }

/** Keep Drive credentials out of image URLs and release temporary URLs after use. */
export async function loadCharacterAvatar(
  avatar: AvatarSource,
  getAccessToken: () => Promise<string>,
): Promise<{ src: string | undefined; release: () => void }> {
  if (!avatar.avatarFileId) {
    return { src: avatar.avatarUrl || undefined, release: () => {} }
  }
  const token = await getAccessToken()
  const blob = await readMediaBlob(token, avatar.avatarFileId)
  const src = URL.createObjectURL(blob)
  return { src, release: () => URL.revokeObjectURL(src) }
}
