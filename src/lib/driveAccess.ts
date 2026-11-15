export const DRIVE_ACCESS_RESTORED_EVENT = 'antaria:drive-access-restored'
export const DRIVE_ACCESS_REJECTED_EVENT = 'antaria:drive-access-rejected'
export const DRIVE_TOKEN_EXPIRY_MARGIN_MS = 60_000

export class DriveAccessRequiredError extends Error {
  constructor() {
    super('Доступ к Google Drive истёк. Нажмите «Обновить доступ к Drive», затем повторите сохранение.')
    this.name = 'DriveAccessRequiredError'
  }
}

export type DriveAccess = { token: string; uid: string; expiresAt: number }

export function usableDriveAccess(
  access: DriveAccess | null,
  uid: string | null | undefined,
  now = Date.now(),
): access is DriveAccess {
  return Boolean(access && access.uid === uid && access.expiresAt > now + DRIVE_TOKEN_EXPIRY_MARGIN_MS)
}

/** Firebase exposes the provider token, but not its expiry in its public credential API. */
export async function readDriveAccessExpiry(token: string): Promise<number> {
  const requestedAt = Date.now()
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
    { cache: 'no-store', signal: AbortSignal.timeout(10_000) },
  )
  if (!response.ok) throw new DriveAccessRequiredError()
  const info = await response.json() as { expires_in?: string | number }
  const seconds = Number(info.expires_in)
  if (!Number.isFinite(seconds) || seconds <= DRIVE_TOKEN_EXPIRY_MARGIN_MS / 1000) {
    throw new DriveAccessRequiredError()
  }
  return requestedAt + seconds * 1000
}

/** Notify the session without coupling the Drive client to React or logging the token. */
export function rejectDriveAccess(token: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DRIVE_ACCESS_REJECTED_EVENT, { detail: token }))
  }
}
