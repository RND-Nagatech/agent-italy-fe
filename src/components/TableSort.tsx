import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { TableSort } from '../lib/table-sort'

export function SortHeader({ column, sort, onSort, children, numeric = true, className }: { column: string; sort?: TableSort; onSort: (key: string) => void; children: ReactNode; numeric?: boolean; className?: string }) {
  const active = sort?.key === column
  const Icon = active ? sort.direction === 'asc' ? ArrowUp : ArrowDown : ArrowUpDown
  return <th scope="col" className={[numeric ? 'is-number' : '', className ?? ''].filter(Boolean).join(' ') || undefined} aria-sort={active ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" className={`table-sort-button${active ? ' is-active' : ''}`} onClick={() => onSort(column)} title={active && sort.direction === 'desc' ? 'Urutkan terkecil ke terbesar' : 'Urutkan terbesar ke terkecil'}><span>{children}</span><Icon size={14} aria-hidden="true" /></button></th>
}
