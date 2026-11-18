import { useState, type ReactNode } from 'react'
import { SortHeader } from '../components/TableSort'
export type TableSort = { key: string; direction: 'asc' | 'desc' }
export type SortValue = string | number | null | undefined
export function compareTableValues(a: SortValue, b: SortValue, direction: 'asc' | 'desc') {
  const missing = (v: SortValue) => v == null || typeof v === 'number' && !Number.isFinite(v)
  if (missing(a) || missing(b)) return missing(a) === missing(b) ? 0 : missing(a) ? 1 : -1
  const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'id', { numeric: true })
  return direction === 'asc' ? result : -result
}
export function useTableSort(initial?: TableSort, onChange?: () => void) {
  const [sort, setSort] = useState<TableSort | undefined>(initial)
  function change(key: string) { setSort(current => ({ key, direction: current?.key === key && current.direction === 'desc' ? 'asc' : 'desc' })); onChange?.() }
  function order<T>(rows: readonly T[], value: (row: T, key: string) => SortValue): T[] {
    return sort ? [...rows].sort((a, b) => compareTableValues(value(a, sort.key), value(b, sort.key), sort.direction)) : [...rows]
  }
  function header(key: string, title: ReactNode, numeric = true, className?: string) {
    return <SortHeader column={key} sort={sort} onSort={change} numeric={numeric} className={className}>{title}</SortHeader>
  }
  return { sort, change, order, header }
}
