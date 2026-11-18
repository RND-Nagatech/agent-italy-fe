import { useCallback, useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import type { User } from './types'

export type SharedQueryEntry<T> = {
  data: T | undefined
  error: string | null
  updatedAt: number | null
  isFetching: boolean
  invalidationVersion: number
}

type QueryEntry = SharedQueryEntry<unknown>

type SharedQueryStore = {
  queries: Record<string, QueryEntry>
  setEntry: (key: string, entry: QueryEntry) => void
  removeEntry: (key: string) => void
  reset: () => void
}

const MAX_QUERY_ENTRIES = 120
const MAX_QUERY_AGE_MS = 10 * 60_000
const activeQueries = new Map<string, number>()
const lastAccessedAt = new Map<string, number>()
const inFlight = new Map<string, {
  sessionGeneration: number
  queryGeneration: number
  forced: boolean
  promise: Promise<unknown>
}>()
const queryGenerations = new Map<string, number>()
let sessionGeneration = 0

export const useSharedQueryStore = create<SharedQueryStore>()((set) => ({
  queries: {},
  setEntry: (key, entry) => set((state) => ({ queries: { ...state.queries, [key]: entry } })),
  removeEntry: (key) => set((state) => {
    if (!(key in state.queries)) return state
    const queries = { ...state.queries }
    delete queries[key]
    return { queries }
  }),
  reset: () => set({ queries: {} }),
}))

export function getUserQueryScope(user: User | null | undefined): string | null {
  return user ? JSON.stringify([user.id, user.role, user.branchId]) : null
}

export function resetSharedQueryCache(): void {
  sessionGeneration += 1
  inFlight.clear()
  queryGenerations.clear()
  activeQueries.clear()
  lastAccessedAt.clear()
  useSharedQueryStore.getState().reset()
}

export function setSharedQueryData<T>(key: string, data: T): void {
  queryGenerations.set(key, (queryGenerations.get(key) ?? 0) + 1)
  inFlight.delete(key)
  lastAccessedAt.set(key, Date.now())
  const current = useSharedQueryStore.getState().queries[key]
  useSharedQueryStore.getState().setEntry(key, {
    data,
    error: null,
    updatedAt: Date.now(),
    isFetching: false,
    invalidationVersion: current?.invalidationVersion ?? 0,
  })
}

export function invalidateSharedQueries(prefix: string): void {
  const store = useSharedQueryStore.getState()
  const keys = new Set([...Object.keys(store.queries), ...inFlight.keys()])
  const updates: Record<string, QueryEntry> = {}
  for (const key of keys) {
    if (!key.startsWith(prefix)) continue
    queryGenerations.set(key, (queryGenerations.get(key) ?? 0) + 1)
    inFlight.delete(key)
    const current = store.queries[key]
    updates[key] = {
      data: current?.data,
      error: null,
      updatedAt: null,
      isFetching: false,
      invalidationVersion: (current?.invalidationVersion ?? 0) + 1,
    }
  }
  if (Object.keys(updates).length) {
    useSharedQueryStore.setState((state) => ({ queries: { ...state.queries, ...updates } }))
  }
}

function pruneQueryCache(excludedKey: string): void {
  const store = useSharedQueryStore.getState()
  const now = Date.now()
  const keys = Object.keys(store.queries)
  const evictable = keys.filter((key) => key !== excludedKey && !activeQueries.has(key) && !inFlight.has(key))

  for (const key of evictable) {
    const entry = store.queries[key]
    if (entry && entry.updatedAt !== null && now - entry.updatedAt > MAX_QUERY_AGE_MS) {
      store.removeEntry(key)
      queryGenerations.delete(key)
      lastAccessedAt.delete(key)
    }
  }

  const remainingKeys = Object.keys(useSharedQueryStore.getState().queries)
  if (remainingKeys.length < MAX_QUERY_ENTRIES) return

  const oldestFirst = remainingKeys
    .filter((key) => key !== excludedKey && !activeQueries.has(key) && !inFlight.has(key))
    .sort((left, right) => (lastAccessedAt.get(left) ?? 0) - (lastAccessedAt.get(right) ?? 0))
  while (Object.keys(useSharedQueryStore.getState().queries).length >= MAX_QUERY_ENTRIES && oldestFirst.length) {
    const key = oldestFirst.shift()
    if (!key) break
    useSharedQueryStore.getState().removeEntry(key)
    queryGenerations.delete(key)
    lastAccessedAt.delete(key)
  }
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Data tidak dapat dimuat.'
}

async function fetchSharedQuery<T>(
  key: string,
  loader: () => Promise<T>,
  staleTimeMs: number,
  force: boolean,
): Promise<T> {
  const store = useSharedQueryStore.getState()
  const cached = store.queries[key]
  const now = Date.now()
  lastAccessedAt.set(key, now)

  if (!force && cached?.data !== undefined && cached.updatedAt !== null && now - cached.updatedAt < staleTimeMs) {
    return cached.data as T
  }

  const currentQueryGeneration = queryGenerations.get(key) ?? 0
  const active = inFlight.get(key)
  if (
    active
    && active.sessionGeneration === sessionGeneration
    && active.queryGeneration === currentQueryGeneration
    && (!force || active.forced)
  ) {
    return active.promise as Promise<T>
  }

  const queryGeneration = force ? currentQueryGeneration + 1 : currentQueryGeneration
  if (force) {
    queryGenerations.set(key, queryGeneration)
    inFlight.delete(key)
  }
  const requestSessionGeneration = sessionGeneration
  const previous = useSharedQueryStore.getState().queries[key]
  pruneQueryCache(key)
  useSharedQueryStore.getState().setEntry(key, {
    data: previous?.data,
    error: null,
    updatedAt: previous?.updatedAt ?? null,
    isFetching: true,
    invalidationVersion: previous?.invalidationVersion ?? 0,
  })

  const promise = Promise.resolve()
    .then(loader)
    .then((data) => {
      if (
        requestSessionGeneration === sessionGeneration
        && queryGeneration === (queryGenerations.get(key) ?? 0)
      ) {
        useSharedQueryStore.getState().setEntry(key, {
          data,
          error: null,
          updatedAt: Date.now(),
          isFetching: false,
          invalidationVersion: useSharedQueryStore.getState().queries[key]?.invalidationVersion ?? 0,
        })
      }
      return data
    })
    .catch((reason: unknown) => {
      if (
        requestSessionGeneration === sessionGeneration
        && queryGeneration === (queryGenerations.get(key) ?? 0)
      ) {
        const current = useSharedQueryStore.getState().queries[key]
        useSharedQueryStore.getState().setEntry(key, {
          data: current?.data,
          error: errorMessage(reason),
          updatedAt: current?.updatedAt ?? null,
          isFetching: false,
          invalidationVersion: current?.invalidationVersion ?? 0,
        })
      }
      throw reason
    })
    .finally(() => {
      if (inFlight.get(key)?.promise === promise) inFlight.delete(key)
    })

  inFlight.set(key, {
    sessionGeneration: requestSessionGeneration,
    queryGeneration,
    forced: force,
    promise,
  })
  return promise
}

export function useSharedQuery<T>(
  key: string | null,
  loader: () => Promise<T>,
  staleTimeMs = 30_000,
) {
  const entry = useSharedQueryStore((state) => key ? state.queries[key] : undefined)
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const [forceVersion, setForceVersion] = useState(0)
  const handledForceVersion = useRef(0)
  const handledInvalidation = useRef<{ key: string | null; version: number }>({ key: null, version: 0 })

  useEffect(() => {
    if (!key) return
    activeQueries.set(key, (activeQueries.get(key) ?? 0) + 1)
    lastAccessedAt.set(key, Date.now())
    return () => {
      const count = activeQueries.get(key) ?? 0
      if (count <= 1) activeQueries.delete(key)
      else activeQueries.set(key, count - 1)
    }
  }, [key])

  useEffect(() => {
    const currentInvalidationVersion = entry?.invalidationVersion ?? 0
    const keyChanged = handledInvalidation.current.key !== key
    const invalidated = !keyChanged && currentInvalidationVersion > handledInvalidation.current.version
    handledInvalidation.current = { key, version: currentInvalidationVersion }
    const force = forceVersion !== handledForceVersion.current || invalidated
    handledForceVersion.current = forceVersion
    if (!key) return
    void fetchSharedQuery(key, () => loaderRef.current(), staleTimeMs, force).catch(() => undefined)
  }, [entry?.invalidationVersion, forceVersion, key, staleTimeMs])

  const reload = useCallback(() => setForceVersion((current) => current + 1), [])
  const setData = useCallback((data: T) => {
    if (key) setSharedQueryData(key, data)
  }, [key])

  return {
    data: entry?.data as T | undefined,
    loading: !key || !entry || entry.isFetching,
    error: entry?.error ?? null,
    updatedAt: entry?.updatedAt ?? null,
    reload,
    setData,
  }
}
