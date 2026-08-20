import {
  BookOpen,
  HeartHandshake,
  Users,
} from 'lucide-react'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { RoleRoute } from './auth/RoleRoute'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { LoadingState } from './components/ui/Feedback'
import { AuthenticatedLayout } from './layouts/AuthenticatedLayout'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { LifeGroupsPage } from './pages/LifeGroupsPage'
import { ModulePlaceholderPage } from './pages/ModulePlaceholderPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { UnauthorizedPage } from './pages/UnauthorizedPage'
import { ThemeProvider } from './theme/ThemeContext'

const MembersPage = lazy(() =>
  import('./pages/MembersPage').then((module) => ({
    default: module.MembersPage,
  })),
)

const MinistriesPage = lazy(() =>
  import('./pages/MinistriesPage').then((module) => ({
    default: module.MinistriesPage,
  })),
)

const GatheringsPage = lazy(() =>
  import('./pages/GatheringsPage').then((module) => ({
    default: module.GatheringsPage,
  })),
)

const VisitorsPage = lazy(() =>
  import('./pages/VisitorsPage').then((module) => ({
    default: module.VisitorsPage,
  })),
)

const EventsPage = lazy(() =>
  import('./pages/EventsPage').then((module) => ({ default: module.EventsPage })),
)

const SundayServicePage = lazy(() =>
  import('./pages/SundayServicePage').then((module) => ({ default: module.SundayServicePage })),
)

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
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
                  <Suspense
                    fallback={
                      <LoadingState
                        title="Loading Members"
                        description="Preparing the Member directory."
                      />
                    }
                  >
                    <MembersPage />
                  </Suspense>
                }
              />
              <Route
                path="ministries"
                element={
                  <Suspense
                    fallback={
                      <LoadingState
                        title="Loading Ministries"
                        description="Preparing the Ministry directory."
                      />
                    }
                  >
                    <MinistriesPage />
                  </Suspense>
                }
              />
              <Route
                path="life-groups"
                element={<LifeGroupsPage />}
              />
              <Route
                path="life-groups/:lifeGroupId/gatherings"
                element={
                  <Suspense
                    fallback={
                      <LoadingState
                        title="Loading Gatherings"
                        description="Preparing this Life Group's meeting history."
                      />
                    }
                  >
                    <GatheringsPage />
                  </Suspense>
                }
              />
              <Route
                path="events"
                element={
                  <Suspense fallback={<LoadingState title="Loading Events" description="Preparing the Sunday Service directory." />}>
                    <EventsPage />
                  </Suspense>
                }
              />
              <Route
                path="events/:eventId"
                element={
                  <Suspense fallback={<LoadingState title="Loading Service" description="Preparing attendance and Sunday Visitors." />}>
                    <SundayServicePage />
                  </Suspense>
                }
              />
              <Route
                path="visitors"
                element={
                  <Suspense
                    fallback={
                      <LoadingState
                        title="Loading Visitors"
                        description="Preparing the Visitor directory."
                      />
                    }
                  >
                    <VisitorsPage />
                  </Suspense>
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
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
