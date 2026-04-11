import { useRef, useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { PwaInstallGuide } from '@/components/PwaInstallGuide.tsx'
import { GlobalPlayerBar } from '@/components/layout/GlobalPlayerBar.tsx'
import { FloatingRecorder } from '@/components/layout/FloatingRecorder.tsx'
import { EdgeBugTab } from '@/components/layout/EdgeBugTab.tsx'
import { FooterPortalProvider } from '@/components/layout/FooterPortal.tsx'
import { useAuthStore } from '@/stores/authStore.ts'
import { useFavoritesStore } from '@/hooks/useFavorites.ts'
import { useLabelsStore } from '@/hooks/useLabels.ts'
import { useBrowseStore } from '@/stores/browseStore.ts'
import { useAppStore } from '@/stores/appStore.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { isGuest } from '@/utils/roles.ts'

// Routes where audio playback should persist (song context)
const SONG_CONTEXT_ROUTES = ['/', '/browse', '/viewer', '/doc-viewer', '/sections']

export function AppShell({ children }: { children: React.ReactNode }) {
  const footerRef = useRef<HTMLDivElement>(null)
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null)
  const { pathname } = useLocation()
  const user = useAuthStore((s) => s.user)
  const guest = isGuest(user?.role)

  useEffect(() => {
    setFooterEl(footerRef.current)
  }, [])

  // Stop playback when navigating away from song-context routes
  useEffect(() => {
    if (!SONG_CONTEXT_ROUTES.includes(pathname) && usePlayerStore.getState().currentPath) {
      usePlayerStore.getState().setPlaying(false)
      usePlayerStore.setState({ currentPath: null, currentName: null })
    }
  }, [pathname])

  // Page Visibility: reload data when app comes back to foreground
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        const currentUser = useAuthStore.getState().user
        const isGuestUser = isGuest(currentUser?.role)
        const { loaded: favsLoaded } = useFavoritesStore.getState()
        const { loaded: labelsLoaded } = useLabelsStore.getState()
        // Favoriten sind fuer Gaeste nicht verfuegbar (403) — nicht reloaden.
        if (!isGuestUser && favsLoaded) useFavoritesStore.getState().load()
        if (labelsLoaded) useLabelsStore.getState().load()
        // Refresh current browse folder in background
        const browsePath = useAppStore.getState().browsePath
        useBrowseStore.getState().loadFolder(browsePath, true)
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  return (
    <FooterPortalProvider targetRef={footerEl}>
      <div className="app-shell">
        {/* PWA-Install-Prompt bekommen Gaeste nicht zu sehen — eine 2h-Session
            fuer einen Proben-Link gehoert nicht auf den Homescreen. */}
        {!guest && <PwaInstallGuide />}
        <div className="main-content">
          {children}
        </div>
        {/* Aufnahme-Recorder ist pro-member+. Gaeste sehen ihn nicht. */}
        {!guest && <FloatingRecorder />}
        {user?.can_report_bugs && <EdgeBugTab />}
        <GlobalPlayerBar />
        <div ref={footerRef} className="footer-slot" />
      </div>
    </FooterPortalProvider>
  )
}
