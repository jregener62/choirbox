import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

const FooterContext = createContext<HTMLDivElement | null>(null)

export function FooterPortalProvider({ children, targetRef }: { children: React.ReactNode; targetRef: HTMLDivElement | null }) {
  return (
    <FooterContext.Provider value={targetRef}>
      {children}
    </FooterContext.Provider>
  )
}

export function FooterSlot({ children }: { children: React.ReactNode }) {
  const target = useContext(FooterContext)
  if (!target) return null
  return createPortal(children, target)
}
