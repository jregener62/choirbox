export type Role = 'guest' | 'member' | 'pro-member' | 'chorleiter' | 'admin' | 'beta-tester' | 'developer'

const ROLE_LEVELS: Record<Role, number> = {
  guest: 0,
  member: 1,
  'pro-member': 2,
  chorleiter: 3,
  admin: 4,
  'beta-tester': 5,
  developer: 6,
}

export const ROLE_LABELS: Record<Role, string> = {
  guest: 'Gast',
  member: 'Mitglied',
  'pro-member': 'Pro-Mitglied',
  chorleiter: 'Chorleiter',
  admin: 'Admin',
  'beta-tester': 'Beta-Tester',
  developer: 'Developer',
}

export const ALL_ROLES: Role[] = ['guest', 'member', 'pro-member', 'chorleiter', 'admin', 'beta-tester', 'developer']

export function hasMinRole(userRole: string, minRole: Role): boolean {
  return (ROLE_LEVELS[userRole as Role] ?? 0) >= ROLE_LEVELS[minRole]
}

/**
 * True, wenn der User die Gast-Rolle hat (oder keine Rolle). Wird fuer
 * UI-Gating genutzt: Gaeste sehen keine Favoriten/Label-Zuweisungs/
 * Annotations/Settings/PWA-Install-UI und persistieren keine per-user
 * Daten auf dem Server.
 */
export function isGuest(userRole: string | undefined | null): boolean {
  return (userRole ?? 'guest') === 'guest'
}
