import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore.ts'
import { hasMinRole } from '@/utils/roles.ts'
import { LoginPage } from '@/pages/LoginPage.tsx'
import { RegisterPage } from '@/pages/RegisterPage.tsx'
import { AppShell } from '@/components/layout/AppShell.tsx'
import { BrowsePage } from '@/pages/BrowsePage.tsx'
import { SettingsPage } from '@/pages/SettingsPage.tsx'
import { ViewerPage } from '@/pages/ViewerPage.tsx'
import { SectionEditorPage } from '@/pages/SectionEditorPage.tsx'
import { DocViewerPage } from '@/pages/DocViewerPage.tsx'
import { UsersPage } from '@/pages/admin/UsersPage.tsx'
import { LabelsPage } from '@/pages/admin/LabelsPage.tsx'
import { SectionPresetsPage } from '@/pages/admin/SectionPresetsPage.tsx'
import { ChoirsPage } from '@/pages/admin/ChoirsPage.tsx'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const mustChangePw = useAuthStore((s) => s.user?.must_change_password)
  const location = useLocation()
  if (!token) return <Navigate to="/login" replace />
  if (mustChangePw && location.pathname !== '/settings') return <Navigate to="/settings" replace />
  return <>{children}</>
}

function AppRoutes() {
  const userRole = useAuthStore((s) => s.user?.role ?? 'guest')
  const isBeta = hasMinRole(userRole, 'beta-tester')

  return (
    <Routes>
      <Route path="/" element={<BrowsePage />} />
      <Route path="/browse" element={<BrowsePage />} />
      <Route path="/viewer" element={<ViewerPage />} />
      <Route path="/doc-viewer" element={<DocViewerPage />} />
      {isBeta && <Route path="/sections" element={<SectionEditorPage />} />}
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/admin/users" element={<UsersPage />} />
      <Route path="/admin/labels" element={<LabelsPage />} />
      <Route path="/admin/section-presets" element={<SectionPresetsPage />} />
      {hasMinRole(userRole, 'developer') && <Route path="/admin/choirs" element={<ChoirsPage />} />}
    </Routes>
  )
}

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/join/:inviteCode" element={<RegisterPage />} />
        <Route
          path="/*"
          element={
            <AuthGuard>
              <AppShell>
                <AppRoutes />
              </AppShell>
            </AuthGuard>
          }
        />
      </Routes>
    </HashRouter>
  )
}
