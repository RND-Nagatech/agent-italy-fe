import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ClipboardList, Download, History, LoaderCircle, Pencil, Plus, RefreshCw, Save, Search, Upload, X } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { CardHeading } from '../components/CardHeading'
import { SortHeader } from '../components/TableSort'
import { useTableSort } from '../lib/table-sort'
import { parseBaselineCsv, type BaselineItem, type BaselineListing } from '../lib/stock-baselines'
import './StockBaselinesPage.css'

type Audit = { revision: number; actorId: string; actorName?: string; changedAt: string; changes: Array<{ before: BaselineItem | null; after: BaselineItem }> }
const format = new Intl.NumberFormat('id-ID')
const date = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
function Modal({ title, busy, close, children }: { title: string; busy: boolean; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = ref.current, focus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; element?.showModal()
    return () => { element?.close(); document.body.style.overflow = overflow; if (focus?.isConnected) focus.focus() }
  }, [])
  return <dialog ref={ref} className="baseline-modal" aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) close() }}><header><CardHeading icon={<ClipboardList size={19} />}>{title}</CardHeading><button type="button" className="icon-button" aria-label="Tutup" disabled={busy} onClick={close}><X size={19} /></button></header>{children}</dialog>
}

export function StockBaselinesPage() {
  const { request } = useAuth()
  const [data, setData] = useState<BaselineListing | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [dialogError, setDialogError] = useState('')
  const [query, setQuery] = useState(''), [branch, setBranch] = useState('all'), [status, setStatus] = useState('all'), [page, setPage] = useState(1)
  const [edit, setEdit] = useState<{ original: boolean; item: BaselineItem } | null>(null), [preview, setPreview] = useState<BaselineItem[] | null>(null)
  const [audits, setAudits] = useState<Audit[] | null>(null), [historyLoading, setHistoryLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const sorting = useTableSort(undefined, () => setPage(1))
  const previewSorting = useTableSort()
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await request<BaselineListing>('/stock-baselines')) } catch (err) { setError(err instanceof Error ? err.message : 'Master gagal dimuat.') } finally { setLoading(false) }
  }, [request])
  useEffect(() => {
    const controller = new AbortController()
    request<BaselineListing>('/stock-baselines', { signal: controller.signal }).then(setData).catch(err => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Master gagal dimuat.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [request])
  const branchName = useCallback((id: string) => data?.branches.find(row => row.branchId === id)?.alias || id, [data])
  const jenisName = useCallback((code: string) => data?.availableJenis.find(row => row.kode === code)?.nama || code, [data])
  const filtered = useMemo(() => (data?.items ?? []).filter(row => (branch === 'all' || row.branchId === branch) && (status === 'all' || row.active === (status === 'active')) && `${row.branchId} ${branchName(row.branchId)} ${row.jenisCode} ${jenisName(row.jenisCode)}`.toLowerCase().includes(query.toLowerCase())), [data, branch, status, query, branchName, jenisName])
  const ordered = sorting.order(filtered, (row, key) => key === 'baselinePcs' ? row.baselinePcs : key === 'branch' ? branchName(row.branchId) : row.jenisCode)
  const pageCount = Math.max(1, Math.ceil(ordered.length / 20)), currentPage = Math.min(page, pageCount)
  const visible = ordered.slice((currentPage - 1) * 20, currentPage * 20)
  const close = () => { if (!busy) { setEdit(null); setPreview(null); setDialogError('') } }
  const save = async (changes: BaselineItem[]) => {
    if (!data) return
    setBusy(true); setDialogError(''); setNotice('')
    try {
      const updated = await request<BaselineListing>('/stock-baselines', { method: 'PATCH', body: JSON.stringify({ revision: data.revision, changes }) })
      setData(updated); setEdit(null); setPreview(null); setPage(1)
      setNotice(`Patokan tersimpan pada versi ${updated.revision}. Rekomendasi berikutnya memakai patokan terbaru.`)
    } catch (err) { setDialogError(err instanceof Error ? err.message : 'Penyimpanan gagal.') } finally { setBusy(false) }
  }
  const importFile = async (file?: File) => {
    if (!file || !data) return
    setError(''); setDialogError('')
    if (file.size > 1_000_000) { setError('Ukuran file maksimal 1 MB.'); return }
    try { setPreview(parseBaselineCsv(await file.text(), data)) } catch (err) { setError(err instanceof Error ? err.message : 'CSV tidak valid.') }
  }
  const history = async () => {
    setHistoryLoading(true); setError('')
    try { setAudits((await request<{ items: Audit[] }>('/stock-baselines/history')).items) } catch (err) { setError(err instanceof Error ? err.message : 'Riwayat gagal dimuat.') } finally { setHistoryLoading(false) }
  }
  const download = () => {
    const content = 'cabang,jenis,patokan,aktif,catatan\n'
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'template-patokan-stok.csv'; link.click(); URL.revokeObjectURL(url)
  }
  return <div className="baseline-page">
    <div className="page-heading"><div><h1>Patokan stok</h1><p className="page-description">Stok dasar per cabang dan Jenis, ditambahkan ke kebutuhan penjualan 7 hari.</p></div><div className="baseline-actions"><button className="button button-secondary" type="button" disabled={loading} onClick={() => void load()}><RefreshCw size={16} className={loading ? 'spin' : ''} />Perbarui</button><button className="button button-primary" type="button" disabled={!data || Boolean(data.catalogWarning)} onClick={() => { setDialogError(''); setEdit({ original: false, item: { branchId: branch !== 'all' ? branch : '', jenisCode: '', baselinePcs: 0, active: true, note: '' } }) }}><Plus size={16} />Tambah patokan</button></div></div>
    {error && <div className="baseline-notice is-error" role="alert">{error}</div>}
    {notice && <div className="baseline-notice" role="status">{notice}</div>}
    {data?.catalogWarning && <div className="baseline-notice is-error" role="alert">{data.catalogWarning}</div>}
    <section className="panel baseline-rule"><div><CardHeading>Dasar perhitungan restock</CardHeading><p><strong>Target total = patokan + kebutuhan penjualan 7 hari</strong></p><span>Permintaan = selisih positif target total dengan stok fisik + kiriman OPEN. Donor menyisakan target yang sama; CLOS tidak ditambahkan.</span></div><dl><div><dt>Patokan aktif</dt><dd>{format.format(data?.items.filter(row => row.active).length ?? 0)}</dd></div><div><dt>Versi master</dt><dd>{data?.revision ?? '—'}</dd></div></dl></section>
    <section className="panel baseline-directory">
      <header><div><CardHeading>Master patokan cabang</CardHeading><p>{data?.updatedAt ? `Diperbarui ${date(data.updatedAt)}` : 'Belum ada patokan tersimpan.'} · Satuan pcs</p></div><div className="baseline-actions"><button className="button button-secondary" type="button" disabled={historyLoading} onClick={() => void history()}>{historyLoading ? <LoaderCircle size={15} className="spin" /> : <History size={15} />}Riwayat</button><button className="button button-secondary" type="button" onClick={download}><Download size={15} />Template CSV</button><button className="button button-secondary" type="button" disabled={!data || Boolean(data.catalogWarning)} onClick={() => fileRef.current?.click()}><Upload size={15} />Impor CSV</button><input ref={fileRef} type="file" accept=".csv,.txt,.tsv" hidden onChange={event => { void importFile(event.target.files?.[0]); event.target.value = '' }} /></div></header>
      <div className="baseline-toolbar"><label className="baseline-search"><Search size={16} /><input aria-label="Cari cabang atau Jenis" placeholder="Cari cabang atau Jenis…" value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} /></label><select aria-label="Filter cabang" value={branch} onChange={event => { setBranch(event.target.value); setPage(1) }}><option value="all">Semua cabang</option>{data?.branches.map(row => <option key={row.branchId} value={row.branchId}>{row.alias} ({row.branchId})</option>)}</select><select aria-label="Filter status" value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="all">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></div>
      <div className="baseline-table-scroll"><table><thead><tr><SortHeader column="branch" sort={sorting.sort} onSort={sorting.change} numeric={false}>Cabang</SortHeader><SortHeader column="jenis" sort={sorting.sort} onSort={sorting.change} numeric={false}>Jenis</SortHeader><SortHeader column="baselinePcs" sort={sorting.sort} onSort={sorting.change}>Patokan (pcs)</SortHeader><th>Status</th><th>Catatan</th><th><span className="sr-only">Aksi</span></th></tr></thead><tbody>{visible.map(row => <tr key={`${row.branchId}:${row.jenisCode}`}><td><strong>{branchName(row.branchId)}</strong><small>{row.branchId}</small></td><td><strong>{row.jenisCode}</strong><small>{jenisName(row.jenisCode)}</small></td><td className="is-number"><strong>{format.format(row.baselinePcs)}</strong></td><td><span className={`baseline-status${row.active ? ' is-active' : ''}`}>{row.active ? 'Aktif' : 'Nonaktif'}</span></td><td>{row.note || '—'}</td><td><button className="button button-secondary" type="button" onClick={() => { setDialogError(''); setEdit({ original: true, item: { ...row } }) }}><Pencil size={14} />Edit</button></td></tr>)}{!visible.length && <tr><td colSpan={6} className="baseline-empty">{loading ? 'Memuat patokan…' : data?.items.length ? 'Tidak ada patokan yang cocok dengan filter.' : 'Tambahkan patokan pertama atau impor CSV. Data tidak otomatis diisi dari foto.'}</td></tr>}</tbody></table></div>
      <footer><span>{format.format(filtered.length)} pasangan · halaman {currentPage}/{pageCount}</span><div className="baseline-actions"><button className="button button-secondary" type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Sebelumnya</button><button className="button button-secondary" type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Berikutnya</button></div></footer>
      <p className="baseline-footnote">Patokan aktif 0 pcs adalah aturan yang sengaja diatur. Pasangan belum diatur atau nonaktif memakai tambahan 0 pcs; kebutuhan penjualan 7 hari tetap dihitung. Riwayat menyimpan 20 perubahan versi terakhir.</p>
    </section>
    {edit && data && <Modal title={edit.original ? 'Edit patokan stok' : 'Tambah patokan stok'} busy={busy} close={close}><form onSubmit={event => { event.preventDefault(); void save([edit.item]) }}><div className="baseline-form"><label>Cabang<select aria-label="Cabang patokan" required disabled={edit.original || busy} value={edit.item.branchId} onChange={event => setEdit({ ...edit, item: { ...edit.item, branchId: event.target.value } })}><option value="">Pilih cabang</option>{data.branches.filter(row => row.active || row.branchId === edit.item.branchId).map(row => <option key={row.branchId} value={row.branchId}>{row.alias} ({row.branchId})</option>)}</select></label><label>Jenis<select aria-label="Jenis patokan" required disabled={edit.original || busy} value={edit.item.jenisCode} onChange={event => setEdit({ ...edit, item: { ...edit.item, jenisCode: event.target.value } })}><option value="">Pilih Jenis</option>{data.availableJenis.map(row => <option key={row.kode} value={row.kode}>{row.kode} · {row.nama}</option>)}</select></label><label>Patokan stok dasar (pcs)<input type="number" min={0} max={1000000} step={1} required disabled={busy} value={Number.isFinite(edit.item.baselinePcs) ? edit.item.baselinePcs : ''} onChange={event => setEdit({ ...edit, item: { ...edit.item, baselinePcs: event.target.value === '' ? Number.NaN : Number(event.target.value) } })} /></label><label>Catatan<input maxLength={300} disabled={busy} value={edit.item.note} placeholder="Alasan atau sumber perubahan" onChange={event => setEdit({ ...edit, item: { ...edit.item, note: event.target.value } })} /></label><label className="baseline-checkbox"><input type="checkbox" disabled={busy} checked={edit.item.active} onChange={event => setEdit({ ...edit, item: { ...edit.item, active: event.target.checked } })} />Patokan aktif</label>{!edit.item.active && <p>Setelah disimpan, tambahan stok dasar pasangan ini menjadi 0 pcs. Nilai lama tetap ada untuk diaktifkan kembali.</p>}{!edit.original && data.items.some(row => row.branchId === edit.item.branchId && row.jenisCode === edit.item.jenisCode) && <p className="baseline-error">Pasangan sudah ada. Gunakan Edit pada tabel agar perubahan terlihat jelas.</p>}{dialogError && <p className="baseline-error" role="alert">{dialogError}</p>}</div><footer><button className="button button-secondary" type="button" disabled={busy} onClick={close}>Batal</button><button className="button button-primary" type="submit" disabled={busy || (!edit.original && data.items.some(row => row.branchId === edit.item.branchId && row.jenisCode === edit.item.jenisCode))}>{busy ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}Simpan patokan</button></footer></form></Modal>}
    {preview && data && <Modal title={`Tinjau impor · ${preview.length} pasangan`} busy={busy} close={close}><p className="baseline-modal-copy">Belum ada perubahan disimpan. Kode/alias cabang sudah dipetakan ke ID aplikasi. Pasangan yang sudah ada diperbarui; pasangan lain tetap.</p><div className="baseline-table-scroll"><table><thead><tr><th>Cabang / Jenis</th><SortHeader column="old" sort={previewSorting.sort} onSort={previewSorting.change}>Patokan lama</SortHeader><SortHeader column="new" sort={previewSorting.sort} onSort={previewSorting.change}>Patokan baru (pcs)</SortHeader><th>Status baru</th></tr></thead><tbody>{previewSorting.order(preview, (row, key) => key === 'new' ? row.baselinePcs : data.items.find(old => old.branchId === row.branchId && old.jenisCode === row.jenisCode)?.baselinePcs).map(row => <tr key={`${row.branchId}:${row.jenisCode}`}><td><strong>{branchName(row.branchId)} ({row.branchId})</strong><small>{row.jenisCode} · {jenisName(row.jenisCode)}</small></td><td className="is-number">{data.items.find(old => old.branchId === row.branchId && old.jenisCode === row.jenisCode)?.baselinePcs ?? 'Belum diatur'}</td><td className="is-number">{format.format(row.baselinePcs)}</td><td>{row.active ? 'Aktif' : 'Nonaktif'}</td></tr>)}</tbody></table></div>{dialogError && <p className="baseline-error" role="alert">{dialogError}</p>}<footer><button className="button button-secondary" type="button" disabled={busy} onClick={close}>Batal</button><button className="button button-primary" type="button" disabled={busy} onClick={() => void save(preview)}>{busy ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}Simpan {preview.length} patokan</button></footer></Modal>}
    {audits && <Modal title="Riwayat patokan stok" busy={false} close={() => setAudits(null)}><div className="baseline-audits">{audits.length ? audits.map(audit => <section key={audit.revision}><strong>Versi {audit.revision}</strong><p>{date(audit.changedAt)} · {audit.actorName || audit.actorId} · {audit.changes.length} pasangan</p><div className="baseline-table-scroll"><table><thead><tr><th>Cabang / Jenis</th><th>Patokan (pcs)</th><th>Status</th></tr></thead><tbody>{audit.changes.map(change => <tr key={`${change.after.branchId}:${change.after.jenisCode}`}><td>{change.after.branchId} / {change.after.jenisCode}</td><td>{change.before?.baselinePcs ?? 'Belum diatur'} → {change.after.baselinePcs}</td><td>{change.after.active ? 'Aktif' : 'Nonaktif'}</td></tr>)}</tbody></table></div></section>) : <p>Belum ada perubahan patokan.</p>}</div><footer><button className="button button-secondary" type="button" onClick={() => setAudits(null)}>Tutup</button></footer></Modal>}
  </div>
}
