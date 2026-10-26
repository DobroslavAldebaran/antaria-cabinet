import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { isFirebaseConfigured } from '../lib/config'
import { getFirebaseAuth } from '../lib/firebase'
import { DRIVE_SCOPE } from '../lib/drive'
import {
  ensureUserRegistry,
  getAppUser,
  getSettings,
} from '../lib/registry'
import type { AppSettings, AppUser } from '../schema/registry'

type AuthContextValue = {
  configured: boolean
  loading: boolean
  user: User | null
  profile: AppUser | null
  settings: AppSettings | null
  accessToken: string | null
  error: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  refreshDriveToken: () => Promise<string>
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
      setLoading(true)
      setError(null)
      setUser(next)
      try {
        if (next) {
          const p = await ensureUserRegistry({
            uid: next.uid,
            email: next.email,
            displayName: next.displayName,
          })
          setProfile(p)
          setSettings(await getSettings())
        } else {
          setProfile(null)
          setSettings(null)
          setAccessToken(null)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка реестра')
        setProfile(null)
      } finally {
        setLoading(false)
      }
    })
  }, [configured])

  const signIn = useCallback(async () => {
    setError(null)
    try {
      const auth = getFirebaseAuth()
      const provider = new GoogleAuthProvider()
      provider.addScope(DRIVE_SCOPE)
      provider.setCustomParameters({ prompt: 'select_account' })
      const result = await signInWithPopup(auth, provider)
      const cred = GoogleAuthProvider.credentialFromResult(result)
      if (cred?.accessToken) setAccessToken(cred.accessToken)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка входа')
      throw e
    }
  }, [])

  const refreshDriveToken = useCallback(async () => {
    const auth = getFirebaseAuth()
    if (!auth.currentUser) throw new Error('Нет сессии')
    const provider = new GoogleAuthProvider()
    provider.addScope(DRIVE_SCOPE)
    const result = await signInWithPopup(auth, provider)
    const cred = GoogleAuthProvider.credentialFromResult(result)
    if (!cred?.accessToken) throw new Error('Не удалось получить токен Drive')
    setAccessToken(cred.accessToken)
    return cred.accessToken
  }, [])

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth())
    setAccessToken(null)
    setProfile(null)
    setSettings(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      loading,
      user,
      profile,
      settings,
      accessToken,
      error,
      signIn,
      signOut,
      refreshProfile,
      refreshDriveToken,
    }),
    [
      configured,
      loading,
      user,
      profile,
      settings,
      accessToken,
      error,
      signIn,
      signOut,
      refreshProfile,
      refreshDriveToken,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth вне AuthProvider')
  return ctx
}
