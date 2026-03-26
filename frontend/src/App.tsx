import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore.ts'
import { LoginPage } from '@/pages/LoginPage.tsx'
import { RegisterPage } from '@/pages/RegisterPage.tsx'
import { AppShell } from '@/components/layout/AppShell.tsx'
import { BrowsePage } from '@/pages/BrowsePage.tsx'
import { FavoritesPage } from '@/pages/FavoritesPage.tsx'
import { SettingsPage } from '@/pages/SettingsPage.tsx'
import { PlayerPage } from '@/pages/PlayerPage.tsx'
import { UsersPage } from '@/pages/admin/UsersPage.tsx'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function App() {
  const restoreSession = useAuthStore((s) => s.restoreSession)

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/*"
          element={
            <AuthGuard>
              <AppShell>
                <Routes>
                  <Route path="/" element={<BrowsePage />} />
                  <Route path="/browse" element={<BrowsePage />} />
                  <Route path="/favorites" element={<FavoritesPage />} />
                  <Route path="/player" element={<PlayerPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/admin/users" element={<UsersPage />} />
                </Routes>
              </AppShell>
            </AuthGuard>
          }
        />
      </Routes>
    </HashRouter>
  )
}
