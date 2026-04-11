/**
 * Types fuer die /api/policy/active Response.
 *
 * Quelle der Wahrheit ist backend/policy/permissions.json — die Felder
 * hier spiegeln den Serialisierer in backend/api/policy.py.
 */

export interface PolicyDistribution {
  name: string
  description: string
  active_features: string[]
}

export interface PolicyFeature {
  description: string
  active: boolean
  permissions: string[]
}

export interface PolicyPermission {
  description: string
  min_role: string
  feature: string | null
  active: boolean
}

export interface PolicyRole {
  level: number
  description: string
  bypass_distribution: boolean
}

export interface PolicyUserView {
  role: string
  bypass_distribution: boolean
  allowed_permissions: string[]
  allowed_features: string[]
}

export interface PolicyResponse {
  distribution: PolicyDistribution
  features: Record<string, PolicyFeature>
  permissions: Record<string, PolicyPermission>
  roles: Record<string, PolicyRole>
  user: PolicyUserView
}
