import { useEffect, useState } from 'react'
import { useCabinet } from '../cabinet/CabinetProvider'
import { loadCharacterAvatar, type AvatarSource } from '../lib/characterAvatar'

export function CharacterAvatar({
  className,
  ...avatar
}: AvatarSource & { className: string }) {
  const { ensureToken } = useCabinet()
  return <AvatarImage key={`${avatar.avatarFileId || ''}:${avatar.avatarUrl || ''}`}
    {...avatar} className={className} getAccessToken={ensureToken} />
}

function AvatarImage({
  avatarFileId,
  avatarUrl,
  className,
  getAccessToken,
}: AvatarSource & { className: string; getAccessToken: () => Promise<string> }) {
  const [image, setImage] = useState<{
    src?: string
    failed?: boolean
    getAccessToken?: () => Promise<string>
  }>({})

  useEffect(() => {
    let active = true
    let generation = 0
    let release: (() => void) | undefined
    if (!avatarFileId) return
    const load = () => {
      const request = ++generation
      void loadCharacterAvatar({ avatarFileId }, getAccessToken).then((loaded) => {
        if (!active || request !== generation) {
          loaded.release()
          return
        }
        release?.()
        release = loaded.release
        setImage({ src: loaded.src, getAccessToken })
      }).catch(() => {
        if (active && request === generation) setImage({ failed: true, getAccessToken })
      })
    }
    load()
    window.addEventListener('antaria:drive-access-restored', load)
    return () => {
      active = false
      window.removeEventListener('antaria:drive-access-restored', load)
      release?.()
    }
  }, [avatarFileId, getAccessToken])

  const currentImage = !avatarFileId || image.getAccessToken === getAccessToken ? image : {}
  const src = avatarFileId
    ? currentImage.src
    : avatarUrl
  if (!src || currentImage.failed) {
    return <span className={`${className} is-empty`} aria-hidden
      title={currentImage.failed ? 'Не удалось загрузить аватар' : undefined} />
  }
  return <img key={src} className={className} src={src} alt=""
    onError={() => setImage({ failed: true, getAccessToken })} />
}
