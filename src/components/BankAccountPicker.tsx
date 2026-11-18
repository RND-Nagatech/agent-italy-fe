import { Building2, Check, ChevronDown, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BankAccount } from '../lib/banking'
import './BankAccountPicker.css'

export function BankAccountPicker({ accounts, value, onChange, disabled = false }: { accounts: BankAccount[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const triggerElement = trigger.current
    document.body.style.overflow = 'hidden'
    input.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
      if (event.key !== 'Tab') return
      const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')
      if (!elements?.length) return
      const first = elements[0], last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keydown); triggerElement?.focus() }
  }, [open])
  const selected = accounts.filter(account => value.includes(account.id))
  const filtered = accounts.filter(account => `${account.bankName} ${account.bankCode} ${account.accountNumber} ${account.accountName} ${account.sourceAlias}`.toLowerCase().includes(search.toLowerCase().trim()))
  const groups = [...new Set(filtered.map(account => account.bankName))]
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id])
  const allSelected = accounts.length > 0 && selected.length === accounts.length
  return <div className="agent-bank-picker">
    <button ref={trigger} className="agent-scope-picker-trigger" type="button" disabled={disabled || !accounts.length} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><span><Building2 size={17} />{selected.length === 1 ? `${selected[0].bankName} · ${selected[0].accountNumber}` : selected.length ? `${selected.length} rekening dipilih` : 'Pilih bank & rekening'}</span><ChevronDown size={16} /></button>
    {!accounts.length && <p className="agent-scope-empty">Belum ada rekening yang dapat dibaca untuk toko ini. Periksa master rekening dan koneksi sumber.</p>}
    {selected.length > 0 && <div className="agent-bank-chips">{selected.slice(0, 3).map(account => <span key={account.id}>{account.bankName} · {account.accountNumber}<button type="button" disabled={disabled} aria-label={`Hapus rekening ${account.accountNumber}`} onClick={() => toggle(account.id)}><X size={12} /></button></span>)}{selected.length > 3 && <small>+{selected.length - 3} lainnya</small>}</div>}
    {open && createPortal(<div className="agent-bank-modal-layer"><button className="agent-bank-backdrop" type="button" tabIndex={-1} aria-label="Tutup pilihan rekening" onClick={() => setOpen(false)} /><div ref={dialog} className="agent-bank-modal" role="dialog" aria-modal="true" aria-labelledby="agent-bank-modal-title">
      <div className="agent-bank-modal-heading"><span className="agent-bank-heading-icon"><Building2 size={21} /></span><div><strong id="agent-bank-modal-title">Pilih bank & rekening</strong><p>Bisa pilih lebih dari satu rekening.</p></div><button type="button" aria-label="Tutup pilihan rekening" onClick={() => setOpen(false)}><X size={19} /></button></div>
      <label className="agent-bank-search"><Search size={17} /><input ref={input} value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari bank, rekening, nama, atau toko…" type="search" /></label>
      <label className="agent-bank-option agent-bank-all"><input type="checkbox" checked={allSelected} onChange={event => onChange(event.target.checked ? accounts.map(account => account.id) : [])} /><span className="agent-bank-check" aria-hidden="true">{allSelected && <Check size={14} />}</span><span><strong>Semua rekening toko terpilih</strong><small>{accounts.length} rekening tersedia</small></span></label>
      <div className="agent-bank-options">{groups.map(bank => <section key={bank}><h4>{bank}</h4>{filtered.filter(account => account.bankName === bank).map(account => <label className={`agent-bank-option${value.includes(account.id) ? ' is-selected' : ''}`} key={account.id}><input type="checkbox" checked={value.includes(account.id)} onChange={() => toggle(account.id)} /><span className="agent-bank-check" aria-hidden="true">{value.includes(account.id) && <Check size={14} />}</span><span><strong>{account.accountNumber}<small>{account.accountName || account.bankName}</small></strong><small>{account.sourceAlias} · {account.bankCode}</small></span></label>)}</section>)}{!filtered.length && <p className="agent-bank-empty">Rekening tidak ditemukan. Coba kata kunci lain.</p>}</div>
      <div className="agent-bank-modal-footer"><span aria-live="polite">{selected.length} rekening dipilih</span><button type="button" onClick={() => onChange([])}>Bersihkan</button><button type="button" className="is-primary" onClick={() => setOpen(false)}>Terapkan pilihan</button></div>
    </div></div>, document.body)}
  </div>
}
