import { useRef, useState, useEffect } from 'react'
import { PwaInstallGuide } from '@/components/PwaInstallGuide.tsx'
import { GlobalPlayerBar } from '@/components/layout/GlobalPlayerBar.tsx'
import { FooterPortalProvider } from '@/components/layout/FooterPortal.tsx'

export function AppShell({ children }: { children: React.ReactNode }) {
  const footerRef = useRef<HTMLDivElement>(null)
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    setFooterEl(footerRef.current)
  }, [])

  return (
    <FooterPortalProvider targetRef={footerEl}>
      <div className="app-shell">
        <PwaInstallGuide />
        <div className="main-content">
          {children}
        </div>
        <GlobalPlayerBar />
        <div ref={footerRef} className="footer-slot" />
      </div>
    </FooterPortalProvider>
  )
}
