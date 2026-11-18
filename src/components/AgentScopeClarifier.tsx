import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Search, Store, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AgentSourceSummary } from '../lib/types'
import type { BankScopeResolved } from '../lib/banking'
import { BankAccountPicker } from './BankAccountPicker'

export type AgentScopeSelection = {
  allSources: boolean
  branchIds: string[]
  sourceAliases: string[]
  fromDate: string
  toDate: string
  accountIds?: string[]
}

type AgentScopeClarifierProps = {
  prompt: string
  sources: AgentSourceSummary[]
  needsDate: boolean
  needsSource: boolean
  banking?: BankScopeResolved
  disabled?: boolean
  onCancel: () => void
  onSubmit: (selection: AgentScopeSelection) => void
}

const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const weekDays = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

function jakartaTodayIso() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function isoToDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function dateToIso(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1)
}

function addDays(value: Date, amount: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + amount)
  return next
}

function calendarDays(month: Date) {
  const first = startOfMonth(month)
  const mondayOffset = (first.getDay() + 6) % 7
  const firstCell = addDays(first, -mondayOffset)
  return Array.from({ length: 42 }, (_, index) => addDays(firstCell, index))
}

function sourceKey(source: AgentSourceSummary) {
  return source.branchId || source.alias
}

function formatDateLabel(value: string) {
  if (!value) return 'Pilih tanggal'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(`${value}T00:00:00+07:00`))
}

function formatSourceLabel(source: AgentSourceSummary) {
  return source.alias || source.branchId
}

function DateCalendar({
  month,
  fromDate,
  toDate,
  today,
  onSelect,
}: {
  month: Date
  fromDate: string
  toDate: string
  today: string
  onSelect: (value: string) => void
}) {
  return (
    <div className="agent-scope-calendar-month">
      <strong>{monthNames[month.getMonth()]} {month.getFullYear()}</strong>
      <div className="agent-scope-calendar-weekdays">{weekDays.map(day => <span key={day}>{day}</span>)}</div>
      <div className="agent-scope-calendar-grid">
        {calendarDays(month).map(day => {
          const value = dateToIso(day)
          const isCurrentMonth = day.getMonth() === month.getMonth() && day.getFullYear() === month.getFullYear()
          const isSelected = isCurrentMonth && (value === fromDate || value === toDate)
          const isBetween = isCurrentMonth && Boolean(fromDate && toDate && value > fromDate && value < toDate)
          const isToday = isCurrentMonth && value === today
          const isBeforeStart = isCurrentMonth && Boolean(fromDate && !toDate && value < fromDate)
          const isDisabled = !isCurrentMonth || isBeforeStart
          return <button
            className={`agent-scope-calendar-day${!isCurrentMonth ? ' is-outside' : ''}${isBeforeStart ? ' is-before-start' : ''}${isSelected ? ' is-selected' : ''}${isBetween ? ' is-between' : ''}${isToday ? ' is-today' : ''}`}
            key={value}
            type="button"
            aria-label={formatDateLabel(value)}
            aria-pressed={isSelected}
            disabled={isDisabled}
            onClick={() => onSelect(value)}
          >
            {day.getDate()}
          </button>
        })}
      </div>
    </div>
  )
}

export function AgentScopeClarifier({ prompt, sources, needsDate, needsSource, banking, disabled = false, onCancel, onSubmit }: AgentScopeClarifierProps) {
  const today = useMemo(() => jakartaTodayIso(), [])
  const allSourceIds = useMemo(() => sources.map(sourceKey), [sources])
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false)
  const [sourceSearch, setSourceSearch] = useState('')
  const initialBranches = banking?.selection.branchIds.length ? banking.selection.branchIds : allSourceIds
  const [allSourcesSelected, setAllSourcesSelected] = useState(initialBranches.length === allSourceIds.length)
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(initialBranches)
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(banking?.selection.accountIds ?? [])
  const [fromDate, setFromDate] = useState(banking?.selection.from ?? '')
  const [toDate, setToDate] = useState(banking?.selection.to ?? '')
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(isoToDate(today)))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!sourcePickerOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSourcePickerOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [sourcePickerOpen])

  const filteredSources = useMemo(() => {
    const query = sourceSearch.trim().toLowerCase()
    if (!query) return sources
    return sources.filter(source => `${source.alias} ${source.branchId}`.toLowerCase().includes(query))
  }, [sourceSearch, sources])
  const centralSources = filteredSources.filter(source => source.sourceType === 'central')
  const branchSources = filteredSources.filter(source => source.sourceType !== 'central')
  const validSelectedBranchIds = selectedBranchIds.filter(id => allSourceIds.includes(id))
  const selectedCount = allSourcesSelected ? allSourceIds.length : validSelectedBranchIds.length
  const selectedSources = sources.filter(source => validSelectedBranchIds.includes(sourceKey(source)))
  const availableAccounts = banking?.accounts.filter(account => (allSourcesSelected ? allSourceIds : validSelectedBranchIds).includes(account.branchId)) ?? []
  const validAccountIds = selectedAccountIds.filter(id => availableAccounts.some(account => account.id === id))

  const setDateRange = (nextFrom: string, nextTo: string) => {
    setFromDate(nextFrom)
    setToDate(nextTo)
    setCalendarMonth(startOfMonth(isoToDate(nextFrom)))
    setError('')
  }

  const clearStartDate = () => {
    setFromDate('')
    setToDate('')
    setError('')
  }

  const clearEndDate = () => {
    setToDate('')
    setError('')
  }

  const handleDateSelect = (value: string) => {
    setError('')
    if (!fromDate || toDate) {
      setFromDate(value)
      setToDate('')
      return
    }
    if (value < fromDate) return
    setToDate(value)
  }

  const toggleSource = (source: AgentSourceSummary) => {
    const key = sourceKey(source)
    const nextSelected = allSourcesSelected ? allSourceIds.filter(id => id !== key) : validSelectedBranchIds.includes(key) ? validSelectedBranchIds.filter(id => id !== key) : [...validSelectedBranchIds, key]
    setAllSourcesSelected(nextSelected.length === allSourceIds.length)
    setSelectedBranchIds(nextSelected)
    setError('')
  }

  const handleSubmit = () => {
    if (needsSource && !allSourcesSelected && !validSelectedBranchIds.length) {
      setError('Pilih minimal satu toko untuk melihat laporan.')
      setSourcePickerOpen(true)
      return
    }
    if (needsDate && (!fromDate || !toDate)) {
      setError('Pilih tanggal awal dan tanggal akhir terlebih dahulu.')
      return
    }
    if (banking && !validAccountIds.length) {
      setError('Pilih minimal satu rekening untuk melihat transaksi.')
      return
    }
    onSubmit({
      allSources: allSourcesSelected,
      branchIds: allSourcesSelected ? allSourceIds : validSelectedBranchIds,
      sourceAliases: allSourcesSelected ? sources.map(formatSourceLabel) : selectedSources.map(formatSourceLabel),
      fromDate,
      toDate,
      ...(banking ? { accountIds: validAccountIds } : {}),
    })
  }

  const renderSourceGroup = (title: string, items: AgentSourceSummary[]) => {
    if (!items.length) return null
    return <div className="agent-scope-source-group">
      <span className="agent-scope-source-group-title">{title}</span>
      {items.map(source => {
        const selected = allSourcesSelected || validSelectedBranchIds.includes(sourceKey(source))
        return <label className={`agent-scope-source-option${selected ? ' is-selected' : ''}`} key={sourceKey(source)}>
          <input type="checkbox" checked={selected} onChange={() => toggleSource(source)} />
          <span className="agent-scope-checkbox" aria-hidden="true">{selected && <Check size={13} strokeWidth={3} />}</span>
          <span className="agent-scope-source-copy"><strong>{formatSourceLabel(source)}</strong><small>{source.branchId}</small></span>
        </label>
      })}
    </div>
  }

  const presetRanges = [
    { label: 'Hari ini', from: today, to: today },
    { label: 'Kemarin', from: dateToIso(addDays(isoToDate(today), -1)), to: dateToIso(addDays(isoToDate(today), -1)) },
    { label: '7 hari terakhir', from: dateToIso(addDays(isoToDate(today), -6)), to: today },
    { label: 'Bulan ini', from: `${today.slice(0, 7)}-01`, to: today },
  ]

  return <section className="agent-scope-clarifier" aria-label="Pilih cakupan laporan">
    <div className="agent-scope-clarifier-heading">
      <div className="agent-scope-clarifier-icon"><Store size={18} /></div>
      <div><strong>Lengkapi pencarian laporan</strong><span>{banking ? 'Pilih toko, rekening, dan periode yang ingin diperiksa.' : 'Pilih toko dan periode agar hasilnya tepat.'}</span></div>
    </div>
    <div className="agent-scope-question"><span>Pertanyaan kamu</span><p>{prompt}</p></div>
    {banking && banking.documents.length > 0 && <div className="agent-bank-notice">{banking.documents.map(document => <p key={document.id}><strong>{document.bankName} · {document.accountNumber || 'Rekening belum terbaca'}</strong> — {document.entryCount} mutasi, {document.from} s/d {document.to}{!document.complete ? ' · perlu periksa kelengkapan' : ''}</p>)}</div>}
    {banking && banking.warnings.length > 0 && <div className="agent-bank-notice is-warning" role="status">{banking.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}

    <div className={`agent-scope-fields${needsSource && needsDate ? ' has-both' : ''}${banking ? ' has-banking' : ''}`}>
    {needsSource && <div className="agent-scope-field">
      <div className="agent-scope-field-label"><span>Toko yang ingin dilihat</span><small>{selectedCount} dari {allSourceIds.length} tersedia</small></div>
      <div className="agent-scope-picker">
        <button className={`agent-scope-picker-trigger${sourcePickerOpen ? ' is-open' : ''}`} type="button" disabled={disabled || !sources.length} onClick={() => setSourcePickerOpen(open => !open)} aria-expanded={sourcePickerOpen} aria-controls="agent-scope-source-dialog">
          <span><Store size={16} />{allSourcesSelected ? 'Semua toko aktif' : `${selectedCount} toko dipilih`}</span><ChevronDown size={16} />
        </button>
        {sourcePickerOpen && createPortal(<>
          <button className="agent-scope-picker-overlay" type="button" aria-label="Tutup pilihan toko" onClick={() => setSourcePickerOpen(false)} />
          <div id="agent-scope-source-dialog" className="agent-scope-picker-popover" role="dialog" aria-modal="true" aria-label="Pilih toko">
          <div className="agent-scope-picker-top"><div><strong>Pilih toko</strong><span>Bisa pilih lebih dari satu</span></div><button type="button" aria-label="Tutup pilihan toko" onClick={() => setSourcePickerOpen(false)}><X size={16} /></button></div>
          <label className="agent-scope-search"><Search size={15} /><input type="search" value={sourceSearch} onChange={event => setSourceSearch(event.target.value)} placeholder="Cari nama toko atau kode…" /></label>
          <label className={`agent-scope-source-option agent-scope-select-all${allSourcesSelected ? ' is-selected' : ''}`}>
            <input type="checkbox" checked={allSourcesSelected} onChange={event => { setAllSourcesSelected(event.target.checked); setSelectedBranchIds(event.target.checked ? allSourceIds : []); setError('') }} />
            <span className="agent-scope-checkbox" aria-hidden="true">{allSourcesSelected && <Check size={13} strokeWidth={3} />}</span>
            <span className="agent-scope-source-copy"><strong>Pilih semua toko</strong><small>{allSourceIds.length} sumber aktif</small></span>
          </label>
          <div className="agent-scope-source-list">{renderSourceGroup('PUSAT', centralSources)}{renderSourceGroup('CABANG', branchSources)}{!filteredSources.length && <p className="agent-scope-empty">Toko tidak ditemukan.</p>}</div>
          <div className="agent-scope-picker-footer"><span>{allSourceIds.length} toko tersedia · {selectedCount} dipilih</span><div><button type="button" onClick={() => { setAllSourcesSelected(false); setSelectedBranchIds([]); setError('') }}>Bersihkan</button><button type="button" className="is-primary" onClick={() => setSourcePickerOpen(false)}>Terapkan pilihan</button></div></div>
          </div>
        </>, document.body)}
      </div>
      {!allSourcesSelected && selectedSources.length > 0 && <div className="agent-scope-selected-preview" aria-label="Toko terpilih">{selectedSources.slice(0, 3).map(source => <span key={sourceKey(source)}>{formatSourceLabel(source)}<button type="button" aria-label={`Hapus ${formatSourceLabel(source)}`} onClick={() => toggleSource(source)}><X size={11} /></button></span>)}{selectedSources.length > 3 && <small>+{selectedSources.length - 3} toko lainnya</small>}</div>}
    </div>}

    {banking && <div className="agent-scope-field"><div className="agent-scope-field-label"><span>Bank & rekening toko</span><small>{availableAccounts.length} rekening tersedia</small></div><BankAccountPicker accounts={availableAccounts} value={validAccountIds} disabled={disabled} onChange={ids => { setSelectedAccountIds(ids); setError('') }} />{!needsDate && fromDate && toDate && <p className="agent-scope-calendar-hint">Periode {formatDateLabel(fromDate)} s/d {formatDateLabel(toDate)}</p>}</div>}

    {needsDate && <div className="agent-scope-field agent-scope-date-field">
      <div className="agent-scope-field-label"><span>Periode laporan</span><small>Termasuk tanggal awal dan akhir</small></div>
      <div className="agent-scope-date-summary">
        <div className="agent-scope-date-box"><CalendarDays size={16} /><span>{fromDate ? formatDateLabel(fromDate) : 'Tanggal awal'}</span>{fromDate && <button className="agent-scope-date-clear" type="button" aria-label="Hapus tanggal awal" title="Hapus tanggal awal" onClick={clearStartDate}><X size={12} /></button>}</div><span className="agent-scope-date-separator">s/d</span><div className="agent-scope-date-box"><CalendarDays size={16} /><span>{toDate ? formatDateLabel(toDate) : 'Tanggal akhir'}</span>{toDate && <button className="agent-scope-date-clear" type="button" aria-label="Hapus tanggal akhir" title="Hapus tanggal akhir" onClick={clearEndDate}><X size={12} /></button>}</div>
      </div>
      <div className="agent-scope-presets">{presetRanges.map(preset => <button key={preset.label} type="button" className={fromDate === preset.from && toDate === preset.to ? 'is-active' : ''} onClick={() => setDateRange(preset.from, preset.to)}>{preset.label}</button>)}</div>
      <div className="agent-scope-calendar-shell">
        <div className="agent-scope-calendar-toolbar"><button type="button" aria-label="Bulan sebelumnya" onClick={() => setCalendarMonth(month => addMonths(month, -1))}><ChevronLeft size={16} /></button><span>Pilih tanggal khusus</span><button type="button" aria-label="Bulan berikutnya" onClick={() => setCalendarMonth(month => addMonths(month, 1))}><ChevronRight size={16} /></button></div>
        <div className="agent-scope-calendar-pair"><DateCalendar month={calendarMonth} fromDate={fromDate} toDate={toDate} today={today} onSelect={handleDateSelect} /><DateCalendar month={addMonths(calendarMonth, 1)} fromDate={fromDate} toDate={toDate} today={today} onSelect={handleDateSelect} /></div>
        <p className="agent-scope-calendar-hint">{fromDate && !toDate ? `Pilih tanggal akhir mulai ${formatDateLabel(fromDate)}.` : 'Klik tanggal awal, lalu tanggal akhir.'} Zona waktu laporan: Asia/Jakarta.</p>
      </div>
    </div>}
    </div>

    {error && <p className="agent-scope-error" role="alert">{error}</p>}
    <div className="agent-scope-actions"><button className="agent-scope-cancel" type="button" disabled={disabled} onClick={onCancel}>Batal</button><button className="agent-scope-submit" type="button" disabled={disabled || (needsSource && !allSourceIds.length)} onClick={handleSubmit}>Tampilkan laporan <ChevronRight size={16} /></button></div>
  </section>
}
