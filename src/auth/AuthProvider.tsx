import {
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut as firebaseSignOut,
  type AuthError,
  type User,
} from 'firebase/auth'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { isFirebaseConfigured } from '../lib/config'
import { getFirebaseAuth } from '../lib/firebase'
import { DRIVE_SCOPE } from '../lib/drive'
import {
  DRIVE_ACCESS_REJECTED_EVENT,
  DRIVE_ACCESS_RESTORED_EVENT,
  DRIVE_TOKEN_EXPIRY_MARGIN_MS,
  DriveAccessRequiredError,
  readDriveAccessExpiry,
  usableDriveAccess,
  type DriveAccess,
} from '../lib/driveAccess'
import {
  ensureUserRegistry,
  getAppUser,
  getSettings,
} from '../lib/registry'
import type { AppSettings, AppUser } from '../schema/registry'

const POPUP_BLOCKED_MSG =
  'Окно Google заблокировано браузером. Разрешите всплывающие окна и нажмите «Обновить доступ к Drive».'

function getAuthErrorCode(e: unknown): string | null {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const code = (e as AuthError).code
    return typeof code === 'string' ? code : null
  }
  return null
}

type AuthContextValue = {
  configured: boolean
  loading: boolean
  user: User | null
  profile: AppUser | null
  settings: AppSettings | null
  accessToken: string | null
  error: string | null
  driveRefreshing: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  refreshDriveToken: () => Promise<string>
  ensureDriveToken: () => Promise<string>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured()
  const [loading, setLoading] = useState(configured)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<AppUser | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [driveRefreshing, setDriveRefreshing] = useState(false)
  const [tokenExpiry, setTokenExpiry] = useState<number | null>(null)
  const driveAccess = useRef<DriveAccess | null>(null)
  const tokenRequest = useRef<Promise<string> | null>(null)
  const sessionUser = useRef<User | null | undefined>(undefined)

  const clearDriveAccess = useCallback(() => {
    driveAccess.current = null
    setAccessToken(null)
    setTokenExpiry(null)
  }, [])

  const rememberDriveAccess = useCallback(async (token: string, uid: string) => {
    const expiresAt = await readDriveAccessExpiry(token)
    if (getFirebaseAuth().currentUser?.uid !== uid) throw new Error('Сессия пользователя изменилась')
    driveAccess.current = { token, uid, expiresAt }
    setAccessToken(token)
    setTokenExpiry(expiresAt)
    setError(null)
    return token
  }, [])

  // Expiry and rejected API requests only disconnect Drive; they never close an editor.
  useEffect(() => {
    const rejected = (event: Event) => {
      if ((event as CustomEvent<string>).detail === driveAccess.current?.token) {
        clearDriveAccess()
      }
    }
    window.addEventListener(DRIVE_ACCESS_REJECTED_EVENT, rejected)
    return () => window.removeEventListener(DRIVE_ACCESS_REJECTED_EVENT, rejected)
  }, [clearDriveAccess])

  useEffect(() => {
    if (tokenExpiry == null) return
    const scheduledAccess = driveAccess.current
    const timer = window.setTimeout(() => {
      if (driveAccess.current === scheduledAccess) clearDriveAccess()
    }, Math.max(0, tokenExpiry - Date.now() - DRIVE_TOKEN_EXPIRY_MARGIN_MS))
    return () => window.clearTimeout(timer)
  }, [tokenExpiry, clearDriveAccess])

  const ensureDriveToken = useCallback(async () => {
    if (tokenRequest.current) return tokenRequest.current
    const uid = getFirebaseAuth().currentUser?.uid
    const access = driveAccess.current
    if (usableDriveAccess(access, uid)) return access.token
    clearDriveAccess()
    throw new DriveAccessRequiredError()
  }, [clearDriveAccess])

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null)
      setSettings(null)
      return
    }
    const [p, s] = await Promise.all([getAppUser(user.uid), getSettings()])
    setProfile(p)
    setSettings(s)
  }, [user])

  useEffect(() => {
    if (!configured) {
      setLoading(false)
      return
    }
    const auth = getFirebaseAuth()
    return onAuthStateChanged(auth, async (next) => {
      const previous = sessionUser.current
      // Reauthentication can notify observers for the same account. Keep gates and
      // editors mounted instead of replacing them with the loading screen.
      if (previous !== undefined && previous?.uid === next?.uid) {
        setUser(next)
        return
      }
      sessionUser.current = next
      clearDriveAccess()
      setLoading(true)
      setUser(next)
      try {
        if (next) {
          setError(null)
          const p = await ensureUserRegistry({
            uid: next.uid,
            email: next.email,
            displayName: next.displayName,
          })
          if (sessionUser.current !== next) return
          setProfile(p)
          const nextSettings = await getSettings()
          if (sessionUser.current !== next) return
          setSettings(nextSettings)
        } else {
          setProfile(null)
          setSettings(null)
          setAccessToken(null)
        }
      } catch (e) {
        if (sessionUser.current !== next) return
        setError(e instanceof Error ? e.message : 'Ошибка реестра')
        setProfile(null)
      } finally {
        if (sessionUser.current === next) setLoading(false)
      }
    })
  }, [configured, clearDriveAccess])

  const clearLocalSession = useCallback(() => {
    clearDriveAccess()
    setProfile(null)
    setSettings(null)
  }, [clearDriveAccess])

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth())
    clearLocalSession()
  }, [clearLocalSession])

  const signIn = useCallback(async () => {
    setError(null)
    const pending = (async () => {
      const auth = getFirebaseAuth()
      const provider = new GoogleAuthProvider()
      provider.addScope(DRIVE_SCOPE)
      provider.setCustomParameters({ prompt: 'select_account' })
      const result = await signInWithPopup(auth, provider)
      const cred = GoogleAuthProvider.credentialFromResult(result)
      if (!cred?.accessToken) throw new Error('Не удалось получить токен Drive')
      return rememberDriveAccess(cred.accessToken, result.user.uid)
    })()
    // Cabinet loading can start from the auth observer before the popup promise
    // resolves. Let it await the whole request instead of asking for another login.
    tokenRequest.current = pending
    try {
      await pending
    } catch (e) {
      if (getAuthErrorCode(e) === 'auth/popup-blocked') {
        setError(POPUP_BLOCKED_MSG)
        return
      }
      setError(e instanceof Error ? e.message : 'Ошибка входа')
      throw e
    } finally {
      if (tokenRequest.current === pending) tokenRequest.current = null
    }
  }, [rememberDriveAccess])

  // Call only from a visible button: browsers require a user gesture for OAuth.
  const refreshDriveToken = useCallback(() => {
    if (tokenRequest.current) return tokenRequest.current
    setDriveRefreshing(true)
    setError(null)
    const pending = (async () => {
      try {
        const auth = getFirebaseAuth()
        if (!auth.currentUser) throw new Error('Нет сессии')
        const provider = new GoogleAuthProvider()
        provider.addScope(DRIVE_SCOPE)
        if (auth.currentUser.email) provider.setCustomParameters({ login_hint: auth.currentUser.email })
        const result = await reauthenticateWithPopup(auth.currentUser, provider)
        const cred = GoogleAuthProvider.credentialFromResult(result)
        if (!cred?.accessToken) throw new Error('Не удалось получить токен Drive')
        const token = await rememberDriveAccess(cred.accessToken, result.user.uid)
        window.dispatchEvent(new Event(DRIVE_ACCESS_RESTORED_EVENT))
        return token
      } catch (e) {
        if (getAuthErrorCode(e) === 'auth/popup-blocked') {
          setError(POPUP_BLOCKED_MSG)
          throw new Error(POPUP_BLOCKED_MSG)
        }
        setError(e instanceof Error ? e.message : 'Не удалось обновить доступ к Drive')
        throw e
      } finally {
        setDriveRefreshing(false)
      }
    })()
    tokenRequest.current = pending
    void pending.finally(() => {
      if (tokenRequest.current === pending) tokenRequest.current = null
    }).catch(() => {})
    return pending
  }, [rememberDriveAccess])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      loading,
      user,
      profile,
      settings,
      accessToken,
      error,
      driveRefreshing,
      signIn,
      signOut,
      refreshProfile,
      refreshDriveToken,
      ensureDriveToken,
    }),
    [
      configured,
      loading,
      user,
      profile,
      settings,
      accessToken,
      error,
      driveRefreshing,
      signIn,
      signOut,
      refreshProfile,
      refreshDriveToken,
      ensureDriveToken,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth вне AuthProvider')
  return ctx
}
