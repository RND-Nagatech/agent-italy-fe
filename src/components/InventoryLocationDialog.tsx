import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import type { InventoryLocationSummary, InventorySummaryResult } from '../lib/types'
import { CardHeading } from './CardHeading'
import './InventoryLocationDialog.css'

const number = (value: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(value)
export function InventoryLocationDialog({ location, data, onClose }: { location: InventoryLocationSummary; data: InventorySummaryResult; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [search, setSearch] = useState('')
  const [showZero, setShowZero] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<{ key: 'weight' | 'share'; direction: 'asc' | 'desc' }>({ key: 'weight', direction: 'desc' })
  const tableRef = useRef<HTMLDivElement>(null)
  function changeSort(key: 'weight' | 'share') {
    setSort(current => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }))
    setPage(1)
    tableRef.current?.scrollTo({ top: 0 })
  }
  function sortIcon(key: 'weight' | 'share') {
    return sort.key !== key ? <ArrowUpDown size={15} aria-hidden="true" /> : sort.direction === 'asc' ? <ArrowUp size={15} aria-hidden="true" /> : <ArrowDown size={15} aria-hidden="true" />
  }
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => { dialog.close(); document.body.style.overflow = previousOverflow; if (previousFocus?.isConnected) previousFocus.focus() }
  }, [])
  const rows = data.jenis.flatMap(jenis => jenis.locations.filter(item => item.branchId === location.branchId && item.sourceType === location.sourceType && item.alias === location.alias).map(item => ({ jenis, item })))
    .filter(({ jenis, item }) => (showZero || item.status === 'unavailable' || (item.physicalStockWeight ?? 0) > 0) && `${jenis.kode} ${jenis.nama}`.toLocaleLowerCase('id-ID').includes(search.trim().toLocaleLowerCase('id-ID')))
    .sort((a, b) => {
      const value = (row: typeof a) => row.item.status !== 'available' || row.item.physicalStockWeight === null
        ? null : sort.key === 'weight' ? row.item.physicalStockWeight
          : row.jenis.networkStockWeight > 0 ? row.item.physicalStockWeight / row.jenis.networkStockWeight : null
      const left = value(a); const right = value(b)
      if (left === null || right === null) return left === right ? a.jenis.kode.localeCompare(b.jenis.kode) : left === null ? 1 : -1
      return (sort.direction === 'asc' ? left - right : right - left) || a.jenis.kode.localeCompare(b.jenis.kode)
    })
  const pages = Math.max(1, Math.ceil(rows.length / 20))
  const current = Math.min(page, pages)
  return <dialog ref={dialogRef} className="inventory-location-dialog" aria-labelledby="inventory-location-dialog-title" onCancel={e => { e.preventDefault(); onClose() }}>
    <header className="inventory-location-dialog-header"><div><CardHeading id="inventory-location-dialog-title">{location.alias}</CardHeading><p>{location.sourceType === 'central' ? 'Pusat' : 'Cabang'} · {location.branchId} · Rincian stok per Jenis</p></div><button className="icon-button" type="button" aria-label="Tutup rincian lokasi" onClick={onClose}><X size={20} /></button></header>
    <div className="inventory-location-dialog-summary"><div><span>Stok fisik lokasi</span><strong>{location.status === 'available' && location.physicalStockWeight !== null ? `${number(location.physicalStockWeight)} gram` : '—'}</strong></div><div><span>Jenis dengan stok</span><strong>{location.jenisWithStockCount === null ? '—' : number(location.jenisWithStockCount)}</strong></div></div>
    {location.status === 'unavailable' && <p className="location-detail-warning" role="status">Sumber lokasi belum dapat dibaca. Angka kosong bukan berarti stok nol.</p>}
    {!!location.recordsWithoutWeight && <p className="location-detail-warning" role="status">{number(location.recordsWithoutWeight)} record belum memiliki berat positif. Total gram dapat lebih rendah dari stok sebenarnya.</p>}
    <div className="inventory-location-dialog-tools"><label className="inventory-search"><Search size={15} aria-hidden="true" /><span className="sr-only">Cari Jenis di lokasi</span><input autoFocus value={search} placeholder="Cari kode atau nama Jenis" onChange={e => { setSearch(e.target.value); setPage(1) }} /></label><label className="location-detail-zero"><input type="checkbox" checked={showZero} onChange={e => { setShowZero(e.target.checked); setPage(1) }} />Tampilkan Jenis tanpa stok</label></div>
    <div ref={tableRef} className="inventory-location-dialog-table" tabIndex={0} role="region" aria-label="Tabel rincian stok, dapat digulir"><table><thead><tr><th scope="col"><span className="location-table-heading">Jenis</span><small>Kode dan nama</small></th><th scope="col" aria-sort={sort.key === 'weight' ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button className={`location-table-sort${sort.key === 'weight' ? ' is-active' : ''}`} type="button" onClick={() => changeSort('weight')} aria-label={`Urutkan stok fisik ${sort.key === 'weight' && sort.direction === 'desc' ? 'terkecil ke terbesar' : 'terbesar ke terkecil'}`}><span><strong>Stok fisik</strong><small>gram</small></span>{sortIcon('weight')}</button></th><th scope="col" aria-sort={sort.key === 'share' ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button className={`location-table-sort${sort.key === 'share' ? ' is-active' : ''}`} type="button" onClick={() => changeSort('share')} aria-label={`Urutkan porsi jaringan ${sort.key === 'share' && sort.direction === 'desc' ? 'terkecil ke terbesar' : 'terbesar ke terkecil'}`}><span><strong>Porsi jaringan</strong><small>Dari total Jenis yang sama (%)</small></span>{sortIcon('share')}</button></th></tr></thead><tbody>{rows.slice((current - 1) * 20, current * 20).map(({ jenis, item }) => <tr key={jenis.kode}><td><strong>{jenis.kode}</strong><small>{jenis.nama}</small></td><td>{item.status === 'available' && item.physicalStockWeight !== null ? number(item.physicalStockWeight) : '—'}</td><td>{item.status === 'available' && item.physicalStockWeight !== null && jenis.networkStockWeight > 0 ? `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(item.physicalStockWeight / jenis.networkStockWeight * 100)}%` : '—'}</td></tr>)}{!rows.length && <tr><td colSpan={3} className="composition-empty">{location.status === 'unavailable' ? 'Rincian lokasi belum tersedia.' : 'Tidak ada Jenis yang sesuai dengan filter.'}</td></tr>}</tbody></table></div>
    <footer className="inventory-location-dialog-footer"><span>{rows.length} Jenis · halaman {current} / {pages}</span><div><button className="button button-secondary button-compact" type="button" disabled={current === 1} onClick={() => setPage(current - 1)}><ChevronLeft size={15} />Sebelumnya</button><button className="button button-secondary button-compact" type="button" disabled={current === pages} onClick={() => setPage(current + 1)}>Berikutnya<ChevronRight size={15} /></button><button className="button button-primary button-compact" type="button" onClick={onClose}>Tutup</button></div></footer>
  </dialog>
}
