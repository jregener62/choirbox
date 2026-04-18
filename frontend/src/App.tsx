import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore, consumeGuestGoodbyeFlag } from '@/stores/authStore.ts'
import { usePolicyStore } from '@/stores/policyStore.ts'
import { hasMinRole } from '@/utils/roles.ts'
import { LoginPage } from '@/pages/LoginPage.tsx'
import { RegisterPage } from '@/pages/RegisterPage.tsx'
import { GuestRedeemPage } from '@/pages/GuestRedeemPage.tsx'
import { GuestGoodbyePage } from '@/pages/GuestGoodbyePage.tsx'
import { AppShell } from '@/components/layout/AppShell.tsx'
import { MustChangePasswordScreen } from '@/components/ui/MustChangePasswordModal.tsx'
import { OfflineBanner } from '@/components/ui/OfflineBanner.tsx'
import { BrowsePage } from '@/pages/BrowsePage.tsx'
import { SettingsPage } from '@/pages/SettingsPage.tsx'
import { ChoirSettingsPage } from '@/pages/settings/ChoirSettingsPage.tsx'
import { DataSettingsPage } from '@/pages/settings/DataSettingsPage.tsx'
import { ViewerPage } from '@/pages/ViewerPage.tsx'
import { SectionEditorPage } from '@/pages/SectionEditorPage.tsx'
import { DocViewerPage } from '@/pages/DocViewerPage.tsx'
import { UsersPage } from '@/pages/admin/UsersPage.tsx'
import { LabelsPage } from '@/pages/admin/LabelsPage.tsx'
import { SectionPresetsPage } from '@/pages/admin/SectionPresetsPage.tsx'
import { ChoirsPage } from '@/pages/admin/ChoirsPage.tsx'
import { DataCarePage } from '@/pages/admin/DataCarePage.tsx'
import { GuestLinksPage } from '@/pages/admin/GuestLinksPage.tsx'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const mustChangePw = useAuthStore((s) => s.user?.must_change_password)
  const policy = usePolicyStore((s) => s.policy)
  const loadPolicy = usePolicyStore((s) => s.loadPolicy)

  // Policy nachladen, sobald der User eingeloggt ist. Laeuft einmal beim
  // Mount und jedes Mal, wenn sich das Token aendert (Login/Logout).
  useEffect(() => {
    if (token && !policy) {
      void loadPolicy()
    }
  }, [token, policy, loadPolicy])

  if (!token) {
    // Abgelaufene Gast-Sessions bekommen eine eigene Info-Seite mit
    // klarer Sprache — nicht die Login-Form, die fuer Gaeste ohne
    // Passwort sinnlos ist.
    if (consumeGuestGoodbyeFlag()) {
      return <Navigate to="/guest-goodbye" replace />
    }
    return <Navigate to="/login" replace />
  }
  // Temporaeres Passwort: statt der App eine reine Lock-Screen zeigen —
  // kein Einblick in Inhalte, solange kein eigenes Passwort gesetzt ist.
  if (mustChangePw) return <MustChangePasswordScreen />
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
      <Route path="/settings/choir" element={<ChoirSettingsPage />} />
      <Route path="/settings/data" element={<DataSettingsPage />} />
      <Route path="/admin/users" element={<UsersPage />} />
      <Route path="/admin/labels" element={<LabelsPage />} />
      <Route path="/admin/section-presets" element={<SectionPresetsPage />} />
      <Route path="/admin/datacare" element={<DataCarePage />} />
      <Route path="/admin/guest-links" element={<GuestLinksPage />} />
      {hasMinRole(userRole, 'developer') && <Route path="/admin/choirs" element={<ChoirsPage />} />}
    </Routes>
  )
}

export function App() {
  return (
    <HashRouter>
      <OfflineBanner />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/join/:inviteCode" element={<RegisterPage />} />
        <Route path="/guest/:token" element={<GuestRedeemPage />} />
        <Route path="/guest-goodbye" element={<GuestGoodbyePage />} />
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
