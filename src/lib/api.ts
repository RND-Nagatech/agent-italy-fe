export type ApiErrorBody = {
  message?: string | string[]
  error?: string
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')

export function readCookie(name: string): string | null {
  const key = `${name}=`
  const part = document.cookie.split('; ').find((cookie) => cookie.startsWith(key))
  if (!part) return null

  try {
    return decodeURIComponent(part.slice(key.length))
  } catch {
    return part.slice(key.length)
  }
}

export async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json') ? await response.json() : null

  if (!response.ok) {
    const error = body as ApiErrorBody | null
    const message = Array.isArray(error?.message)
      ? error.message.join(', ')
      : error?.message || error?.error || 'Permintaan tidak dapat diproses.'
    throw new ApiError(response.status, message)
  }

  return body as T
}

export async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.')
  }

  return parseResponse<T>(response)
}
