export type VkWallPost = {
  id: number
  date: number
  text: string
  url: string
}

type VkWallResponse = {
  response?: {
    items?: Array<{ id: number; date: number; text?: string; owner_id?: number }>
  }
  error?: { error_msg?: string; error_code?: number }
}

/**
 * VK API from the browser: JSONP (CORS-safe). Token stays client-side for approved users.
 */
export function wallGetJsonp(params: {
  ownerId: number
  accessToken: string
  count?: number
  apiVersion?: string
}): Promise<VkWallPost[]> {
  const count = params.count ?? 10
  const v = params.apiVersion ?? '5.199'
  const cbName = `__vkWallCb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const cleanup = () => {
      delete (window as unknown as Record<string, unknown>)[cbName]
      script.remove()
    }

    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('VK wall.get: timeout'))
    }, 12_000)

    ;(window as unknown as Record<string, unknown>)[cbName] = (data: VkWallResponse) => {
      window.clearTimeout(timer)
      cleanup()
      if (data.error) {
        reject(new Error(data.error.error_msg || `VK error ${data.error.error_code}`))
        return
      }
      const owner = params.ownerId
      const items = data.response?.items ?? []
      resolve(
        items.map((it) => ({
          id: it.id,
          date: it.date,
          text: (it.text || '').trim(),
          url: `https://vk.com/wall${owner}_${it.id}`,
        })),
      )
    }

    const q = new URLSearchParams({
      owner_id: String(params.ownerId),
      count: String(count),
      access_token: params.accessToken,
      v,
      callback: cbName,
    })
    script.src = `https://api.vk.com/method/wall.get?${q.toString()}`
    script.onerror = () => {
      window.clearTimeout(timer)
      cleanup()
      reject(new Error('VK wall.get: script load failed'))
    }
    document.body.appendChild(script)
  })
}

export function resolveVkOwnerId(groupId: string, screenName: string): number | null {
  const raw = groupId.trim()
  if (raw) {
    const n = Number(raw.replace(/^-/, ''))
    if (Number.isFinite(n) && n > 0) return -n
  }
  // screenName alone cannot resolve numeric id without API; caller uses widget by screenName
  void screenName
  return null
}
