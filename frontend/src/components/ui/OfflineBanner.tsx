import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus.ts'

export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div className="offline-banner" role="alert" aria-live="assertive">
      <WifiOff size={18} aria-hidden="true" />
      <span>
        Keine Internetverbindung — ChoirBox funktioniert nur online.
      </span>
    </div>
  )
}
