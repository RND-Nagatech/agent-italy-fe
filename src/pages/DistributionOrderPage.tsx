import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowDown, ArrowUp, Check, LoaderCircle, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { CardHeading } from '../components/CardHeading'
import './DistributionOrderPage.css'

type DistributionClass = 'X' | 'XB'
type Branch = { branchId: string; alias: string; active: boolean }
type Listing = { orders: Record<DistributionClass, string[]>; branches: Branch[]; updatedAt: string | null }

const emptyOrders = (): Record<DistributionClass, string[]> => ({ X: [], XB: [] })
const formatDate = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(value))

export function DistributionOrderPage() {
  const { request } = useAuth()
  const [data, setData] = useState<Listing | null>(null)
  const [orders, setOrders] = useState<Record<DistributionClass, string[]>>(emptyOrders)
  const [savedOrders, setSavedOrders] = useState<Record<DistributionClass, string[]>>(emptyOrders)
  const [selectedBranch, setSelectedBranch] = useState<Record<DistributionClass, string>>({ X: '', XB: '' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const dirty = useMemo(() => JSON.stringify(orders) !== JSON.stringify(savedOrders), [orders, savedOrders])

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const result = await request<Listing>('/sources/distribution-order', { signal })
      setData(result)
      setOrders(result.orders)
      setSavedOrders(result.orders)
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : 'Urutan distribusi tidak dapat dimuat.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [request])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  function addBranch(category: DistributionClass) {
    const branchId = selectedBranch[category]
    if (!branchId || orders[category].includes(branchId)) return
    setOrders(current => ({ ...current, [category]: [...current[category], branchId] }))
    setSelectedBranch(current => ({ ...current, [category]: '' }))
    setNotice('')
  }

  function moveBranch(category: DistributionClass, index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= orders[category].length) return
    setOrders(current => {
      const next = [...current[category]]
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...current, [category]: next }
    })
    setNotice('')
  }

  function removeBranch(category: DistributionClass, branchId: string) {
    setOrders(current => ({ ...current, [category]: current[category].filter(id => id !== branchId) }))
    setNotice('')
  }

  async function save() {
    if (busy || !dirty) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await request<Listing>('/sources/distribution-order', {
        method: 'PUT',
        body: JSON.stringify(orders),
      })
      setData(result)
      setOrders(result.orders)
      setSavedOrders(result.orders)
      setNotice('Urutan penerima X dan XB tersimpan. Rekomendasi distribusi berikutnya memakai urutan terbaru.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Urutan distribusi tidak dapat disimpan.')
    } finally {
      setBusy(false)
    }
  }

  const branchById = useMemo(() => new Map((data?.branches ?? []).map(branch => [branch.branchId, branch])), [data])

  function renderOrder(category: DistributionClass) {
    const isX = category === 'X'
    const branches = data?.branches ?? []
    const items = orders[category]
    const otherCategory: DistributionClass = isX ? 'XB' : 'X'
    const assignedToOtherCategory = new Set(orders[otherCategory])
    const addableBranches = branches.filter(branch =>
      branch.active && !items.includes(branch.branchId) && !assignedToOtherCategory.has(branch.branchId),
    )
    return (
      <section className="panel distribution-order-card" aria-labelledby={`distribution-order-${category}`}>
        <header className="distribution-order-card-header">
          <div>
            <CardHeading as="h2" icon={<span className="distribution-order-letter">{category}</span>} id={`distribution-order-${category}`}>Urutan penerima {category}</CardHeading>
            <p>{isX ? 'Barang baru dari pabrik.' : 'Barang X yang satu kali buyback lalu dicuci.'} Susun cabang dari prioritas tertinggi.</p>
          </div>
          <span className="distribution-order-count">{items.length} cabang</span>
        </header>

        <div className="distribution-order-add">
          <label htmlFor={`distribution-order-select-${category}`}>Tambah cabang ke urutan</label>
          <div>
            <select
              id={`distribution-order-select-${category}`}
              value={selectedBranch[category]}
              onChange={event => setSelectedBranch(current => ({ ...current, [category]: event.target.value }))}
              disabled={loading || busy || !addableBranches.length}
            >
              <option value="">{addableBranches.length ? 'Pilih cabang aktif' : 'Semua cabang aktif sudah ditambahkan'}</option>
              {addableBranches.map(branch => <option key={branch.branchId} value={branch.branchId}>{branch.alias} · {branch.branchId}</option>)}
            </select>
            <button className="button button-secondary" type="button" disabled={!selectedBranch[category] || busy} onClick={() => addBranch(category)}>
              <Plus size={15} /> Tambah
            </button>
          </div>
        </div>

        <ol className="distribution-order-list" aria-label={`Urutan penerima ${category}`}>
          {items.map((branchId, index) => {
            const branch = branchById.get(branchId)
            return (
              <li className="distribution-order-item" key={branchId}>
                <span className="distribution-order-rank" aria-label={`Prioritas ${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
                <span className="distribution-order-branch"><strong>{branch?.alias ?? branchId}</strong><small>{branchId}{branch && !branch.active ? ' · sumber nonaktif' : ''}</small></span>
                <div className="distribution-order-controls">
                  <button className="icon-button" type="button" aria-label={`Naikkan ${branch?.alias ?? branchId}`} title="Naikkan prioritas" disabled={busy || index === 0} onClick={() => moveBranch(category, index, -1)}><ArrowUp size={16} /></button>
                  <button className="icon-button" type="button" aria-label={`Turunkan ${branch?.alias ?? branchId}`} title="Turunkan prioritas" disabled={busy || index === items.length - 1} onClick={() => moveBranch(category, index, 1)}><ArrowDown size={16} /></button>
                  <button className="icon-button distribution-order-remove" type="button" aria-label={`Hapus ${branch?.alias ?? branchId} dari urutan ${category}`} title="Hapus dari urutan" disabled={busy} onClick={() => removeBranch(category, branchId)}><Trash2 size={15} /></button>
                </div>
              </li>
            )
          })}
          {!items.length && <li className="distribution-order-empty">{loading ? 'Memuat daftar cabang…' : 'Belum ada cabang dalam urutan ini. Tambahkan cabang untuk mulai menyusun prioritas.'}</li>}
        </ol>
        <footer className="distribution-order-card-footer">
          <span>{category === 'X' ? 'Daftar awal mengikuti urutan cabang mall yang sebelumnya ditentukan.' : 'Urutan XB terpisah dari X dan dapat disusun sesuai kebijakan distribusi.'}</span>
        </footer>
      </section>
    )
  }

  return (
    <div className="distribution-order-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PENGATURAN DISTRIBUSI</p>
          <h1>Urutan distribusi</h1>
          <p className="page-description">Atur cabang penerima untuk barang kategori X dan XB.</p>
        </div>
        <div className="distribution-order-actions">
          <button className="button button-secondary" type="button" disabled={loading || busy} onClick={() => void load()}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Perbarui</button>
          <button className="button button-primary" type="button" disabled={loading || busy || !dirty} onClick={() => void save()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />} Simpan urutan</button>
        </div>
      </div>

      <div className="distribution-order-guidance">
        <strong>Bagaimana urutan ini dipakai?</strong>
        <span>Untuk stok X dan XB yang ditawarkan di chat Agent, cabang di daftar terkait dipenuhi lebih dahulu sesuai urutan. Jika masih ada kebutuhan, cabang lain menyusul memakai flag prioritas umum. Kategori B tidak memakai daftar urutan dan tetap mengikuti aturan umum.</span>
      </div>

      {notice && <div className="distribution-order-feedback is-success" role="status"><Check size={16} />{notice}</div>}
      {error && <div className="distribution-order-feedback is-error" role="alert"><AlertCircle size={16} /><span>{error}</span><button className="button button-secondary" type="button" onClick={() => void load()}>Coba lagi</button></div>}
      {loading && !data ? <div className="panel distribution-order-loading" role="status"><LoaderCircle size={18} className="spin" /> Memuat sumber cabang dan urutan…</div> : (
        <div className="distribution-order-grid">
          {renderOrder('X')}
          {renderOrder('XB')}
        </div>
      )}

      <p className="distribution-order-note">Perubahan hanya menyimpan prioritas rekomendasi. Sistem tidak membuat atau menjalankan transaksi mutasi stok.</p>
      {data?.updatedAt && <p className="distribution-order-updated">Terakhir disimpan {formatDate(data.updatedAt)}</p>}
    </div>
  )
}
