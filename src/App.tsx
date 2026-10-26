import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { CabinetProvider } from './cabinet/CabinetProvider'
import { Layout } from './components/Layout'
import { RequireAdmin, RequireApproved, RequireAuth } from './components/Gate'
import { Admin } from './pages/Admin'
import { BoardPage } from './pages/BoardPage'
import { Dashboard } from './pages/Dashboard'
import { ImportExportPage } from './pages/ImportExportPage'
import { IndicatorsPage } from './pages/IndicatorsPage'
import { Landing } from './pages/Landing'
import { MapsPage } from './pages/MapsPage'
import { MilitaryPage } from './pages/MilitaryPage'
import { NewsPage } from './pages/NewsPage'
import { OrdersPage } from './pages/OrdersPage'
import { Pending } from './pages/Pending'
import { ProfilePage } from './pages/ProfilePage'
import { RelationsPage } from './pages/RelationsPage'

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
                  <Route path="indicators" element={<IndicatorsPage />} />
                  <Route path="military" element={<MilitaryPage />} />
                  <Route path="board" element={<BoardPage />} />
                  <Route path="orders" element={<OrdersPage />} />
                  <Route path="relations" element={<RelationsPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="maps" element={<MapsPage />} />
                  <Route path="news" element={<NewsPage />} />
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
