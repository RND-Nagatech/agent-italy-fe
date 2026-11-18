import { createRequestId } from '../lib/request-id'
import { useTableSort } from '../lib/table-sort'
import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { RefreshCw, Wallet } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { ApiError } from '../lib/api'
import './AgentTopUp.css'
import { CardHeading } from './CardHeading'
import { TopUpSuccessDialog } from './TopUpSuccessDialog'
import { canReleasePayment, releaseAndVerify } from '../lib/topup-release'

type Payment = {
  merchantRef: string | null; amountIdr: number; method: 'qris' | 'va'; status: 'creating' | 'pending' | 'paid' | 'expired' | 'failed' | 'needs_review'
  qrData: string | null; vaNumber: string | null; bankName: string | null; bankCode: string | null; expiresAt: string | null; createdAt: string; reviewReason: string | null
  releasedAt?: string | null; canRelease?: boolean
}
type Attempt = { key: string; amountIdr: number; method: 'qris' | 'va'; bankCode?: string }
const banks = ['BCA', 'BNI', 'BRI', 'MANDIRI', 'PERMATA', 'MAYBANK', 'CIMB', 'BSI', 'MUAMALAT', 'BNC', 'OCBC', 'DANAMON']
const rupiah = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
const statusLabels: Record<Payment['status'], string> = { creating: 'Menyiapkan pembayaran', pending: 'Menunggu pembayaran', paid: 'Pembayaran terkonfirmasi', expired: 'Kedaluwarsa · periksa sebelum mengganti', failed: 'Pembayaran gagal · periksa sebelum mengganti', needs_review: 'Perlu pemeriksaan gateway' }
export function AgentTopUp({ onPaid }: { onPaid: () => void }) {
  const { user, request } = useAuth()
  const [payment, setPayment] = useState<Payment | null>(null)
  const sorting = useTableSort()
  const [history, setHistory] = useState<Payment[]>([])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [amount, setAmount] = useState(50000)
  const [methodPreference, setMethod] = useState<'qris' | 'va'>('qris')
  const [enabledMethods, setEnabledMethods] = useState<('qris' | 'va')[]>([])
  const method = enabledMethods.includes(methodPreference) ? methodPreference : enabledMethods[0] || 'qris'
  const [bank, setBank] = useState('BCA')
  const [qr, setQr] = useState<{ payload: string; url: string } | null>(null)
  const [unresolved, setUnresolved] = useState(false)
  const actionInFlight = useRef(false)
  const completedPayments = useRef(new Set<string>())
  const [successReceipt, setSuccessReceipt] = useState<Payment | null>(null)
  const callback = useRef(onPaid)
  useEffect(() => { callback.current = onPaid }, [onPaid])
  const storageKey = `pantes:gateway-topup:${user?.id}`
  const accept = useCallback((result: Payment | null) => {
    const receiptId = result ? result.merchantRef || result.createdAt : null
    if (result?.status === 'paid') {
      if (receiptId && completedPayments.current.has(receiptId)) return
      setPayment(null)
      setReady(true)
      setUnresolved(false)
      localStorage.removeItem(storageKey)
      if (result.merchantRef) localStorage.removeItem(`${storageKey}:recovery:${result.merchantRef}`)
      if (receiptId && !completedPayments.current.has(receiptId)) {
        completedPayments.current.add(receiptId)
        setError('')
        setSuccessReceipt(result)
        setHistory(current => [result, ...current.filter(item => item.merchantRef !== result.merchantRef)].slice(0, 20))
        callback.current()
        void request<{ items: Payment[] }>('/agent-usage/topups').then(list => setHistory(list.items)).catch(() => {
          setNotice('Pembayaran berhasil. Riwayat terbaru belum dapat dimuat; gunakan Periksa pembayaran untuk mencoba lagi.')
        })
      }
      return
    }
    // An older pending response must not reopen a payment that already completed.
    if (receiptId && completedPayments.current.has(receiptId)) return
    setPayment(result?.releasedAt ? null : result)
    if (result) { localStorage.removeItem(storageKey); setUnresolved(false) }
    if (result?.releasedAt && result.merchantRef) localStorage.removeItem(`${storageKey}:recovery:${result.merchantRef}`)
  }, [storageKey, request])
  const load = useCallback(async () => {
    const config = await request<{ methods: ('qris' | 'va')[] }>('/agent-usage/topups/config')
    setEnabledMethods(config.methods)
    const active = await request<Payment | null>('/agent-usage/topups/active')
    accept(active)
    const list = await request<{ items: Payment[] }>('/agent-usage/topups')
    setHistory(list.items)
    setUnresolved(!!localStorage.getItem(storageKey))
    setReady(true)
  }, [request, accept, storageKey])
  useEffect(() => {
    let disposed = false
    void Promise.all([request<Payment | null>('/agent-usage/topups/active'), request<{ items: Payment[] }>('/agent-usage/topups'), request<{ methods: ('qris' | 'va')[] }>('/agent-usage/topups/config')]).then(([active, list, config]) => {
      if (disposed) return
      setEnabledMethods(config.methods); accept(active); setHistory(list.items); setUnresolved(!!localStorage.getItem(storageKey)); setReady(true)
    }).catch(e => { if (!disposed) setError(e instanceof Error ? e.message : 'Tidak dapat memeriksa pembayaran.') })
    return () => { disposed = true }
  }, [request, accept, storageKey])
  useEffect(() => {
    let disposed = false
    if (!payment?.qrData || payment.status !== 'pending') return
    const payload = payment.qrData
    void QRCode.toDataURL(payment.qrData, { width: 280, margin: 4, errorCorrectionLevel: 'M' }).then(url => { if (!disposed) setQr({ payload, url }) }).catch(() => { if (!disposed) setError('QR pembayaran tidak dapat dibuat. Coba periksa status.') })
    return () => { disposed = true }
  }, [payment?.qrData, payment?.status])
  useEffect(() => {
    if (!payment?.merchantRef || !['creating', 'pending'].includes(payment.status)) return
    let stopped = false
    const ref = payment.merchantRef
    const poll = setInterval(() => {
      if (document.hidden) return
      void request<Payment>(`/agent-usage/topups/${encodeURIComponent(ref)}`).then(result => { if (!stopped) accept(result) }).catch(e => { if (!stopped) setError(e instanceof Error ? e.message : 'Pengecekan status gagal.') })
    }, 10000)
    return () => { stopped = true; clearInterval(poll) }
  }, [payment?.merchantRef, payment?.status, request, accept])
  async function action(run: () => Promise<void>) {
    if (actionInFlight.current) return
    actionInFlight.current = true
    setBusy(true); setError(''); setNotice('')
    try { await run() } catch (e) { setError(e instanceof Error ? e.message : 'Permintaan top-up gagal.'); setUnresolved(!!localStorage.getItem(storageKey)) }
    finally { actionInFlight.current = false; setBusy(false) }
  }
  async function create() {
    await action(async () => {
      const active = await request<Payment | null>('/agent-usage/topups/active')
      if (active) { accept(active); return }
      const stored = localStorage.getItem(storageKey)
      const attempt: Attempt = stored ? JSON.parse(stored) as Attempt : { key: createRequestId(), amountIdr: amount, method, ...(method === 'va' ? { bankCode: bank } : {}) }
      if (!enabledMethods.includes(attempt.method)) throw new Error('Metode percobaan ini dinonaktifkan. Periksa pembayaran sebelumnya sebelum melanjutkan dengan metode lain.');
      localStorage.setItem(storageKey, JSON.stringify(attempt)); setUnresolved(true)
      const result = await request<Payment>('/agent-usage/topups', { method: 'POST', headers: { 'Idempotency-Key': attempt.key }, body: JSON.stringify({ amountIdr: attempt.amountIdr, method: attempt.method, ...(attempt.bankCode ? { bankCode: attempt.bankCode } : {}) }) })
      accept(result)
    })
  }
  async function check(reconcile = false) {
    await action(async () => {
      if (!payment?.merchantRef) { await load(); return }
      accept(await request<Payment>(`/agent-usage/topups/${encodeURIComponent(payment.merchantRef)}${reconcile ? '/reconcile' : ''}`, reconcile ? { method: 'POST' } : {}))
    })
  }
  async function recover() {
    if (!payment?.merchantRef) return
    await action(async () => {
      const recoveryStorage = `${storageKey}:recovery:${payment.merchantRef}`
      const key = localStorage.getItem(recoveryStorage) || createRequestId()
      localStorage.setItem(recoveryStorage, key)
      try {
        accept(await request<Payment>(`/agent-usage/topups/${encodeURIComponent(payment.merchantRef!)}/retry`, { method: 'POST', headers: { 'Idempotency-Key': key } }))
        localStorage.removeItem(recoveryStorage)
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) localStorage.removeItem(recoveryStorage)
        throw e
      }
    })
  }
  async function release() {
    if (!payment || !canReleasePayment(payment)) return
    await action(async () => {
      const result = await releaseAndVerify(payment, (path, options) => request<Payment>(path, options), accept)
      accept(result)
      if (result.status === 'paid') {
        setNotice('Pembayaran sudah terkonfirmasi dan saldo telah diperbarui.')
        try { const list = await request<{ items: Payment[] }>('/agent-usage/topups'); setHistory(list.items) } catch { setNotice('Pembayaran terkonfirmasi. Saldo diperbarui; riwayat belum dapat dimuat ulang.') }
        return
      }
      if (!result.releasedAt) throw new Error('Gateway belum melepas permintaan QRIS. Perbarui status pembayaran.')
      localStorage.removeItem(storageKey)
      setUnresolved(false)
      setPayment(null)
      setReady(true)
      try {
        const list = await request<{ items: Payment[] }>('/agent-usage/topups')
        setHistory(list.items)
      } catch {
        setNotice('Permintaan QRIS berhasil dilepas. Top-up baru dapat dibuat; riwayat belum berhasil diperbarui.')
        return
      }
      setNotice('Permintaan QRIS dilepas. Top-up baru dapat dibuat; riwayat tetap tersimpan dan pembayaran terverifikasi yang masuk terlambat tetap menambah saldo.')
    })
  }
  const showRelease = canReleasePayment(payment)
  return <section className={`panel agent-topup${payment ? ' has-payment' : ''}`}><TopUpSuccessDialog receipt={successReceipt} onClose={() => setSuccessReceipt(null)} /><div className="usage-panel-heading"><div><CardHeading icon={<Wallet size={19} />}>Top-up saldo Agent</CardHeading><p>Isi saldo melalui metode yang tersedia. Saldo masuk setelah pembayaran terverifikasi.</p></div><button className="button button-secondary" disabled={busy} onClick={() => void action(load)}><RefreshCw size={15} />Periksa pembayaran</button></div>
    {error && <p className="usage-error" role="alert">{error}</p>}
    {notice && <p className="usage-success" role="status">{notice}</p>}
    {!ready && !error && <p role="status">Memeriksa pembayaran yang masih aktif…</p>}
    {ready && !payment && enabledMethods.length === 0 && <p role="status">Top-up baru sedang dinonaktifkan. Pembayaran sebelumnya tetap dapat diperiksa.</p>}
    {ready && !payment && enabledMethods.length > 0 && <form className="topup-form" onSubmit={e => { e.preventDefault(); if (!unresolved && (amount < (method === 'va' ? 10000 : 1) || amount > 1000000000)) { setError(method === 'va' ? 'Nominal VA harus Rp10.000 sampai Rp1.000.000.000.' : 'Nominal harus Rp1 sampai Rp1.000.000.000.'); return } void create() }}><label>Nominal (rupiah)<span className="topup-currency-input"><span aria-hidden="true">Rp</span><input type="text" inputMode="numeric" required value={amount ? new Intl.NumberFormat('id-ID').format(amount) : ''} disabled={busy || unresolved} onChange={e => {
      const input = e.currentTarget
      const digitPosition = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, '').length
      const digits = input.value.replace(/\D/g, '')
      if (digits.length > 10 || Number(digits) > 1000000000) return
      setAmount(Number(digits))
      requestAnimationFrame(() => {
        let count = 0; let position = 0
        while (position < input.value.length && count < digitPosition) { if (/\d/.test(input.value[position])) count++; position++ }
        input.setSelectionRange(position, position)
      })
    }} /></span></label><label>Metode<select value={method} disabled={busy || unresolved} onChange={e => setMethod(e.target.value as 'qris' | 'va')}>{enabledMethods.map(value => <option key={value} value={value}>{value === 'qris' ? 'QRIS' : 'Virtual Account'}</option>)}</select></label>{method === 'va' && <label>Bank<select value={bank} disabled={busy || unresolved} onChange={e => setBank(e.target.value)}>{banks.map(code => <option key={code}>{code}</option>)}</select></label>}<button className="button button-primary" disabled={busy} type="submit">{busy ? 'Memproses…' : unresolved ? 'Lanjutkan percobaan sebelumnya' : 'Buat pembayaran'}</button><p>{unresolved ? 'Hasil percobaan sebelumnya belum pasti. Permintaan diulang dengan idempotency key dan nominal yang sama.' : 'VA minimum Rp10.000. Ketersediaan bank mengikuti aktivasi merchant gateway.'}</p></form>}
    {payment && <div className="topup-payment"><div>{qr && qr.payload === payment.qrData && payment.status === 'pending' && <img width="280" height="280" src={qr.url} alt="Kode QRIS pembayaran top-up" />}{payment.status !== 'pending' && <span className="topup-state">{statusLabels[payment.status]}</span>}</div><div><span className={`usage-status ${payment.status === 'paid' ? 'is-ok' : ''}`}>{statusLabels[payment.status]}</span><strong className="topup-amount">{rupiah(payment.amountIdr)}</strong><p>{payment.status === 'paid' ? 'Pembayaran telah terverifikasi.' : payment.method === 'qris' ? (payment.qrData && payment.status === 'pending' ? 'Scan QRIS dan bayar sesuai nominal.' : 'Kode QRIS belum tersedia untuk dibayar.') : `${payment.bankName || payment.bankCode || 'Bank'} · Virtual Account`}</p>{payment.vaNumber && payment.status === 'pending' && <p className="topup-va">{payment.vaNumber}</p>}<p>Referensi: {payment.merchantRef || 'Sedang dibuat'}</p>{payment.expiresAt && <p>Batas pembayaran: {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(payment.expiresAt))} WIB</p>}{payment.reviewReason && <p>Catatan: {payment.reviewReason}</p>}{showRelease && <><div className="topup-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => void check()}>Perbarui status</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => void check(true)}>Cek ke penyedia</button><button className="button button-primary" type="button" disabled={busy} onClick={() => void release()}>{busy ? 'Melepas QRIS…' : 'Lepaskan QRIS macet'}</button></div><p className="topup-release-note">Ini membuka kunci top-up di gateway; tidak membatalkan transaksi di SingaPay. Jika pembayaran lama terverifikasi belakangan, saldo tetap bertambah.</p></>}{!showRelease && <div className="topup-actions"><button className="button button-secondary" disabled={busy} onClick={() => void check()}>Perbarui status</button>{payment.status !== 'paid' && <button className="button button-secondary" disabled={busy} onClick={() => void check(true)}>Cek ke penyedia</button>}{['expired', 'failed', 'needs_review'].includes(payment.status) && !payment.releasedAt && enabledMethods.includes(payment.method) && <button className="button button-primary" disabled={busy} onClick={() => void recover()}>Pulihkan pembayaran</button>}</div>}{!showRelease && !payment.releasedAt && <p>Jangan membayar ulang jika sudah terdebet. Cek ke penyedia sebelum mencoba pembayaran pengganti.</p>}{payment.releasedAt && <p>Permintaan QRIS ini sudah dilepas. Riwayat tetap tersimpan; pembayaran terverifikasi yang masuk terlambat tetap menambah saldo.</p>}</div></div>}
    {history.length > 0 && <details className="topup-history"><summary>Riwayat top-up ({history.length} terakhir)</summary><div className="usage-table-scroll"><table><thead><tr>{sorting.header('createdAt', 'Waktu Jakarta', false)}<th>Metode</th>{sorting.header('amountIdr', 'Nominal', true)}<th>Status</th><th>Referensi</th></tr></thead><tbody>{sorting.order(history, (row, key) => key === 'amountIdr' ? row.amountIdr : row.createdAt).map((item, i) => <tr key={item.merchantRef || i}><td>{new Date(item.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</td><td>{item.method.toUpperCase()}</td><td className="is-number">{rupiah(item.amountIdr)}</td><td>{item.releasedAt && item.status !== 'paid' ? 'Permintaan dilepas' : statusLabels[item.status]}</td><td>{item.merchantRef || '—'}</td></tr>)}</tbody></table></div></details>}
  </section>
}
