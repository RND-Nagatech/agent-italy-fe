import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, ChevronLeft, ChevronRight, Clipboard, FileSearch, RefreshCw, Search, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { CardHeading } from '../components/CardHeading'
import './AgentGatewayAuditPage.css'

type AuditRow = {
  id: string
  exchangeRequestId: string
  sessionId: string | null
  actorEmail: string
  questionPreview: string | null
  kind: 'chat' | 'room-summary' | 'memory-learning' | 'bank-extraction'
  round: number
  model: string
  method: 'POST'
  path: string
  payloadBytes: number
  outcome: 'pending' | 'succeeded' | 'http-error' | 'network-error' | 'response-error'
  statusCode: number | null
  latencyMs: number | null
  finishReason: string | null
  createdAt: string
  expiresAt: string
}
type AuditList = { data: AuditRow[]; pagination: { limit: number; nextCursor: string | null }; retentionDays: number }
type AuditDetail = AuditRow & { payloadJson: string }
type AuditMessage = {
  role?: string
  content?: string | Array<{ type?: string; text?: string; image_url?: { url?: string; detail?: string } }> | null
  tool_call_id?: string
  tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>
}
type GatewayPayload = { model?: string; messages?: AuditMessage[]; tools?: unknown[]; [key: string]: unknown }

const formatNumber = (value: number) => new Intl.NumberFormat('id-ID').format(value)
const formatTime = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Waktu tidak valid' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Jakarta' }).format(date)
}
const outcomeLabel: Record<AuditRow['outcome'], string> = {
  pending: 'Menunggu hasil', succeeded: 'Berhasil', 'http-error': 'Gateway menolak', 'network-error': 'Gangguan koneksi', 'response-error': 'Respons tidak terbaca',
}

function parsePayload(raw: string): GatewayPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed as GatewayPayload : null
  } catch { return null }
}

function messageSummary(message: AuditMessage) {
  if (message.tool_calls?.length) return message.tool_calls.map(call => call.function?.name || 'tool').join(', ')
  if (message.tool_call_id) return `Balasan tool · ${message.tool_call_id}`
  if (typeof message.content === 'string') return message.content.replace(/\s+/g, ' ').slice(0, 180) || '(konten kosong)'
  if (Array.isArray(message.content)) return message.content.map(part => part.type === 'image_url' ? '[Gambar]' : part.text || '').filter(Boolean).join(' ').slice(0, 180) || '(konten multimodal)'
  return '(konten kosong)'
}

function MessageBody({ message }: { message: AuditMessage }) {
  if (typeof message.content === 'string') return <pre className="gateway-audit-message-content">{message.content || '(konten kosong)'}</pre>
  if (Array.isArray(message.content)) return <div className="gateway-audit-parts">{message.content.map((part, index) => part.type === 'image_url'
    ? <p className="gateway-audit-image-note" key={index}>Gambar dikirim{part.image_url?.detail ? ` · detail ${part.image_url.detail}` : ''}; URL data tersimpan di body JSON persis.</p>
    : part.text ? <pre className="gateway-audit-message-content" key={index}>{part.text}</pre> : null)}</div>
  return <p className="gateway-audit-muted">Konten kosong.</p>
}

export function AgentGatewayAuditPage() {
  const { request } = useAuth()
  const sheetRef = useRef<HTMLDialogElement>(null)
  const [filters, setFilters] = useState({ requestId: '', sessionId: '' })
  const [appliedFilters, setAppliedFilters] = useState(filters)
  const [cursorStack, setCursorStack] = useState<string[]>([])
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [list, setList] = useState<AuditList | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AuditDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [rawVisible, setRawVisible] = useState(false)
  const [copyNotice, setCopyNotice] = useState('')
  const cursor = cursorStack.at(-1)

  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    if (selectedId && !sheet.open) sheet.showModal()
    else if (!selectedId && sheet.open) sheet.close()
  }, [selectedId])

  useEffect(() => {
    let cancelled = false
    setListLoading(true)
    setListError(null)
    const params = new URLSearchParams({ limit: '30' })
    if (cursor) params.set('cursor', cursor)
    if (appliedFilters.requestId.trim()) params.set('requestId', appliedFilters.requestId.trim())
    if (appliedFilters.sessionId.trim()) params.set('sessionId', appliedFilters.sessionId.trim())
    void request<AuditList>(`/agent/gateway-audit?${params}`, { cache: 'no-store' })
      .then(value => { if (!cancelled) setList(value) })
      .catch(error => { if (!cancelled) setListError(error instanceof Error ? error.message : 'Daftar audit gagal dimuat.') })
      .finally(() => { if (!cancelled) setListLoading(false) })
    return () => { cancelled = true }
  }, [request, cursor, appliedFilters, refreshVersion])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    setDetail(null)
    setRawVisible(false)
    setCopyNotice('')
    void request<AuditDetail>(`/agent/gateway-audit/${encodeURIComponent(selectedId)}`, { cache: 'no-store' })
      .then(value => { if (!cancelled) setDetail(value) })
      .catch(error => { if (!cancelled) setDetailError(error instanceof Error ? error.message : 'Body audit gagal dimuat.') })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [request, selectedId])

  const payload = useMemo(() => detail ? parsePayload(detail.payloadJson) : null, [detail])
  const selectedRow = list?.data.find(row => row.id === selectedId)
  const pageNumber = cursorStack.length + 1

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAppliedFilters({ requestId: filters.requestId.trim(), sessionId: filters.sessionId.trim() })
    setCursorStack([])
    setSelectedId(null)
  }

  async function copyBody() {
    if (!detail) return
    try {
      await navigator.clipboard.writeText(detail.payloadJson)
      setCopyNotice('Body JSON persis tersalin.')
    } catch {
      setRawVisible(true)
      setCopyNotice('Clipboard tidak tersedia; buka JSON di bawah lalu salin manual.')
    }
  }

  return <div className="gateway-audit-page">
    <div className="page-heading">
      <div><h1>Audit payload Agent</h1><p>Lihat body request yang benar-benar dikirim ke gateway, termasuk konteks follow-up dan tool yang tersedia.</p></div>
      <button className="button button-secondary" type="button" disabled={listLoading} onClick={() => setRefreshVersion(value => value + 1)}><RefreshCw size={16} className={listLoading ? 'spin' : ''} />Perbarui</button>
    </div>

    <section className="panel gateway-audit-security"><ShieldCheck size={18} /><p><strong>Akses terbatas</strong><span>Halaman ini hanya tersedia untuk rnd@nagatech.id. Body request disimpan {list?.retentionDays ?? 30} hari; header autentikasi dan respons model tidak dicatat.</span></p></section>

    <form className="panel gateway-audit-filters" onSubmit={applyFilters}>
      <label>ID interaksi<input value={filters.requestId} onChange={event => setFilters(value => ({ ...value, requestId: event.target.value }))} placeholder="requestId dari jawaban Agent" /></label>
      <label>ID room<input value={filters.sessionId} onChange={event => setFilters(value => ({ ...value, sessionId: event.target.value }))} placeholder="ObjectId room" /></label>
      <button className="button button-primary" type="submit"><Search size={16} />Cari audit</button>
    </form>

    {listError && <p className="gateway-audit-error" role="alert">{listError}</p>}
    <div className="gateway-audit-workspace">
      <section className="panel gateway-audit-list" aria-busy={listLoading}>
        <div className="gateway-audit-section-heading"><div><CardHeading icon={<FileSearch size={18} />}>Request ke gateway</CardHeading><p>Setiap putaran model dan ringkasan room tercatat sebagai request terpisah.</p></div><span>{listLoading ? 'Memuat…' : `${list?.data.length ?? 0} request`}</span></div>
        <div className="gateway-audit-table-scroll"><table><thead><tr><th>Waktu</th><th>Interaksi / room</th><th>Putaran</th><th>Status</th><th>Durasi</th><th>Body</th></tr></thead><tbody>
          {listLoading && !list ? <tr><td colSpan={6} className="gateway-audit-empty">Memuat catatan request…</td></tr>
            : list?.data.length ? list.data.map(row => <tr key={row.id} className={selectedId === row.id ? 'is-selected' : ''}>
              <td><button className="gateway-audit-row-button" type="button" onClick={() => setSelectedId(row.id)}><strong>{formatTime(row.createdAt)}</strong><small>{row.actorEmail}</small></button></td>
              <td><button className="gateway-audit-row-button" type="button" onClick={() => setSelectedId(row.id)}><strong title={row.exchangeRequestId}>{row.exchangeRequestId}</strong><small title={row.sessionId || ''}>{row.sessionId || 'Percakapan tanpa room'}</small><small className="gateway-audit-question-preview" title={row.questionPreview || ''}>{row.questionPreview || (row.kind === 'room-summary' ? 'Ringkasan konteks room' : 'Pertanyaan tidak tersedia')}</small></button></td>
              <td><span className="gateway-audit-kind">{row.kind === 'room-summary' ? 'Ringkasan room' : row.kind === 'bank-extraction' ? 'Pembacaan rekening' : row.kind === 'memory-learning' ? `Pembelajaran memory · ${row.round}` : `Chat · ${row.round}`}</span><small>{row.model}</small></td>
              <td><span className={`gateway-audit-status is-${row.outcome}`}>{row.statusCode ?? outcomeLabel[row.outcome]}</span></td>
              <td className="is-number">{row.latencyMs == null ? '—' : `${(row.latencyMs / 1000).toFixed(2)} dtk`}</td>
              <td className="is-number">{formatNumber(row.payloadBytes)} B</td>
            </tr>)
            : <tr><td colSpan={6} className="gateway-audit-empty">{listError ? 'Audit tidak dapat dimuat. Periksa akses atau coba perbarui.' : 'Belum ada request yang tercatat pada filter ini.'}</td></tr>}
        </tbody></table></div>
        <div className="gateway-audit-pagination"><span>Halaman {pageNumber} · catatan paling baru di halaman pertama</span><div>
          <button className="button button-secondary" type="button" disabled={!cursorStack.length || listLoading} onClick={() => setCursorStack(value => value.slice(0, -1))}><ChevronLeft size={15} />Sebelumnya</button>
          <button className="button button-secondary" type="button" disabled={!list?.pagination.nextCursor || listLoading} onClick={() => { const next = list?.pagination.nextCursor; if (next) setCursorStack(value => [...value, next]) }}>Berikutnya<ChevronRight size={15} /></button>
        </div></div>
      </section>

    </div>

    <dialog
      ref={sheetRef}
      className="gateway-audit-sheet"
      aria-labelledby="gateway-audit-sheet-title"
      onCancel={event => { event.preventDefault(); setSelectedId(null) }}
      onClose={() => setSelectedId(null)}
      onClick={event => { if (event.target === event.currentTarget) setSelectedId(null) }}
    >
      <div className="gateway-audit-sheet-layout">
        <header className="gateway-audit-sheet-header">
          <div className="gateway-audit-sheet-title-wrap">
            <span className="gateway-audit-sheet-icon"><Clipboard size={17} /></span>
            <div><h2 id="gateway-audit-sheet-title">Detail payload</h2><p title={detail?.exchangeRequestId || selectedRow?.exchangeRequestId || ''}>{detail?.exchangeRequestId || selectedRow?.exchangeRequestId || 'Memuat request…'}</p></div>
          </div>
          <button className="gateway-audit-sheet-close" type="button" aria-label="Tutup detail payload" onClick={() => setSelectedId(null)}><X size={18} /></button>
        </header>
        <div className="gateway-audit-sheet-scroll">
        {detailLoading && <p className="gateway-audit-detail-state" role="status">Memuat body request persis…</p>}
        {detailError && <p className="gateway-audit-error" role="alert">{detailError}</p>}
        {detail && <>
          <div className="gateway-audit-section-heading"><div><CardHeading icon={<Clipboard size={18} />}>Payload yang dikirim</CardHeading><p>{formatTime(detail.createdAt)} · {detail.actorEmail}</p></div><span className={`gateway-audit-status is-${detail.outcome}`}>{outcomeLabel[detail.outcome]}</span></div>
          <dl className="gateway-audit-metadata">
            <div><dt>Interaksi</dt><dd>{detail.exchangeRequestId}</dd></div><div><dt>Room</dt><dd>{detail.sessionId || 'Tanpa room'}</dd></div>
            <div><dt>Request</dt><dd>{detail.method} {detail.path}</dd></div><div><dt>Model</dt><dd>{detail.model} · putaran {detail.kind === 'room-summary' ? 'ringkasan' : detail.round}</dd></div>
            <div><dt>Respons gateway</dt><dd>{detail.statusCode ?? 'Tidak ada'}{detail.latencyMs == null ? '' : ` · ${(detail.latencyMs / 1000).toFixed(2)} dtk`}</dd></div><div><dt>Body tersimpan</dt><dd>{formatNumber(detail.payloadBytes)} byte · kedaluwarsa {formatTime(detail.expiresAt)}</dd></div>
          </dl>
          {payload ? <>
            <h3>Pesan dalam urutan kirim</h3>
            <div className="gateway-audit-messages">{(payload.messages ?? []).map((message, index) => <details className="gateway-audit-message" key={`${index}-${message.role || 'unknown'}`}>
              <summary><span className="gateway-audit-role">{message.role || 'unknown'}</span><span>{messageSummary(message)}</span></summary>
              <MessageBody message={message} />
              {message.tool_calls?.map(call => <div className="gateway-audit-tool-call" key={call.id || call.function?.name}><strong>Tool: {call.function?.name || 'tidak bernama'}</strong><pre>{call.function?.arguments || '{}'}</pre></div>)}
            </details>)}</div>
            {Array.isArray(payload.tools) && <details className="gateway-audit-tools"><summary>Definisi tool yang tersedia ({payload.tools.length})</summary><pre>{JSON.stringify(payload.tools, null, 2)}</pre></details>}
          </> : <p className="gateway-audit-error" role="alert">Payload tersimpan tetapi tidak dapat dibaca sebagai JSON. Body utuh tetap bisa dibuka pada bagian JSON.</p>}
          <details className="gateway-audit-tools" open={rawVisible} onToggle={event => setRawVisible(event.currentTarget.open)}>
            <summary>Body JSON utuh (payload persis)</summary>
            <div className="gateway-audit-raw-actions"><span>{formatNumber(detail.payloadBytes)} byte</span><button className="button button-secondary" type="button" onClick={() => void copyBody()}><Clipboard size={15} />Salin JSON</button></div>
            {rawVisible && <pre className="gateway-audit-raw-json">{detail.payloadJson}</pre>}
            {copyNotice && <p className="gateway-audit-copy-notice"><Check size={14} />{copyNotice}</p>}
          </details>
        </>}
        </div>
      </div>
    </dialog>
  </div>
}
