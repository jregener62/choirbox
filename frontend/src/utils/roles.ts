export type Role = 'guest' | 'member' | 'pro-member' | 'chorleiter' | 'admin'

const ROLE_LEVELS: Record<Role, number> = {
  guest: 0,
  member: 1,
  'pro-member': 2,
  chorleiter: 3,
  admin: 4,
}

export const ROLE_LABELS: Record<Role, string> = {
  guest: 'Gast',
  member: 'Mitglied',
  'pro-member': 'Pro-Mitglied',
  chorleiter: 'Chorleiter',
  admin: 'Admin',
}

export const ALL_ROLES: Role[] = ['guest', 'member', 'pro-member', 'chorleiter', 'admin']

export function hasMinRole(userRole: string, minRole: Role): boolean {
  return (ROLE_LEVELS[userRole as Role] ?? 0) >= ROLE_LEVELS[minRole]
}
