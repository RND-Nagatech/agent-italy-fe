import { useTableSort } from '../lib/table-sort'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, ArrowUpRight } from 'lucide-react'
import type { InventorySummaryResult, InventoryLocationSummary } from '../lib/types'
import { CardHeading } from './CardHeading'
import './InventoryDistribution.css'
import { InventoryLocationDialog } from './InventoryLocationDialog'

const grams = (value: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(value)
const percent = (value: number, total: number) => total > 0 ? `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value / total * 100)}%` : '—'
export function InventoryDistribution({ data, updatedLabel }: { data: InventorySummaryResult; updatedLabel: string }) {
  const [selected, setSelected] = useState<InventoryLocationSummary | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { centralPhysicalStockWeight: central, branchPhysicalStockWeight: branches, totalPhysicalStockWeight: network } = data.summary
  const ranked = useMemo(() => [...data.locations].filter(location => location.sourceType === 'branch').sort((a, b) => {
    if (a.status !== b.status) return a.status === 'available' ? -1 : 1
    return (b.physicalStockWeight ?? -1) - (a.physicalStockWeight ?? -1) || a.alias.localeCompare(b.alias)
  }).map((location, index) => ({ location, rank: index + 1 })), [data.locations])
  const sorting = useTableSort(undefined, () => setPage(1))
  const term = search.trim().toLocaleLowerCase('id-ID')
  const filtered = ranked.filter(({ location }) => `${location.alias} ${location.branchId}`.toLocaleLowerCase('id-ID').includes(term))
  const pages = Math.max(1, Math.ceil(filtered.length / 8))
  const current = Math.min(page, pages)
  const sorted = sorting.order(filtered, (row, key) => key === 'rank' ? row.rank : row.location.status === 'available' ? row.location.physicalStockWeight : null)
  const visible = sorted.slice((current - 1) * 8, current * 8)
  const centralShare = network > 0 ? Math.max(0, Math.min(100, central / network * 100)) : 0
  const branchShare = network > 0 ? Math.max(0, Math.min(100 - centralShare, branches / network * 100)) : 0
  return <section className="panel inventory-composition" aria-labelledby="inventory-location-title">
    <div className="inventory-section-heading"><div><CardHeading id="inventory-location-title">Komposisi stok jaringan</CardHeading><p>Porsi stok Pusat dan cabang terhadap total jaringan yang terbaca.</p></div><span className="inventory-updated">Diperbarui {updatedLabel}</span></div>
    <div className="inventory-composition-summary">
      <div className="inventory-composition-labels"><div><span><i className="composition-dot central" />{data.locations.filter(item => item.sourceType === 'central').length === 1 ? <button className="inventory-location-open" type="button" aria-haspopup="dialog" onClick={() => setSelected(data.locations.find(item => item.sourceType === 'central')!)}>Pusat<ArrowUpRight size={13} aria-hidden="true" /></button> : 'Pusat'}</span><strong>{percent(central, network)}</strong></div><div><span><i className="composition-dot branch" />Seluruh cabang</span><strong>{percent(branches, network)}</strong></div></div>
      <div className="inventory-composition-bar" role="img" aria-label={`Porsi stok jaringan: Pusat ${percent(central, network)}, cabang ${percent(branches, network)}`}><span className="central" style={{ width: `${centralShare}%` }} /><span className="branch" style={{ width: `${branchShare}%` }} /></div>
      <div className="inventory-composition-weights"><span>{grams(central)} gram</span><span>{grams(branches)} gram</span></div>
      {network <= 0 && <p className="composition-empty">Belum ada stok fisik terbaca untuk menghitung komposisi.</p>}
    </div>
    <div className="inventory-branch-heading"><div><CardHeading as="h3">Sebaran stok antar cabang</CardHeading><p>Persentase dihitung dari total stok seluruh cabang: {grams(branches)} gram. Pusat tidak termasuk.</p></div><label className="inventory-search"><Search size={15} aria-hidden="true" /><span className="sr-only">Cari cabang</span><input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Cari nama atau kode cabang" /></label></div>
    <div className="inventory-branch-table-scroll"><table className="inventory-branch-table"><thead><tr>{sorting.header('rank', 'Peringkat')}<th scope="col">Cabang</th>{sorting.header('weight', 'Stok fisik (gram)')}{sorting.header('share', 'Porsi stok cabang')}</tr></thead><tbody>{visible.map(({ location, rank }) => {
      const available = location.status === 'available'
      const weight = location.physicalStockWeight ?? 0
      const share = available && branches > 0 ? Math.max(0, Math.min(100, weight / branches * 100)) : 0
      return <tr key={`${location.branchId}:${location.alias}`}><td className="inventory-branch-rank is-number">{available ? String(rank).padStart(2, '0') : '—'}</td><td><button className="inventory-location-open" type="button" aria-haspopup="dialog" aria-label={`Buka rincian inventory ${location.alias}`} onClick={() => setSelected(location)}>{location.alias}<ArrowUpRight size={13} aria-hidden="true" /></button><small>{location.branchId}{!available && ' · Sumber tidak terbaca'}</small></td><td className="inventory-branch-weight is-number">{available ? grams(weight) : '—'}</td><td><div className="inventory-branch-share"><div className="inventory-branch-track" aria-hidden="true"><span style={{ width: `${share}%` }} /></div><strong>{available ? percent(weight, branches) : '—'}</strong></div></td></tr>
    })}{!visible.length && <tr><td colSpan={4} className="composition-empty">{search ? 'Tidak ada cabang yang cocok dengan pencarian.' : 'Belum ada sumber cabang untuk ditampilkan.'}</td></tr>}</tbody></table></div>
    <div className="inventory-branch-pagination"><span>{filtered.length ? `${(current - 1) * 8 + 1}–${Math.min(current * 8, filtered.length)} dari ${filtered.length} cabang` : '0 cabang'} · 8 per halaman</span><div><button className="button button-secondary button-compact" type="button" disabled={current <= 1} onClick={() => setPage(current - 1)}><ChevronLeft size={15} />Sebelumnya</button><span>{current} / {pages}</span><button className="button button-secondary button-compact" type="button" disabled={current >= pages} onClick={() => setPage(current + 1)}>Berikutnya<ChevronRight size={15} /></button></div></div>
    {selected && <InventoryLocationDialog key={`${selected.sourceType}:${selected.branchId}:${selected.alias}`} location={data.locations.find(item => item.sourceType === selected.sourceType && item.branchId === selected.branchId && item.alias === selected.alias) || selected} data={data} onClose={() => setSelected(null)} />}
  </section>
}
