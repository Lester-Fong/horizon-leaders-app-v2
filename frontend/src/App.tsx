import {
  BookOpen,
  CalendarDays,
  HandHeart,
  HeartHandshake,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { RoleRoute } from './auth/RoleRoute'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { AuthenticatedLayout } from './layouts/AuthenticatedLayout'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { LifeGroupsPage } from './pages/LifeGroupsPage'
import { ModulePlaceholderPage } from './pages/ModulePlaceholderPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { UnauthorizedPage } from './pages/UnauthorizedPage'

function App() {
  return (
    <BrowserRouter>
      <AppErrorBoundary>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AuthenticatedLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route
                path="members"
                element={
                  <ModulePlaceholderPage
                    title="Members"
                    description="Member records and management belong to the approved Members feature phase."
                    icon={UsersRound}
                  />
                }
              />
              <Route
                path="ministries"
                element={
                  <ModulePlaceholderPage
                    title="Ministries"
                    description="Ministry structure and management will follow once its product rules are approved."
                    icon={HandHeart}
                  />
                }
              />
              <Route
                path="life-groups"
                element={<LifeGroupsPage />}
              />
              <Route
                path="events"
                element={
                  <ModulePlaceholderPage
                    title="Events"
                    description="Sunday Service, Harvest, and Other Event behavior is not implemented in this shell phase."
                    icon={CalendarDays}
                  />
                }
              />
              <Route
                path="visitors"
                element={
                  <ModulePlaceholderPage
                    title="Visitors"
                    description="Visitor records and conversion workflows remain in their approved future phase."
                    icon={UserPlus}
                  />
                }
              />
              <Route
                path="follow-up"
                element={
                  <ModulePlaceholderPage
                    title="Follow Up"
                    description="Shared pastoral follow-up workflows will be implemented only in the Follow Up phase."
                    icon={HeartHandshake}
                  />
                }
              />
              <Route
                path="opencell"
                element={
                  <ModulePlaceholderPage
                    title="OpenCell"
                    description="OpenCell Programmes, Sessions, and attendance remain intentionally deferred."
                    icon={BookOpen}
                  />
                }
              />
              <Route
                path="users"
                element={
                  <RoleRoute allowedRoles={['admin']}>
                    <ModulePlaceholderPage
                      title="Users"
                      description="Controlled staff-account management is reserved for a future Admin-only feature phase."
                      icon={Users}
                    />
                  </RoleRoute>
                }
              />
              <Route path="unauthorized" element={<UnauthorizedPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </AppErrorBoundary>
    </BrowserRouter>
  )
}

export default App
