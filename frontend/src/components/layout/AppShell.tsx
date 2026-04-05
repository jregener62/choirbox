import { useRef, useState, useEffect } from 'react'
import { PwaInstallGuide } from '@/components/PwaInstallGuide.tsx'
import { GlobalPlayerBar } from '@/components/layout/GlobalPlayerBar.tsx'
import { FloatingRecorder } from '@/components/layout/FloatingRecorder.tsx'
import { FooterPortalProvider } from '@/components/layout/FooterPortal.tsx'
import { useFavoritesStore } from '@/hooks/useFavorites.ts'
import { useLabelsStore } from '@/hooks/useLabels.ts'
import { useBrowseStore } from '@/stores/browseStore.ts'
import { useAppStore } from '@/stores/appStore.ts'

export function AppShell({ children }: { children: React.ReactNode }) {
  const footerRef = useRef<HTMLDivElement>(null)
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    setFooterEl(footerRef.current)
  }, [])

  // Page Visibility: reload data when app comes back to foreground
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        const { loaded: favsLoaded } = useFavoritesStore.getState()
        const { loaded: labelsLoaded } = useLabelsStore.getState()
        if (favsLoaded) useFavoritesStore.getState().load()
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
        <PwaInstallGuide />
        <div className="main-content">
          {children}
        </div>
        <FloatingRecorder />
        <GlobalPlayerBar />
        <div ref={footerRef} className="footer-slot" />
      </div>
    </FooterPortalProvider>
  )
}
