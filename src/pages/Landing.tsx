import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export function Landing() {
  const { configured, loading, user, profile, signIn, error } = useAuth()

  if (!loading && user && profile?.status === 'approved') {
    return <Navigate to="/app" replace />
  }
  if (!loading && user && profile && profile.status !== 'approved') {
    return <Navigate to="/pending" replace />
  }

  return (
    <section className="hero">
      <p className="muted" style={{ letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: '0.75rem' }}>
        РГПС · Бунт в Антарии
      </p>
      <h1 className="brand">Antaria Cabinet</h1>
      <p>
        Закрытый кабинет провинции: показатели, доска, приказы и отношения. Данные хранятся на вашем
        Google Drive. В публичном репозитории — только код.
      </p>
      <div className="btn-row">
        {!configured ? (
          <p className="error">
            Firebase не настроен. Скопируйте <code>.env.example</code> → <code>.env.local</code> и
            заполните ключи.
          </p>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading}
            onClick={() => void signIn().catch((e: unknown) => console.error(e))}
          >
            Войти через Google
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
