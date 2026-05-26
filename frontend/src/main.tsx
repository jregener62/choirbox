import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import './styles/mono-v2.css'
import { App } from './App.tsx'

// Apply saved theme on load
const savedTheme = localStorage.getItem('choirbox_theme') || 'dark'
document.documentElement.setAttribute('data-theme', savedTheme)

// Apply saved zoom on load
const savedZoom = localStorage.getItem('choirbox_zoom') || 'normal'
const zoomValues: Record<string, number> = { normal: 1.0, large: 1.125, xlarge: 1.25 }
document.documentElement.style.setProperty('--ui-scale', String(zoomValues[savedZoom] ?? 1.0))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service Worker registrieren (nur in Production)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js')
}
