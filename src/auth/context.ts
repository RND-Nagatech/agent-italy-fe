import { createContext } from 'react'
import type { User } from '../lib/types'

export type ApiOptions = Omit<RequestInit, 'headers'> & { headers?: Record<string, string>; responseType?: 'json' | 'blob' }

export type AuthContextValue = {
  status: 'loading' | 'authenticated' | 'unauthenticated'
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  request: <T>(path: string, options?: ApiOptions) => Promise<T>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
