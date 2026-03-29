import { useState } from 'react'
import { Download, Share, Plus, MoreVertical, X } from 'lucide-react'

const DISMISSED_KEY = 'choirbox_pwa_dismissed'

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && (navigator as any).standalone)
}

function getPlattform(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

export function PwaInstallGuide() {
  const [visible, setVisible] = useState(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return false
    if (isStandalone()) return false
    return true
  })

  if (!visible) return null

  const dismiss = (dontShowAgain: boolean) => {
    if (dontShowAgain) {
      localStorage.setItem(DISMISSED_KEY, '1')
    }
    setVisible(false)
  }

  const platform = getPlattform()

  return (
    <div className="pwa-guide-overlay">
      <div className="pwa-guide">
        <button className="pwa-guide-close" onClick={() => dismiss(false)}>
          <X size={20} />
        </button>

        <div className="pwa-guide-header">
          <img src="/icons/icon-96x96.png" alt="ChoirBox" className="pwa-guide-icon" />
          <h2>ChoirBox installieren</h2>
          <p className="pwa-guide-subtitle">
            Installiere ChoirBox auf deinem Handy fuer den schnellen Zugriff — ohne App Store.
          </p>
        </div>

        {(platform === 'ios' || platform === 'desktop') && (
          <div className="pwa-guide-section">
            <h3>iPhone / iPad (Safari)</h3>
            <ol className="pwa-guide-steps">
              <li>
                <span className="pwa-guide-step-icon"><Share size={18} /></span>
                <span>Tippe auf den <strong>Teilen-Button</strong> (Quadrat mit Pfeil nach oben) in der Safari-Leiste</span>
              </li>
              <li>
                <span className="pwa-guide-step-icon"><Plus size={18} /></span>
                <span>Scrolle und waehle <strong>"Zum Home-Bildschirm"</strong></span>
              </li>
              <li>
                <span className="pwa-guide-step-icon"><Download size={18} /></span>
                <span>Tippe auf <strong>"Hinzufuegen"</strong> — fertig!</span>
              </li>
            </ol>
          </div>
        )}

        {(platform === 'android' || platform === 'desktop') && (
          <div className="pwa-guide-section">
            <h3>Android (Chrome)</h3>
            <ol className="pwa-guide-steps">
              <li>
                <span className="pwa-guide-step-icon"><MoreVertical size={18} /></span>
                <span>Tippe auf das <strong>Drei-Punkte-Menue</strong> oben rechts in Chrome</span>
              </li>
              <li>
                <span className="pwa-guide-step-icon"><Download size={18} /></span>
                <span>Waehle <strong>"App installieren"</strong> oder <strong>"Zum Startbildschirm hinzufuegen"</strong></span>
              </li>
              <li>
                <span className="pwa-guide-step-icon"><Plus size={18} /></span>
                <span>Bestaetigen — fertig!</span>
              </li>
            </ol>
          </div>
        )}

        <div className="pwa-guide-actions">
          <button className="pwa-guide-btn-primary" onClick={() => dismiss(false)}>
            Verstanden
          </button>
          <button className="pwa-guide-btn-dismiss" onClick={() => dismiss(true)}>
            Nicht mehr anzeigen
          </button>
        </div>
      </div>
    </div>
  )
}
