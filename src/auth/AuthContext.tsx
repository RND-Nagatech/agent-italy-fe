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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue['status']>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const accessToken = useRef<string | null>(null)
  const accountScope = useRef<string | null>(null)
  const refreshFlight = useRef<Promise<boolean> | null>(null)
  const bootFlight = useRef<Promise<void> | null>(null)

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
      const csrf = readCookie('pnt_csrf')
      if (!csrf) {
        clearSession()
        return false
      }

      try {
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
      } catch {
        clearSession()
        return false
      } finally {
        refreshFlight.current = null
      }
    })()

    return refreshFlight.current
  }, [acceptSession, clearSession])

  useEffect(() => {
    if (!bootFlight.current) {
      bootFlight.current = refreshSession().then(() => undefined)
    }
  }, [refreshSession])

  useEffect(() => {
    if (status !== 'authenticated' || expiresAt === null) return
    const timer = window.setTimeout(() => void refreshSession(), Math.max(30_000, expiresAt - Date.now() - 60_000))
    return () => window.clearTimeout(timer)
  }, [status, expiresAt, refreshSession])

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
  }, [refreshSession])

  const value = useMemo(() => ({ status, user, login, logout, request }), [status, user, login, logout, request])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

