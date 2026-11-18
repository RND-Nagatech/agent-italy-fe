import { distributionPriorityLabel, distributionPriorityRank } from '../lib/distribution-priority'
import { useTableSort } from '../lib/table-sort'
import { Check, ChevronLeft, ChevronRight, Database, LoaderCircle, MoreHorizontal, Pencil, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AgentDataSourceConfig } from '../lib/types'

export function SourceDirectory({ sources, busySourceId, onEdit, onToggle }: {
  sources: AgentDataSourceConfig[]
  busySourceId: string | null
  onEdit: (source: AgentDataSourceConfig) => void
  onToggle: (source: AgentDataSourceConfig) => void
}) {
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const [category, setCategory] = useState('all')
  const [page, setPage] = useState(1)
  const sorting = useTableSort(undefined, () => setPage(1))
  const pageSize = 10
  const rows = useMemo(() => sources.filter((source) => {
    const sourceType = source.sourceType ?? 'branch'
    return (type === 'all' || sourceType === type)
      && (category === 'all' || (sourceType === 'branch' && (source.itemCategory ?? 'BIASA') === category))
      && `${source.alias} ${source.databaseName} ${source.branchId} ${source.itemCategory ?? ''} ${distributionPriorityLabel(source.distributionPriority)} ${source.distributionPriority ?? 'none'}`.toLocaleLowerCase('id').includes(search.trim().toLocaleLowerCase('id'))
  }), [sources, type, category, search])
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const orderedRows = sorting.order(rows, (row, key) => key === 'distributionPriority'
    ? -distributionPriorityRank(row.distributionPriority)
    : key === 'active'
      ? Number(row.active)
      : key === 'itemCategory'
        ? row.itemCategory ?? 'BIASA'
        : row[key as 'alias' | 'branchId' | 'sourceType'] ?? 'branch')
  const visibleRows = orderedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return <>
    <div className="source-directory-toolbar">
      <div className="source-type-tabs" aria-label="Filter jenis sumber">
        {[['all', 'Semua'], ['branch', 'Cabang'], ['central', 'Pusat']].map(([value, label]) => <button key={value} type="button" aria-pressed={type === value} className={type === value ? 'is-active' : ''} onClick={() => { setType(value); setPage(1) }}>{label} <span>{sources.filter((source) => value === 'all' || (source.sourceType ?? 'branch') === value).length}</span></button>)}
      </div>
      <label className="source-category-filter"><span>Kategori barang</span><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1) }}><option value="all">Semua kategori</option><option value="X">X · Khusus mall</option><option value="BIASA">BIASA · Cabang lainnya</option></select></label>
      <label className="search-control"><Search size={17} aria-hidden="true" /><span className="sr-only">Cari sumber data</span><input placeholder="Cari sumber atau database" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label>
    </div>
    <div className="table-scroll source-directory-scroll">
      <table className="data-table source-directory-table">
        <thead><tr>{sorting.header('alias', 'Sumber / database', false)}{sorting.header('branchId', 'Branch ID', false)}{sorting.header('sourceType', 'Jenis sumber', false)}{sorting.header('itemCategory', 'Kategori barang', false)}{sorting.header('distributionPriority', 'Flag prioritas', false)}{sorting.header('active', 'Status', false)}<th scope="col">Aksi</th></tr></thead>
        <tbody>{visibleRows.map((source) => <tr key={source.id}>
          <td><div className="source-table-identity"><span className="source-row-icon"><Database size={18} /></span><span><strong title={source.alias}>{source.alias}</strong><small>{source.databaseName}</small></span></div></td>
          <td>{source.branchId}</td>
          <td><span className={`source-type-badge${source.sourceType === 'central' ? ' is-central' : ''}`}>{source.sourceType === 'central' ? 'Pusat' : 'Cabang'}</span></td>
          <td>{source.sourceType === 'central' ? '—' : <span className={`source-category-badge${(source.itemCategory ?? 'BIASA') === 'X' ? ' is-mall' : ''}`}>{source.itemCategory ?? 'BIASA'}</span>}</td>
          <td>{source.sourceType === 'central' ? '—' : <span className="source-priority-badge">{distributionPriorityLabel(source.distributionPriority)}</span>}</td>
          <td><span className={`source-state${source.active ? ' is-active' : ''}`}>{source.active ? 'Siap' : 'Belum siap'}</span></td>
          <td><div className="source-table-actions"><button className="button button-secondary button-compact" type="button" onClick={() => onEdit(source)}><Pencil size={14} /> Ubah</button><details className="source-action-menu"><summary aria-label={`Tindakan ${source.alias}`} title={`Tindakan ${source.alias}`}><MoreHorizontal size={19} /></summary><button type="button" disabled={busySourceId === source.id} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onToggle(source) }}>{busySourceId === source.id ? <LoaderCircle size={14} className="spin" /> : source.active ? <X size={14} /> : <Check size={14} />}{source.active ? 'Tandai belum siap' : 'Tandai siap'}</button></details></div></td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <div className="empty-state"><strong>Sumber tidak ditemukan</strong><span>Ubah pencarian atau filter jenis sumber.</span><button className="button button-secondary" type="button" onClick={() => { setSearch(''); setType('all'); setCategory('all'); setPage(1) }}>Reset filter</button></div>}
    </div>
    <div className="pagination-bar"><span>{rows.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, rows.length)} dari {rows.length} sumber</span><div className="pagination-controls"><button type="button" className="icon-button" aria-label="Halaman sumber sebelumnya" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>Halaman <strong>{currentPage}</strong> dari <strong>{totalPages}</strong></span><button type="button" className="icon-button" aria-label="Halaman sumber berikutnya" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></div></div>
  </>
}
