export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <div className="main-content">
        {children}
      </div>
    </div>
  )
}
