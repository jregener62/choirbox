import { useMemo, useState, type ReactNode } from 'react'
import {
  Music,
  Compass,
  Download,
  Share,
  Plus,
  MoreVertical,
  Check,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { api } from '@/api/client.ts'
import { useAuthStore } from '@/stores/authStore.ts'

const STORAGE_USER_KEY = 'choirbox_user'

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
  )
}

function getPlatform(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

interface SlideDef {
  key: 'welcome' | 'how' | 'install'
  render: () => ReactNode
}

export function WelcomeModal() {
  const user = useAuthStore((s) => s.user)
  const standalone = useMemo(isStandalone, [])
  const platform = useMemo(getPlatform, [])

  const slides: SlideDef[] = useMemo(() => {
    const list: SlideDef[] = [
      { key: 'welcome', render: () => <WelcomeSlide /> },
      { key: 'how', render: () => <HowSlide /> },
    ]
    if (!standalone) {
      list.push({ key: 'install', render: () => <InstallSlide platform={platform} /> })
    }
    return list
  }, [standalone, platform])

  const [index, setIndex] = useState(0)
  const [closing, setClosing] = useState(false)

  if (!user) return null
  if (closing) return null

  const isLast = index === slides.length - 1
  const isFirst = index === 0

  const finish = async () => {
    setClosing(true)
    try {
      await api('/auth/me/onboarded', { method: 'POST', silent: true })
    } catch {
      /* Soft fail — beim naechsten Login wuerde das Modal sonst wieder kommen.
         Lokal merken, damit es zumindest in dieser Session ruhig bleibt. */
    }
    if (user) {
      const updated = { ...user, onboarded_at: new Date().toISOString() }
      try { localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(updated)) } catch { /* ignore */ }
      useAuthStore.setState({ user: updated })
    }
  }

  const handleNext = () => {
    if (isLast) {
      void finish()
    } else {
      setIndex((i) => i + 1)
    }
  }

  const handleBack = () => {
    if (!isFirst) setIndex((i) => i - 1)
  }

  return (
    <Modal onClose={finish} closeOnOverlay={false} showClose={true}>
      <div className="welcome-modal">
        <div className="welcome-slide">{slides[index].render()}</div>

        <div className="welcome-bottom">
          <div className="welcome-dots" role="tablist">
            {slides.map((_, i) => (
              <span
                key={i}
                className={`welcome-dot ${i === index ? 'active' : ''}`}
                aria-current={i === index ? 'step' : undefined}
              />
            ))}
          </div>
          <div className="welcome-actions">
            {isFirst ? (
              <button type="button" className="btn btn-text welcome-skip" onClick={finish}>
                Überspringen
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={handleBack}>
                Zurück
              </button>
            )}
            <button type="button" className="btn btn-primary welcome-next" onClick={handleNext}>
              {isLast ? 'Loslegen' : 'Weiter'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// --- Slides ---------------------------------------------------------------

function WelcomeSlide() {
  return (
    <>
      <div className="welcome-icon welcome-icon-accent">
        <Music size={32} />
      </div>
      <h2 className="welcome-title">Willkommen bei CantaBox</h2>
      <p className="welcome-text">
        Üb deine Stimme von überall — alle Audios und Texte deines Chors griffbereit auf dem Handy.
      </p>
    </>
  )
}

function HowSlide() {
  // Inhalt folgt — Platzhalter analog zum Mockup.
  return (
    <>
      <div className="welcome-icon welcome-icon-muted">
        <Compass size={30} />
      </div>
      <h2 className="welcome-title">So funktioniert's</h2>
      <p className="welcome-text welcome-text-muted">
        Texte folgen — Inhalte werden noch festgelegt.
      </p>
      <div className="welcome-placeholders">
        <div className="welcome-placeholder">Platzhalter Feature 1</div>
        <div className="welcome-placeholder">Platzhalter Feature 2</div>
        <div className="welcome-placeholder">Platzhalter Feature 3</div>
      </div>
    </>
  )
}

function InstallSlide({ platform }: { platform: 'ios' | 'android' | 'desktop' }) {
  const showIos = platform === 'ios' || platform === 'desktop'
  const showAndroid = platform === 'android' || platform === 'desktop'
  return (
    <>
      <div className="welcome-icon welcome-icon-install">
        <Download size={30} />
      </div>
      <h2 className="welcome-title">App installieren</h2>
      <p className="welcome-text">
        Für schnellen Zugriff direkt vom Startbildschirm — ohne App Store.
      </p>

      {showIos && (
        <div className="welcome-platform">
          <div className="welcome-platform-title">iPhone / iPad (Safari)</div>
          <ol className="welcome-steps">
            <li>
              <span className="welcome-step-icon"><Share size={14} /></span>
              <span><b>Teilen</b>-Button in der Safari-Leiste antippen</span>
            </li>
            <li>
              <span className="welcome-step-icon"><Plus size={14} /></span>
              <span><b>Zum Home-Bildschirm</b> auswählen</span>
            </li>
            <li>
              <span className="welcome-step-icon"><Check size={14} /></span>
              <span><b>Hinzufügen</b> bestätigen</span>
            </li>
          </ol>
        </div>
      )}

      {showAndroid && (
        <div className="welcome-platform">
          <div className="welcome-platform-title">Android (Chrome)</div>
          <ol className="welcome-steps">
            <li>
              <span className="welcome-step-icon"><MoreVertical size={14} /></span>
              <span><b>Drei-Punkte-Menü</b> in Chrome öffnen</span>
            </li>
            <li>
              <span className="welcome-step-icon"><Download size={14} /></span>
              <span><b>App installieren</b> oder <b>Zum Startbildschirm</b></span>
            </li>
            <li>
              <span className="welcome-step-icon"><Check size={14} /></span>
              <span>Bestätigen — fertig!</span>
            </li>
          </ol>
        </div>
      )}
    </>
  )
}
