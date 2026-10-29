import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { CabinetProvider } from './cabinet/CabinetProvider'
import { Layout } from './components/Layout'
import { RequireAdmin, RequireApproved, RequireAuth } from './components/Gate'
import { Admin } from './pages/Admin'
import { Dashboard } from './pages/Dashboard'
import { ImportExportPage } from './pages/ImportExportPage'
import { Landing } from './pages/Landing'
import { CharactersPage } from './pages/CharactersPage'
import { EventsPage } from './pages/EventsPage'
import { MinistriesPage } from './pages/MinistriesPage'
import { OrdersPage } from './pages/OrdersPage'
import { Pending } from './pages/Pending'
import { ProfilePage } from './pages/ProfilePage'
import { VerdictsPage } from './pages/VerdictsPage'

function CabinetLayout() {
  return (
    <CabinetProvider>
      <Outlet />
    </CabinetProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Landing />} />
            <Route element={<RequireAuth />}>
              <Route path="pending" element={<Pending />} />
              <Route element={<RequireApproved />}>
                <Route path="app" element={<CabinetLayout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="indicators" element={<Navigate to="/app" replace />} />
                  <Route path="military" element={<Navigate to="/app" replace />} />
                  <Route path="board" element={<Navigate to="/app" replace />} />
                  <Route path="orders" element={<OrdersPage />} />
                  <Route path="verdicts" element={<VerdictsPage />} />
                  <Route path="events" element={<EventsPage />} />
                  <Route path="characters" element={<CharactersPage />} />
                  <Route path="ministries" element={<MinistriesPage />} />
                  <Route path="relations" element={<Navigate to="/app" replace />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="maps" element={<Navigate to="/app" replace />} />
                  <Route path="news" element={<Navigate to="/app" replace />} />
                  <Route path="io" element={<ImportExportPage />} />
                </Route>
                <Route element={<RequireAdmin />}>
                  <Route path="admin" element={<Admin />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
