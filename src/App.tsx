import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './providers/AuthProvider'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RedirectIfAuthenticated } from './components/RedirectIfAuthenticated'
import { LoginPage } from './pages/auth/LoginPage'
import { AdminLayout } from './layouts/AdminLayout'
import { MemberLayout } from './layouts/MemberLayout'
import { DashboardPage } from './pages/admin/DashboardPage'
import { MembersListPage } from './pages/admin/members/MembersListPage'
import { MemberDetailPage } from './pages/admin/members/MemberDetailPage'
import { EventsListPage } from './pages/admin/events/EventsListPage'
import { EventDetailPage } from './pages/admin/events/EventDetailPage'
import { EventFormPage } from './pages/admin/events/EventFormPage'
import { IntroductionsListPage } from './pages/admin/introductions/IntroductionsListPage'
import { IntroductionDetailPage } from './pages/admin/introductions/IntroductionDetailPage'
import { CommunicationsPage } from './pages/admin/communications/CommunicationsPage'
import { FinancePage } from './pages/admin/finance/FinancePage'
import { PortalDashboard } from './pages/portal/PortalDashboard'
import { PortalEventsPage } from './pages/portal/PortalEventsPage'
import { PortalProfilePage } from './pages/portal/PortalProfilePage'
import { PortalEventDetailPage } from './pages/portal/PortalEventDetailPage'
import { PortalBookingConfirmationPage } from './pages/portal/PortalBookingConfirmationPage'
import { PortalIntroductionsPage } from './pages/portal/PortalIntroductionsPage'
import { PortalNetworkPage } from './pages/portal/PortalNetworkPage'

// Placeholder pages — will be built out in later steps
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-8">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text mb-4">
        {title}
      </h1>
      <p className="text-text-muted">Coming soon</p>
    </div>
  )
}

function HomePage() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="text-center">
        <h1 className="font-[family-name:var(--font-heading)] text-4xl font-semibold text-text mb-2">
          The Club by Sarah Restrick
        </h1>
        <p className="text-text-muted mb-6">Luxury Private Members Networking</p>
        <div className="flex gap-3 justify-center">
          <a href="/login" className="btn-primary">Sign In</a>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/" element={<HomePage />} />
          <Route
            path="/login"
            element={
              <RedirectIfAuthenticated>
                <LoginPage />
              </RedirectIfAuthenticated>
            }
          />

          {/* Admin routes — fixed sidebar layout */}
          <Route element={<ProtectedRoute requiredRole="admin" />}>
            <Route element={<AdminLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/dashboard/members" element={<MembersListPage />} />
              <Route path="/dashboard/members/:id" element={<MemberDetailPage />} />
              <Route path="/dashboard/events" element={<EventsListPage />} />
              <Route path="/dashboard/events/new" element={<EventFormPage />} />
              <Route path="/dashboard/events/:id" element={<EventDetailPage />} />
              <Route path="/dashboard/events/:id/edit" element={<EventFormPage />} />
              <Route path="/dashboard/introductions" element={<IntroductionsListPage />} />
              <Route path="/dashboard/introductions/:id" element={<IntroductionDetailPage />} />
              <Route path="/dashboard/communications" element={<CommunicationsPage />} />
              <Route path="/dashboard/finance" element={<FinancePage />} />
              <Route path="/dashboard/settings" element={<PlaceholderPage title="Settings" />} />
            </Route>
          </Route>

          {/* Member routes — editorial top-bar layout */}
          <Route element={<ProtectedRoute requiredRole="member" />}>
            <Route element={<MemberLayout />}>
              <Route path="/portal" element={<PortalDashboard />} />
              <Route path="/portal/events" element={<PortalEventsPage />} />
              <Route path="/portal/events/:id" element={<PortalEventDetailPage />} />
              <Route path="/portal/events/:id/confirmation" element={<PortalBookingConfirmationPage />} />
              <Route path="/portal/introductions" element={<PortalIntroductionsPage />} />
              <Route path="/portal/network" element={<PortalNetworkPage />} />
              <Route path="/portal/profile" element={<PortalProfilePage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
