import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiBaseUrl, fetchJson, parseResponse, readCookie } from '../lib/api'
import { getUserQueryScope, resetSharedQueryCache } from '../lib/shared-query'
import type { User } from '../lib/types'
import { AuthContext } from './context'
import type { ApiOptions, AuthContextValue } from './context'

type LoginResponse = {
  accessToken: string
  expiresIn: number
  user: User
}

type RefreshResponse = {
  accessToken: string
  expiresIn: number
}

type AuthLockManager = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>
}

type StoredRefreshLock = {
  owner: string
  expiresAt: number
}

const refreshLockName = 'pantes-auth-refresh'
const refreshLockStorageKey = 'pantes-auth-refresh-lock'
const refreshLockLeaseMs = 15_000

function readStoredRefreshLock(): StoredRefreshLock | null {
  try {
    const raw = window.localStorage.getItem(refreshLockStorageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredRefreshLock>
    return typeof parsed.owner === 'string' && typeof parsed.expiresAt === 'number'
      ? parsed as StoredRefreshLock
      : null
  } catch {
    return null
  }
}

function releaseStoredRefreshLock(owner: string) {
  try {
    if (readStoredRefreshLock()?.owner === owner) window.localStorage.removeItem(refreshLockStorageKey)
  } catch {
    // Storage may be unavailable; the lease will expire on its own.
  }
}

async function withStoredRefreshLock<T>(operation: () => Promise<T>): Promise<T> {
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const deadline = Date.now() + refreshLockLeaseMs

  while (Date.now() < deadline) {
    const current = readStoredRefreshLock()
    if (!current || current.expiresAt <= Date.now()) {
      const next: StoredRefreshLock = { owner, expiresAt: Date.now() + refreshLockLeaseMs }
      try {
        window.localStorage.setItem(refreshLockStorageKey, JSON.stringify(next))
      } catch {
        return operation()
      }
      if (readStoredRefreshLock()?.owner === owner) {
        try {
          return await operation()
        } finally {
          releaseStoredRefreshLock(owner)
        }
      }
    }
    await new Promise(resolve => window.setTimeout(resolve, 80 + Math.floor(Math.random() * 80)))
  }

  return operation()
}

function withCrossTabRefreshLock<T>(operation: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined'
    ? (navigator as Navigator & { locks?: AuthLockManager }).locks
    : undefined
  return locks ? locks.request(refreshLockName, operation) : withStoredRefreshLock(operation)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue['status']>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const accessToken = useRef<string | null>(null)
  const accountScope = useRef<string | null>(null)
  const refreshFlight = useRef<Promise<boolean> | null>(null)
  const bootFlight = useRef<Promise<void> | null>(null)
  const bootReady = useRef(false)

  const acceptSession = useCallback((token: string, account: User, expiresIn: number) => {
    const nextScope = getUserQueryScope(account)
    if (accountScope.current !== nextScope) {
      resetSharedQueryCache()
      accountScope.current = nextScope
    }
    accessToken.current = token
    setUser(account)
    setExpiresAt(Date.now() + expiresIn * 1000)
    setStatus('authenticated')
  }, [])

  const clearSession = useCallback(() => {
    accountScope.current = null
    resetSharedQueryCache()
    accessToken.current = null
    setUser(null)
    setExpiresAt(null)
    setStatus('unauthenticated')
  }, [])

  const refreshSession = useCallback((): Promise<boolean> => {
    if (refreshFlight.current) return refreshFlight.current

    refreshFlight.current = (async () => {
      try {
        return await withCrossTabRefreshLock(async () => {
          const csrf = readCookie('pnt_csrf')
          if (!csrf) {
            clearSession()
            return false
          }

          const renewed = await fetchJson<RefreshResponse>('/auth/refresh', {
            method: 'POST',
            credentials: 'include',
            headers: { 'x-csrf-token': csrf },
          })
          const account = await fetchJson<User>('/auth/me', {
            headers: { Authorization: `Bearer ${renewed.accessToken}` },
          })
          acceptSession(renewed.accessToken, account, renewed.expiresIn)
          return true
        })
      } catch (error) {
        // Keep the local session during transient network/server failures so the
        // next request or visibility event can retry. Clear it only when the
        // server explicitly rejects the session/token.
        const transient = error instanceof ApiError
          && (error.status === 0 || error.status === 429 || error.status >= 500)
        if (!transient) clearSession()
        return false
      } finally {
        refreshFlight.current = null
      }
    })()

    return refreshFlight.current
  }, [acceptSession, clearSession])

  const ensureBoot = useCallback(() => {
    if (bootReady.current) return Promise.resolve()
    if (!bootFlight.current) {
      bootFlight.current = refreshSession()
        .then(() => undefined)
        .finally(() => { bootReady.current = true })
    }
    return bootFlight.current
  }, [refreshSession])

  useEffect(() => {
    void ensureBoot()
  }, [ensureBoot])

  useEffect(() => {
    if (status !== 'authenticated' || expiresAt === null) return
    const timer = window.setTimeout(() => void refreshSession(), Math.max(30_000, expiresAt - Date.now() - 60_000))
    return () => window.clearTimeout(timer)
  }, [status, expiresAt, refreshSession])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!accessToken.current) {
        if (!bootReady.current) void ensureBoot()
        return
      }
      if (expiresAt !== null && expiresAt - Date.now() <= 90_000) void refreshSession()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenVisible)
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshWhenVisible)
    }
  }, [ensureBoot, expiresAt, refreshSession])

  const login = useCallback(async (email: string, password: string) => {
    const result = await fetchJson<LoginResponse>('/auth/login', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })
    acceptSession(result.accessToken, result.user, result.expiresIn)
  }, [acceptSession])

  const logout = useCallback(async () => {
    const csrf = readCookie('pnt_csrf')
    try {
      if (csrf) {
        await fetchJson<void>('/auth/logout', {
          method: 'POST',
          credentials: 'include',
          headers: { 'x-csrf-token': csrf },
        })
      }
    } catch {
      // Clear the local session even when the API cannot be reached.
    } finally {
      clearSession()
    }
  }, [clearSession])

  const request = useCallback(async <T,>(path: string, options: ApiOptions = {}): Promise<T> => {
    if (!accessToken.current && !bootReady.current) await ensureBoot()

    const send = (token: string | null) => {
      const headers = new Headers(options.headers)
      if (token) headers.set('Authorization', `Bearer ${token}`)
      if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
      }
      return fetch(`${apiBaseUrl}${path}`, { ...options, headers })
    }

    let response: Response
    try {
      response = await send(accessToken.current)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new ApiError(0, 'Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.')
    }

    if (response.status === 401 && accessToken.current) {
      const renewed = await refreshSession()
      if (renewed) {
        try {
          response = await send(accessToken.current)
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') throw error
          throw new ApiError(0, 'Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.')
        }
      }
    }

    if (options.responseType === 'blob' && response.ok) return await response.blob() as T
    return parseResponse<T>(response)
  }, [ensureBoot, refreshSession])

  const value = useMemo(() => ({ status, user, login, logout, request }), [status, user, login, logout, request])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

