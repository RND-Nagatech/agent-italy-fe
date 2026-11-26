import { useEffect, useRef, useState } from 'react'
import { CalendarDays, FileCheck2, LoaderCircle, Plus, Trash2, Upload, X } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { CardHeading } from './CardHeading'
import { dailyPriceWindows, readPriceAttachment, type PriceAuditScope, type PriceAuditSelection, type PriceReference } from '../lib/price-audit'
import './PriceAuditForm.css'

type WindowDraft = { id: string; date: string; fromTime: string; toTime: string; files: PriceReference[] }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const currency = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
const conditionLabel = (value: string) => (({ GOOD: 'BB Barang Bagus / buyback', SCRAP: 'Ancuran luar toko', STONE: 'Barang Mata/Jelek ada Cap', DAMAGED_8: '8K Rusak', DAMAGED_9: '9K Rusak', ANY: 'Umum' } as Record<string, string>)[value] ?? value)
export function PriceAuditForm({ sessionId, initialScope, onClose, onSubmit }: { sessionId: string; initialScope?: PriceAuditScope; onClose: () => void; onSubmit: (selection: PriceAuditSelection) => void }) {
  const { request } = useAuth()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [windows, setWindows] = useState<WindowDraft[]>(() => initialScope?.windows?.length
    ? initialScope.windows.map(w => ({ ...w, id: crypto.randomUUID(), files: initialScope.references?.filter(f => w.attachmentIds.includes(f.id)) ?? [] }))
    : [{ id: crypto.randomUUID(), date: today(), fromTime: '09:00', toTime: '17:00', files: [] }])
  const [tolerance, setTolerance] = useState(0)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState('')
  const [error, setError] = useState(initialScope?.dateConflict ? 'Tanggal pada pesan berbeda dari tanggal file. Periksa tanggal acuan sebelum melanjutkan.' : '')
  const [failedFile, setFailedFile] = useState<{ windowId: string; id: string; filename: string } | null>(null)
  const hasSales = windows.some(w => w.files.some(file => file.rows.some(row => row.kind === 'sales')))
  const hasBuyback = windows.some(w => w.files.some(file => file.rows.some(row => row.kind === 'buyback')))
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => { dialog.close(); if (focus?.isConnected) focus.focus() }
  }, [])
  const readFile = async (windowId: string, file: { id: string; filename: string }) => {
    const result = await readPriceAttachment(sessionId, file.id, request, state => setUploading(`${file.filename}: ${state.message} · ${Math.floor(state.elapsedMs / 1000)} detik`))
    if (!result.reference) throw new Error('File bukan acuan harga perhiasan yang didukung.')
    const reference = result.reference
    setWindows(current => current.map(w => w.id === windowId ? { ...w, date: w.files.length ? w.date : reference.date || w.date, files: [...w.files.filter(f => f.id !== reference.id), reference] } : w))
    setFailedFile(null)
  }
  const upload = async (window: WindowDraft, list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (!files.length || uploading) return
    if (window.files.length + files.length > 8) { setError('Maksimal 8 file per acuan.'); return }
    if (files.some(file => file.size > (file.type.startsWith('image/') ? 10 : 20) * 1024 * 1024)) { setError('Maksimal 10 MB per gambar atau 20 MB per PDF.'); return }
    setError('')
    try {
      for (const file of files) {
        setUploading(`Membaca ${file.name}…`)
        const body = new FormData(); body.append('file', file)
        const attachment = await request<{ id: string; filename: string }>(`/agent/sessions/${sessionId}/price-reference-uploads`, { method: 'POST', body })
        setFailedFile({ windowId: window.id, ...attachment })
        await readFile(window.id, attachment)
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'File harga belum dapat dibaca. File yang berhasil tetap tersedia.') }
    finally { setUploading('') }
  }
  const removeFile = async (windowId: string, file: PriceReference) => {
    setError(''); setUploading('Menghapus file acuan…')
    try {
      await request(`/agent/sessions/${sessionId}/attachments/${file.id}`, { method: 'DELETE' })
      setWindows(current => current.map(w => w.id === windowId ? { ...w, files: w.files.filter(f => f.id !== file.id) } : w))
    } catch (e) { setError(e instanceof Error ? e.message : 'File tidak dapat dihapus.') }
    finally { setUploading('') }
  }
  const submit = () => {
    setError('')
    const files = windows.flatMap(w => w.files)
    if (windows.some(w => !w.files.length) || !files.length) { setError('Masukkan file harga pada setiap acuan.'); return }
    if (files.some(file => !/^\d{4}-\d{2}-\d{2}$/.test(file.date))) { setError('Tanggal header file belum terbaca. Coba baca kembali file tersebut.'); return }
    const days = dailyPriceWindows(files)
    if (days.length > 8 || days.some(day => day.attachmentIds.length > 8)) { setError('Maksimal 8 tanggal dan 8 file per tanggal pemeriksaan.'); return }
    const kadarOverrides: PriceAuditSelection['kadarOverrides'] = []
    for (const file of files) file.rows.forEach((row, rowIndex) => {
      const raw = overrides[`${file.id}:${rowIndex}`]
      if (row.kind === 'sales' && raw?.trim()) kadarOverrides.push({ referenceId: file.id, rowIndex, kadar: Number(raw) })
    })
    if (kadarOverrides.some(v => !Number.isFinite(v.kadar) || v.kadar <= 0 || v.kadar > 1000)) { setError('Kadar yang dilengkapi harus berupa angka positif, maksimal 1000.'); return }
    onSubmit({ windows: days, toleranceRp: hasSales ? tolerance : 0, buybackRatesFinal: true, buybackAutoBatch: hasBuyback, salesAutoBatch: hasSales, salesMarketplaceOnly: hasSales, kadarOverrides })
  }

  return <dialog ref={dialogRef} className="price-audit-dialog" aria-labelledby="price-audit-title" onCancel={event => { event.preventDefault(); if (!uploading) onClose() }}>
    <header><div><CardHeading id="price-audit-title" icon={<FileCheck2 size={21} />}>Cek harga marketplace & buyback</CardHeading><p>Emas tua dan emas muda 8K/9K · Semua toko terdaftar · Waktu WIB</p></div><button type="button" className="icon-button" disabled={Boolean(uploading)} onClick={onClose} aria-label="Tutup pemeriksaan harga"><X size={20} /></button></header>
    <div className="price-audit-body">
      <p className="price-audit-note">Tanggal, batch, jenis acuan, dan jam mulai berlaku dibaca dari header file. Transaksi seluruh toko diperiksa otomatis; tidak perlu memilih jam. Untuk buyback berjam, pergantian batch mengikuti jam pada file.</p>
      {windows.map((w, index) => <section className="price-audit-window" key={w.id} aria-label={`Acuan ${index + 1}`}>
        <div className="price-audit-window-heading"><strong><CalendarDays size={17} /> Acuan {index + 1}</strong>{windows.length > 1 && <button type="button" className="icon-button" disabled={Boolean(uploading)} onClick={() => setWindows(current => current.filter(item => item.id !== w.id))} aria-label={`Hapus acuan ${index + 1}`}><Trash2 size={16} /></button>}</div>
        <div className="price-audit-fields"><div>Tanggal dari file<strong className="price-audit-date">{[...new Set(w.files.map(file => file.date).filter(Boolean))].join(', ') || 'Menunggu file'}</strong></div></div>
        <label className={`price-audit-upload${uploading ? ' is-disabled' : ''}`}><Upload size={17} /><span>Masukkan file harga penjualan / buyback</span><input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf" disabled={Boolean(uploading) || w.files.length >= 8} onChange={e => { void upload(w, e.target.files); e.target.value = '' }} /></label>
        <div className="price-audit-files">{w.files.map(file => <div className="price-audit-file" key={file.id}>
          <div className="price-audit-file-heading"><span><strong>{file.filename}</strong><small>{file.date || 'Tanggal belum terbaca'} · {(file.sections?.length ? file.sections : [file]).map(section => `${section.batch ? `Batch ${section.batch}` : 'Batch belum terbaca'}${section.effectiveFrom ? ` mulai ${section.effectiveFrom} WIB` : ' (jam tidak tercantum)'}`).join('; ')} · {[...new Set(file.rows.map(row => row.kind === 'sales' ? 'Penjualan' : 'Buyback'))].join(', ')} · {file.rows.length} tarif · {file.complete ? 'Pembacaan lengkap' : 'Perlu diperiksa'}</small></span><button type="button" className="icon-button" disabled={Boolean(uploading)} aria-label={`Hapus ${file.filename}`} onClick={() => void removeFile(w.id, file)}><X size={15} /></button></div>

          {file.warnings.map((warning, i) => <p className="price-audit-warning" key={i}>{warning}</p>)}
          <details><summary>Periksa tarif acuan yang terbaca</summary><div className="price-audit-preview"><table><thead><tr><th>Kode / label file</th><th>Jenis / kategori</th><th>Kadar / kualifikasi</th><th>Harga/gram</th><th>Ongkos/gram</th></tr></thead><tbody>{file.rows.map((row, i) => <tr key={i}>
            <td>{row.sourceCode || '—'}{row.sourceLabel ? ` — ${row.sourceLabel}` : ''}</td><td>{row.kind === 'buyback' ? conditionLabel(row.condition) : 'Penjualan'}</td>
            <td>{row.kind === 'buyback' ? row.printedKadar || '—' : <input aria-label={`Kadar ${file.filename} baris ${i + 1}`} type="number" min="0.001" max="1000" step="any" placeholder={row.kadar === null ? 'Belum ada' : String(row.kadar)} value={overrides[`${file.id}:${i}`] ?? ''} disabled={Boolean(uploading)} onChange={e => setOverrides(current => ({ ...current, [`${file.id}:${i}`]: e.target.value }))} />}</td>
            <td>{currency(row.rate)}{row.maxRate !== null ? `–${currency(row.maxRate)}` : ''}</td><td>{row.kind === 'buyback' ? '—' : row.fee === null ? 'Belum ada' : row.feeType === 'percent' ? `${row.fee}%` : currency(row.fee)}</td>
          </tr>)}</tbody></table></div></details>
        </div>)}</div>
      </section>)}
      <button type="button" className="button button-secondary" disabled={Boolean(uploading) || windows.length >= 8} onClick={() => { const last = windows[windows.length - 1]; setWindows(current => [...current, { id: crypto.randomUUID(), date: last.date, fromTime: last.toTime === '24:00' ? '09:00' : last.toTime, toTime: '24:00', files: [] }]) }}><Plus size={16} /> Tambah acuan</button>
      {hasSales && <p className="price-audit-note">Penjualan marketplace diperiksa per barang berdasarkan kadar. Harga per gram transaksi dibandingkan langsung dengan harga jual pada file; ongkos dan biaya marketplace dipisahkan dari harga emas. Kadar yang belum tersedia dicari melalui barcode barang. Jika file mencantumkan jam berlaku, jam transaksi menentukan batch. File tanpa jam memakai kadar dan harga; jika beberapa batch sesuai atau acuan belum lengkap, hasil ditandai untuk diperhatikan. Faktur, marketplace, kadar, harga, selisih, batch dan keterangannya ditampilkan di tabel serta Excel.</p>}
      {hasBuyback && <p className="price-audit-note">Buyback: jika ada jam berlaku, batch ditentukan dari jam transaksi, lalu harga diperiksa sesuai batch tersebut. Contoh Batch 1 pukul 07:00 dan Batch 2 pukul 12:00: Batch 1 berlaku 07:00–11:59:59, tepat 12:00 masuk Batch 2. File tanpa jam memakai pencocokan harga; jika beberapa batch memenuhi, semuanya ditampilkan sebagai belum pasti. Kode intern dicari melalui barcode barang. CUCI memakai seluruh range selain Ancuran luar toko; RUSAK memakai tarif ancuran/rusak. Transaksi batal tidak ditampilkan; barang yang tidak ditemukan tetap ditampilkan untuk diperhatikan.</p>}
      {hasSales && <details><summary>Pengaturan toleransi penjualan</summary>
        <div className="price-audit-options"><label>Toleransi harga per gram (Rp)<input type="number" min="0" max="10000" step="0.01" value={tolerance} disabled={Boolean(uploading)} onChange={e => setTolerance(Number(e.target.value))} /></label></div>
      </details>}
      {uploading && <p role="status" className="price-audit-progress"><LoaderCircle size={16} className="spin" />{uploading}</p>}
      {error && <p role="alert" className="price-audit-error">{error}</p>}
      {failedFile && !uploading && <button type="button" className="button button-secondary" onClick={() => { setError(''); setUploading('Melanjutkan pembacaan file…'); void readFile(failedFile.windowId, failedFile).catch(e => setError(e instanceof Error ? e.message : 'File belum dapat dibaca.')).finally(() => setUploading('')) }}>Coba baca lagi {failedFile.filename}</button>}
    </div>
    <footer><span>Semua batch diperiksa per tanggal. Transaksi tetap satu baris; batch yang belum tunggal ditandai belum pasti.</span><button type="button" className="button button-primary" disabled={Boolean(uploading)} onClick={submit}><FileCheck2 size={17} /> Tampilkan laporan</button></footer>
  </dialog>
}
