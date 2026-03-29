import { PwaInstallGuide } from '@/components/PwaInstallGuide.tsx'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <PwaInstallGuide />
      <div className="main-content">
        {children}
      </div>
    </div>
  )
}
