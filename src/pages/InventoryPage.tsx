import { useTableSort } from '../lib/table-sort'
import { AlertTriangle, Boxes, CircleHelp, RefreshCw, Search, Warehouse } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { getUserQueryScope, useSharedQuery } from '../lib/shared-query'
import type { InventorySummaryResult } from '../lib/types'
import './InventoryPage.css'
import { InventoryDistribution } from '../components/InventoryDistribution'
import { CardHeading } from '../components/CardHeading'

type InventoryView = 'jenis' | 'locations'

function formatWeight(value: number | null | undefined): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(value ?? 0)
}

function formatCount(value: number | null | undefined): string {
  return new Intl.NumberFormat('id-ID').format(value ?? 0)
}

function formatShare(value: number, total: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return '—'
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format((value / total) * 100)}%`
}

function formatSourceType(sourceType: 'branch' | 'central'): string {
  return sourceType === 'central' ? 'Pusat' : 'Cabang'
}

export function InventoryPage() {
  const { user, request } = useAuth()
  const scope = getUserQueryScope(user)
  const queryKey = scope ? `inventory-summary:${scope}` : null
  const query = useSharedQuery(
    queryKey,
    () => request<InventorySummaryResult>('/agent/inventory-summary'),
    30_000,
  )
  const [view, setView] = useState<InventoryView>('jenis')
  const [search, setSearch] = useState('')
  const [locationFilter, setLocationFilter] = useState('all')
  const [showZeroStock, setShowZeroStock] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(20)
  const jenisSort = useTableSort()
  const locationSort = useTableSort(undefined, () => setPage(1))
  const data = query.data
  const normalizedSearch = search.trim().toLocaleLowerCase('id-ID')

  const visibleJenis = useMemo(() => (data?.jenis ?? []).filter((jenis) => {
    const matchesSearch = !normalizedSearch || `${jenis.kode} ${jenis.nama}`.toLocaleLowerCase('id-ID').includes(normalizedSearch)
    return matchesSearch && (showZeroStock || jenis.networkStockWeight > 0)
  }), [data?.jenis, normalizedSearch, showZeroStock])

  const inventoryRows = useMemo(() => (data?.jenis ?? []).flatMap((jenis) => jenis.locations
    .filter((location) => locationFilter === 'all' || location.branchId === locationFilter
      || (locationFilter === 'central' && location.sourceType === 'central'))
    .filter((location) => showZeroStock || location.status === 'unavailable' || (location.physicalStockWeight ?? 0) > 0)
    .filter(() => !normalizedSearch || `${jenis.kode} ${jenis.nama}`.toLocaleLowerCase('id-ID').includes(normalizedSearch))
    .map((location) => ({ jenis, location }))), [data?.jenis, locationFilter, normalizedSearch, showZeroStock])

  const orderedInventoryRows = useMemo(() => [...inventoryRows].sort((left, right) => {
    if (left.location.sourceType !== right.location.sourceType) return left.location.sourceType === 'central' ? -1 : 1
    const sourceSort = left.location.alias.localeCompare(right.location.alias)
    return sourceSort || left.jenis.kode.localeCompare(right.jenis.kode)
  }), [inventoryRows])
  const pageCount = Math.max(1, Math.ceil(orderedInventoryRows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const sortedInventoryRows = locationSort.order(orderedInventoryRows, (row, key) => key === 'weight' ? row.location.physicalStockWeight : row.jenis.networkStockWeight > 0 ? (key === 'central' ? row.jenis.centralStockWeight : row.jenis.branchStockWeight) / row.jenis.networkStockWeight : null)
  const pageRows = sortedInventoryRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const branchNetworkShare = data && data.summary.totalPhysicalStockWeight > 0
    ? data.summary.branchPhysicalStockWeight / data.summary.totalPhysicalStockWeight * 100
    : 0
  const updatedAt = data?.asOf ? new Date(data.asOf) : null
  const updatedLabel = updatedAt && Number.isFinite(updatedAt.getTime())
    ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(updatedAt)
    : 'Belum tersedia'

  return (
    <div className="inventory-page">
      <div className="inventory-page-heading">
        <div>
          <p className="eyebrow">POSISI STOK JARINGAN</p>
          <h1>Inventory fisik</h1>
          <p className="page-description">Lihat stok Pusat dan setiap cabang dalam satu ringkasan, dipisahkan menurut Jenis.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={query.reload} disabled={query.loading}>
          <RefreshCw size={15} className={query.loading ? 'inventory-spin' : ''} /> Perbarui inventory
        </button>
      </div>

      {query.loading && !data && <section className="panel inventory-loading" role="status"><span className="inventory-loading-line" /><span className="inventory-loading-line" /><span className="inventory-loading-line" /></section>}
      {query.error && !data && (
        <section className="panel inventory-error" role="alert">
          <AlertTriangle size={20} />
          <div><strong>Inventory belum dapat dimuat</strong><p>{query.error}</p></div>
          <button className="button button-secondary" type="button" onClick={query.reload}>Coba lagi</button>
        </section>
      )}

      {data && <>
        {query.error && <div className="inventory-inline-error" role="status">Data terakhir tetap ditampilkan. Pembaruan terbaru gagal: {query.error}</div>}
        <section className="inventory-metrics" aria-label="Ringkasan stok fisik">
          <article className="inventory-total-card">
            <CardHeading icon={<Boxes size={19} />}>Total stok fisik jaringan</CardHeading>
            <strong>{formatWeight(data.summary.totalPhysicalStockWeight)} <small>gram</small></strong>
            <p>{formatCount(data.summary.jenisWithStockCount)} Jenis memiliki stok pada {formatCount(data.summary.availableLocationCount)} lokasi yang terbaca.</p>
            <div className="inventory-total-distribution"><span>Bagian stok yang berada di cabang</span><strong>{formatShare(data.summary.branchPhysicalStockWeight, data.summary.totalPhysicalStockWeight)}</strong></div>
            <div className="inventory-total-rule"><span style={{ width: `${Math.max(0, Math.min(100, branchNetworkShare))}%` }} /></div>
          </article>
          <article className="inventory-metric-card inventory-central-card">
            <CardHeading icon={<Warehouse size={19} />}>Stok fisik Pusat</CardHeading>
            <strong>{formatWeight(data.summary.centralPhysicalStockWeight)} <small>gram</small></strong>
            <p>{formatCount(data.summary.centralSourceCount)} sumber Pusat aktif</p>
          </article>
          <article className="inventory-metric-card inventory-branch-card">
            <CardHeading icon={<Boxes size={19} />}>Stok fisik cabang</CardHeading>
            <strong>{formatWeight(data.summary.branchPhysicalStockWeight)} <small>gram</small></strong>
            <p>{formatCount(data.summary.branchCount)} sumber cabang terdaftar</p>
          </article>
        </section>

        <InventoryDistribution data={data} updatedLabel={updatedLabel} />

        {(data.summary.centralSourceCount === 0 || data.summary.unavailableLocationCount > 0 || data.summary.locationsWithIncompleteWeight > 0 || data.summary.departmentNamesUnavailableCount > 0) && (
          <div className="inventory-quality-notice" role="status">
            <AlertTriangle size={17} />
            <span>
              {data.summary.centralSourceCount === 0 && <>Sumber Pusat belum ditandai aktif; angka Pusat 0 gram bukan konfirmasi bahwa stok fisik Pusat kosong. </>}
              {data.summary.unavailableLocationCount > 0 && <>{formatCount(data.summary.unavailableLocationCount)} sumber gagal dibaca. </>}
              {data.summary.locationsWithIncompleteWeight > 0 && <>{formatCount(data.summary.recordsWithoutWeight)} record stok tidak memiliki berat positif. </>}
              {data.summary.departmentNamesUnavailableCount > 0 && <>Nama Jenis belum tersedia pada {formatCount(data.summary.departmentNamesUnavailableCount)} sumber; kode Jenis tetap ditampilkan.</>}
              Total gram hanya mencakup data yang dapat dibaca.
            </span>
          </div>
        )}

        <section className="panel inventory-data-panel" aria-labelledby="inventory-data-title">
          <div className="inventory-section-heading inventory-table-heading">
            <div><CardHeading id="inventory-data-title">Rincian inventory</CardHeading><p>Stok fisik dihitung dari berat per record dikalikan stock_on_hand.</p></div>
            <label className="inventory-search"><Search size={15} /><span className="sr-only">Cari Jenis</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Cari kode atau nama Jenis" /></label>
          </div>
          <div className="inventory-view-tabs" role="group" aria-label="Tampilan inventory">
            <button type="button" aria-pressed={view === 'jenis'} className={view === 'jenis' ? 'is-selected' : ''} onClick={() => { setView('jenis'); setPage(1) }}>Ringkasan per Jenis <span>{formatCount(visibleJenis.length)}</span></button>
            <button type="button" aria-pressed={view === 'locations'} className={view === 'locations' ? 'is-selected' : ''} onClick={() => { setView('locations'); setPage(1) }}>Rincian lokasi <span>{formatCount(orderedInventoryRows.length)}</span></button>
          </div>

          {view === 'jenis' ? (
            <>
              <div className="inventory-table-controls">
                <label className="inventory-zero-toggle"><input type="checkbox" checked={showZeroStock} onChange={(event) => setShowZeroStock(event.target.checked)} /><span>Tampilkan Jenis tanpa stok</span></label>
                <span>Persentase dibanding total jaringan untuk Jenis yang sama</span>
              </div>
              <div className="inventory-table-scroll">
                <table className="inventory-table inventory-jenis-table">
                  <thead><tr><th scope="col">Jenis</th>{jenisSort.header('centralStockWeight', 'Pusat (gram)')}{jenisSort.header('centralShare', 'Porsi Pusat (%)')}{jenisSort.header('branchStockWeight', 'Seluruh cabang (gram)')}{jenisSort.header('branchShare', 'Porsi cabang (%)')}{jenisSort.header('networkStockWeight', 'Total jaringan (gram)')}{jenisSort.header('branchLocationsWithStock', 'Cabang memiliki stok')}</tr></thead>
                  <tbody>{jenisSort.order(visibleJenis, (row, key) => key === 'centralShare' || key === 'branchShare' ? row.networkStockWeight > 0 ? (key === 'centralShare' ? row.centralStockWeight : row.branchStockWeight) / row.networkStockWeight : null : row[key as 'centralStockWeight' | 'branchStockWeight' | 'networkStockWeight' | 'branchLocationsWithStock']).map((jenis) => <tr key={jenis.kode}>
                    <td><strong>Jenis {jenis.kode}</strong><small>{jenis.nama}</small></td>
                    <td className="is-number">{formatWeight(jenis.centralStockWeight)}</td>
                    <td className="is-number">{formatShare(jenis.centralStockWeight, jenis.networkStockWeight)}</td>
                    <td className="is-number">{formatWeight(jenis.branchStockWeight)}</td>
                    <td className="is-number">{formatShare(jenis.branchStockWeight, jenis.networkStockWeight)}</td>
                    <td className="is-number inventory-network-weight">{formatWeight(jenis.networkStockWeight)}</td>
                    <td className="is-number">{formatCount(jenis.branchLocationsWithStock)}</td>
                  </tr>)}</tbody>
                </table>
                {!visibleJenis.length && <div className="inventory-empty-inline">Tidak ada Jenis yang cocok. Ubah pencarian atau aktifkan tampilan Jenis tanpa stok.</div>}
              </div>
            </>
          ) : (
            <>
              <div className="inventory-table-controls">
                <label className="inventory-location-filter"><span>Lokasi</span><select value={locationFilter} onChange={(event) => { setLocationFilter(event.target.value); setPage(1) }}><option value="all">Pusat dan semua cabang</option><option value="central">Pusat saja</option>{data.locations.filter((location) => location.sourceType === 'branch').map((location) => <option value={location.branchId} key={location.branchId}>{location.alias} · {location.branchId}</option>)}</select></label>
                <label className="inventory-zero-toggle"><input type="checkbox" checked={showZeroStock} onChange={(event) => { setShowZeroStock(event.target.checked); setPage(1) }} /><span>Tampilkan Jenis tanpa stok</span></label>
                <span>{formatCount(orderedInventoryRows.length)} baris inventory</span>
              </div>
              <div className="inventory-table-scroll">
                <table className="inventory-table inventory-location-table">
                  <thead><tr><th scope="col">Lokasi</th><th scope="col">Jenis</th>{locationSort.header('weight', 'Stok fisik (gram)')}{locationSort.header('central', 'Porsi Pusat dari total Jenis')}{locationSort.header('branch', 'Porsi seluruh cabang dari total Jenis')}<th scope="col">Status sumber</th></tr></thead>
                  <tbody>{pageRows.map(({ jenis, location }) => <tr key={`${location.branchId}:${jenis.kode}`}>
                    <td><strong>{location.sourceType === 'central' ? 'Pusat · ' : ''}{location.alias}</strong><small>{location.branchId} · {formatSourceType(location.sourceType)}</small></td>
                    <td><strong>Jenis {jenis.kode}</strong><small>{jenis.nama}</small></td>
                    <td className="is-number inventory-network-weight">{location.status === 'available' ? formatWeight(location.physicalStockWeight) : '—'}</td>
                    <td className="is-number">{formatShare(jenis.centralStockWeight, jenis.networkStockWeight)}</td>
                    <td className="is-number">{formatShare(jenis.branchStockWeight, jenis.networkStockWeight)}</td>
                    
                    <td><span className={`inventory-source-status${location.status === 'unavailable' ? ' is-unavailable' : ''}`}>{location.status === 'available' ? 'Terbaca' : 'Tidak tersedia'}</span></td>
                  </tr>)}</tbody>
                </table>
                {!orderedInventoryRows.length && <div className="inventory-empty-inline">Tidak ada baris inventory untuk filter ini.</div>}
              </div>
              <div className="inventory-pagination">
                <span>Menampilkan {orderedInventoryRows.length ? formatCount((currentPage - 1) * pageSize + 1) : 0}–{formatCount(Math.min(currentPage * pageSize, orderedInventoryRows.length))} dari {formatCount(orderedInventoryRows.length)} baris</span>
                <div><label>Baris<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as 20 | 50 | 100); setPage(1) }}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></label><button type="button" className="inventory-page-button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Halaman sebelumnya">‹</button><span>Halaman {currentPage} / {pageCount}</span><button type="button" className="inventory-page-button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} aria-label="Halaman berikutnya">›</button></div>
              </div>
            </>
          )}
          <div className="inventory-footnote"><CircleHelp size={14} /><span>Hanya stok fisik `tm_barang` dengan status_hancur=false dan stock_on_hand&gt;0. Porsi Pusat/cabang dihitung terhadap total jaringan untuk Jenis yang sama; ini menunjukkan komposisi stok saat ini, bukan riwayat asal distribusi. `deleted_by` tidak dipakai sebagai filter. Kiriman OPEN tidak dihitung sebagai stok lokasi.</span></div>
        </section>
      </>}
    </div>
  )
}
