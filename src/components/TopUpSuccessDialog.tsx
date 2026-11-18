import { useEffect, useRef } from 'react'
import { Check, Wallet, X } from 'lucide-react'

type Receipt = { amountIdr: number; merchantRef: string | null }
export function TopUpSuccessDialog({ receipt, onClose }: { receipt: Receipt | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !receipt) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => {
      dialog.close()
      if (previousFocus?.isConnected) previousFocus.focus()
      else document.querySelector<HTMLInputElement>('.topup-form input')?.focus()
    }
  }, [receipt])
  return <dialog ref={dialogRef} className="topup-success-dialog" aria-labelledby="topup-success-title" aria-describedby="topup-success-description" onCancel={event => { event.preventDefault(); onClose() }}>
    <button className="icon-button topup-success-close" type="button" aria-label="Tutup informasi pembayaran berhasil" onClick={onClose}><X size={19} /></button>
    <div className="topup-success-illustration" aria-hidden="true"><Wallet size={46} strokeWidth={1.5} /><span><Check size={23} strokeWidth={3} /></span></div>
    <h2 id="topup-success-title">Pembayaran berhasil</h2>
    <strong className="topup-success-value">{receipt && new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(receipt.amountIdr)}</strong>
    <p id="topup-success-description">Top-up telah terverifikasi. Saldo dan riwayat dimuat ulang otomatis; proses pembayaran sudah selesai.</p>
    {receipt?.merchantRef && <small>Referensi pembayaran<br />{receipt.merchantRef}</small>}
    <button className="button button-primary" type="button" onClick={onClose}>Tutup</button>
  </dialog>
}
