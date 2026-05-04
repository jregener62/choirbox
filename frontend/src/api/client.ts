import { useAuthStore } from '@/stores/authStore'
import { useAppStore } from '@/stores/appStore'
import type { ActionResponse } from '@/types/index'

const DEFAULT_TIMEOUT_MS = 30_000

// Verkettet user-signal + Timeout-signal in einen einzigen AbortController.
// Statt AbortSignal.any() (erst Safari 17.4+), damit auch ältere iOS-PWAs funktionieren.
function withTimeout(userSignal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DOMException('Request timeout', 'TimeoutError')), timeoutMs)
  if (userSignal) {
    if (userSignal.aborted) ctrl.abort(userSignal.reason)
    else userSignal.addEventListener('abort', () => ctrl.abort(userSignal.reason), { once: true })
  }
  return { signal: ctrl.signal, cancel: () => clearTimeout(timer) }
}

export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const token = useAuthStore.getState().token
  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  useAppStore.getState().incrementRequests()
  // Uploads dürfen länger dauern (default 2 min); via Param überschreibbar.
  const { signal, cancel } = withTimeout(opts.signal, opts.timeoutMs ?? 120_000)

  try {
    const response = await fetch(`/api${path}`, {
      method: 'POST',
      headers,
      body: formData,
      signal,
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
  } catch (err) {
    throw normalizeFetchError(err)
  } finally {
    cancel()
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

/**
 * AbortError (vom User aktiv gecancelt) bleibt AbortError.
 * TimeoutError (vom withTimeout abgelaufen) bleibt TimeoutError.
 * Network-Fehler (TypeError "Failed to fetch") werden zu ApiError(0, ...).
 */
function normalizeFetchError(err: unknown): unknown {
  if (err instanceof DOMException) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return err
  }
  if (err instanceof ApiError) return err
  if (err instanceof TypeError) {
    return new ApiError(0, 'Netzwerkfehler')
  }
  return err
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

export function isTimeoutError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'TimeoutError'
}

export async function api<T = unknown>(
  path: string,
  opts: Omit<RequestInit, 'body' | 'signal'> & { body?: unknown; silent?: boolean; signal?: AbortSignal; timeoutMs?: number } = {},
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
  const { signal, cancel } = withTimeout(opts.signal, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  try {
    const { body, silent: _, signal: __, timeoutMs: ___, ...rest } = opts
    const response = await fetch(`/api${path}`, {
      headers,
      ...rest,
      body: body != null ? JSON.stringify(body) : undefined,
      signal,
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
  } catch (err) {
    throw normalizeFetchError(err)
  } finally {
    cancel()
    if (trackRequest) useAppStore.getState().decrementRequests()
  }
}
