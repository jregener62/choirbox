import { useAuthStore } from '@/stores/authStore'
import { useAppStore } from '@/stores/appStore'
import type { ActionResponse } from '@/types/index'

export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
): Promise<T> {
  const token = useAuthStore.getState().token
  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  useAppStore.getState().incrementRequests()

  try {
    const response = await fetch(`/api${path}`, {
      method: 'POST',
      headers,
      body: formData,
    })

    if (response.status === 401 && token) {
      // Gaeste landen auf /guest-goodbye mit einer freundlichen Meldung,
      // statt auf /login (wo sie kein Passwort haben).
      const role = useAuthStore.getState().user?.role
      if (role === 'guest') {
        useAuthStore.getState().expireGuestSession()
      } else {
        useAuthStore.getState().logout()
      }
      throw new ApiError(401, 'Session expired')
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new ApiError(
        response.status,
        (error as { detail?: string }).detail || response.statusText,
      )
    }

    const json = await response.json()

    if (typeof json === 'object' && json !== null && 'outcome' in json) {
      return (json as ActionResponse<T>).data as T
    }

    return json as T
  } finally {
    useAppStore.getState().decrementRequests()
  }
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function api<T = unknown>(
  path: string,
  opts: Omit<RequestInit, 'body'> & { body?: unknown; silent?: boolean } = {},
): Promise<T> {
  const token = useAuthStore.getState().token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const trackRequest = !opts.silent
  if (trackRequest) useAppStore.getState().incrementRequests()

  try {
    const { body, silent: _, ...rest } = opts
    const response = await fetch(`/api${path}`, {
      headers,
      ...rest,
      body: body != null ? JSON.stringify(body) : undefined,
    })

    if (response.status === 401 && token) {
      // Gaeste landen auf /guest-goodbye mit einer freundlichen Meldung,
      // statt auf /login (wo sie kein Passwort haben).
      const role = useAuthStore.getState().user?.role
      if (role === 'guest') {
        useAuthStore.getState().expireGuestSession()
      } else {
        useAuthStore.getState().logout()
      }
      throw new ApiError(401, 'Session expired')
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new ApiError(
        response.status,
        (error as { detail?: string }).detail || response.statusText,
      )
    }

    if (response.status === 204) return undefined as T

    const json = await response.json()

    // Auto-unwrap ActionResponse format
    if (typeof json === 'object' && json !== null && 'outcome' in json) {
      return (json as ActionResponse<T>).data as T
    }

    return json as T
  } finally {
    if (trackRequest) useAppStore.getState().decrementRequests()
  }
}
