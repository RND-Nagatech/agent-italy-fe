import { distributionPriorityOptions, type DistributionPriority } from './lib/distribution-priority'
import { AgentKnowledgeReferences } from './components/AgentKnowledgeReferences'
import { DeleteChatDialog } from './components/DeleteChatDialog'
import { createRequestId } from './lib/request-id'
import { isBankingQuery, type BankScopeResolved, type BankScopeResult, type BankSelection } from './lib/banking'
import { agentSourceLabels, mentionsAgentSource, resolveAgentReportScope } from './lib/agent-report-scope'
import { AgentTemplateDialog } from './components/AgentTemplateDialog'
import { useTableSort, type TableSort } from './lib/table-sort'
import { SortHeader } from './components/TableSort'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleHelp,
  Clock3,
  Database,
  FileSearch,
  FileText,
  Eye,
  EyeOff,
  Filter,
  Image as ImageIcon,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MessageCircle,
  PackageCheck,
  PackageOpen,
  Paperclip,
  PieChart,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  ThumbsDown,
  ThumbsUp,
  UserRound,
  Users,
  Pencil,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from './auth/useAuth'
import { AgentResponse } from './components/AgentResponse'
import { AgentScopeClarifier, type AgentScopeSelection } from './components/AgentScopeClarifier'
import { CardHeading } from './components/CardHeading'
import { SourceDirectory } from './components/SourceDirectory'
import { ApiError } from './lib/api'
import { getUserQueryScope, invalidateSharedQueries, useSharedQuery } from './lib/shared-query'
import type {
  CacheStats,
  ShipmentDetailResult,
  ShipmentListResult,
  ShipmentPeriod,
  SalesBranchSummary,
  SalesSummaryResult,
  StockVsSalesResult,
  AgentDataSourceConfig,
  AgentChatProgress,
  AgentChatAttachment,
  AgentStatus,
  AgentChatMessage,
  AgentChatResponse,
  AgentChatSession,
  AgentChatSessionSummary,
  AgentHistorySearchResponse,
  AgentHistorySearchResult,
  ShipmentStatus,
  ShipmentSummary,
  UserSettings,
  CleaningPrioritySettings,
  CleaningMinimumStock,
  NetworkRestockSettings,
  DistributionFulfillmentMethod,
  AgentResponsePreferences,
  Role,
  User,
} from './lib/types'

let agentNotificationPermissionRequest: Promise<NotificationPermission | null> | null = null

function requestAgentNotificationPermission(): Promise<NotificationPermission | null> {
  if (typeof window === 'undefined' || !window.isSecureContext || !('Notification' in window)) return Promise.resolve(null)
  if (Notification.permission !== 'default') return Promise.resolve(Notification.permission)
  if (!agentNotificationPermissionRequest) {
    agentNotificationPermissionRequest = Notification.requestPermission().catch(() => 'denied' as NotificationPermission)
  }
  return agentNotificationPermissionRequest ?? Promise.resolve(null)
}

function notifyAgentAnswerReady(permissionRequest: Promise<NotificationPermission | null>, requestId: string) {
  void permissionRequest.then((permission) => {
    if (permission !== 'granted' || (document.visibilityState !== 'hidden' && document.hasFocus())) return
    const notification = new Notification('Jawaban Agent AI siap', {
      body: 'Pertanyaan Anda selesai diproses. Buka Italy untuk melihat jawabannya.',
      tag: `agent-answer-${requestId}`,
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  }).catch(() => undefined)
}

const shipmentPeriods: Array<{ value: ShipmentPeriod; label: string; description: string }> = [
  { value: 'this-month', label: 'Bulan ini', description: 'Mulai tanggal 1 bulan berjalan' },
  { value: 'three-months', label: '3 bulan terakhir', description: 'Mundurkan 3 bulan dari hari ini' },
  { value: 'six-months', label: '6 bulan terakhir', description: 'Mundurkan 6 bulan dari hari ini' },
  { value: 'one-year', label: '1 tahun terakhir', description: 'Mundurkan 12 bulan dari hari ini' },
  { value: 'all', label: 'Semua data', description: 'Tanpa batas tanggal pengiriman' },
]
const shipmentPageSizes = [5, 10, 20] as const
const AGENT_REQUEST_CONTENT_LIMIT = 19_000
const AGENT_REQUEST_TRUNCATION_MARKER = '\n[Konten history dipotong agar chat tetap dapat dikirim.]'
const overviewRefreshOptions = [
  { value: 0, label: 'Nonaktif' },
  { value: 60_000, label: '1 menit' },
  { value: 300_000, label: '5 menit' },
  { value: 900_000, label: '15 menit' },
  { value: 1_800_000, label: '30 menit' },
] as const
const defaultOverviewRefreshInterval = 300_000

function overviewRefreshStorageKey(userId: string) {
  return `pantes:overview-auto-refresh:v1:${userId}`
}

function normalizeOverviewRefreshInterval(value: number) {
  return overviewRefreshOptions.some((option) => option.value === value)
    ? value
    : defaultOverviewRefreshInterval
}

function periodLabel(period: ShipmentPeriod) {
  return shipmentPeriods.find((option) => option.value === period)?.label ?? 'Bulan ini'
}

const statusLabels: Record<ShipmentStatus, string> = {
  received: 'Diterima',
  pending: 'Dalam proses',
  partial: 'Diterima sebagian',
  review: 'Perlu ditinjau',
}

const statusDescriptions: Record<ShipmentStatus, string> = {
  received: 'Semua baris sumber berstatus diterima',
  pending: 'Semua baris sumber masih terbuka',
  partial: 'Terdapat baris diterima dan masih terbuka',
  review: 'Ada status penerimaan yang belum dikenali',
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('id-ID').format(value)
}

function formatWeight(value: number) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(value)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatCurrencyNumber(value: number) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value)
}

function formatDate(value: string | null, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const usesDateTimeStyle = options.dateStyle !== undefined || options.timeStyle !== undefined
  return new Intl.DateTimeFormat('id-ID', {
    ...(!usesDateTimeStyle ? { day: '2-digit', month: 'short', year: 'numeric' } : {}),
    ...options,
  }).format(date)
}

function formatTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(date)
}

function countFor(data: ShipmentListResult | undefined, status: ShipmentStatus) {
  return data?.statusCounts?.[status] ?? 0
}

function useShipments(query: string, enabled = true) {
  const { request, user } = useAuth()
  const scope = getUserQueryScope(user)
  const key = enabled && scope && query ? `shipments:list:${scope}:${query}` : null
  const [clientRoundTripMs, setClientRoundTripMs] = useState<number | null>(null)

  useEffect(() => setClientRoundTripMs(null), [key])

  const loader = useCallback(async () => {
    const requestStartedAt = performance.now()
    try {
      return await request<ShipmentListResult>(`/shipments?${query}`)
    } finally {
      setClientRoundTripMs(Number((performance.now() - requestStartedAt).toFixed(1)))
    }
  }, [query, request])

  const shared = useSharedQuery(key, loader)
  return { ...shared, clientRoundTripMs }
}

function useSalesSummary(period: ShipmentPeriod, enabled = true) {
  const { request, user } = useAuth()
  const scope = getUserQueryScope(user)
  const key = enabled && scope ? `sales-summary:${scope}:${period}` : null
  return useSharedQuery(key, () => request<SalesSummaryResult>(`/sales/summary?period=${encodeURIComponent(period)}`))
}

function useStockVsSales(enabled: boolean) {
  const { request, user } = useAuth()
  const scope = getUserQueryScope(user)
  const key = enabled && scope ? `stock-vs-sales:${scope}` : null
  const forceBackendRefresh = useRef(false)
  const shared = useSharedQuery(key, async () => {
    const refresh = forceBackendRefresh.current
    forceBackendRefresh.current = false
    return request<StockVsSalesResult>(`/sales/stock-vs-sales${refresh ? '?refresh=true' : ''}`)
  }, 60_000)
  const reload = useCallback(() => {
    forceBackendRefresh.current = true
    shared.reload()
  }, [shared.reload])
  return { ...shared, reload }
}

function useUserSettings() {
  const { request, user } = useAuth()
  const scope = getUserQueryScope(user)
  const key = scope ? `user-settings:${scope}` : null
  return useSharedQuery(key, () => request<UserSettings>('/settings'), 60_000)
}

function PageHeading({ eyebrow, title, description, action }: {
  eyebrow: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="sr-only">{eyebrow}</span>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action && <div className="page-heading-action">{action}</div>}
    </div>
  )
}

function DataNotice({ children, kind = 'info' }: { children: React.ReactNode; kind?: 'info' | 'warning' }) {
  const Icon = kind === 'warning' ? AlertTriangle : CircleHelp
  return <div className={`data-notice ${kind}`} role="note"><Icon size={17} aria-hidden="true" /><p>{children}</p></div>
}

function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="loading-block" aria-label="Memuat data" role="status">
      <span className="sr-only">Memuat data</span>
      {Array.from({ length: rows }, (_, index) => <span className="skeleton-line" key={index} />)}
    </div>
  )
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="inline-error" role="alert">
      <AlertTriangle size={18} aria-hidden="true" />
      <div><strong>Data belum dapat dimuat</strong><p>{message}</p></div>
      <button className="button button-secondary button-compact" type="button" onClick={retry}><RefreshCw size={14} /> Coba lagi</button>
    </div>
  )
}

function StatusBadge({ status }: { status: ShipmentStatus }) {
  const icon = status === 'received' ? <Check size={13} /> : status === 'review' ? <AlertTriangle size={13} /> : <Clock3 size={13} />
  return <span className={`status-badge status-${status}`} title={statusDescriptions[status]}>{icon}{statusLabels[status]}</span>
}

function PanelTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="panel-heading">
      <div><CardHeading>{title}</CardHeading>{subtitle && <p>{subtitle}</p>}</div>
      {action}
    </div>
  )
}

function ShipmentRows({ items, onOpen, sort, onSort }: { items: ShipmentSummary[]; onOpen: (shipment: ShipmentSummary) => void; sort?: TableSort; onSort?: (key: string) => void }) {
  const localSort = useTableSort()
  const orderedItems = onSort ? items : localSort.order(items, (row, key) => row[key as 'recordCount' | 'totalWeight' | 'lastInputAt'])
  const activeSort = onSort ? sort : localSort.sort
  const changeSort = onSort ?? localSort.change
  if (!items.length) {
    return <div className="empty-state"><PackageOpen size={23} /><strong>Belum ada pengiriman</strong><span>Data dengan cakupan ini belum tersedia.</span></div>
  }

  return (
    <div className="table-scroll">
      <table className="data-table shipment-table">
        <thead><tr>
          <th scope="col">Nomor kirim</th>
          <th scope="col">Tujuan</th>
          <SortHeader column="recordCount" sort={activeSort} onSort={changeSort}>Baris data</SortHeader>
          <SortHeader column="totalWeight" sort={activeSort} onSort={changeSort}>Total berat</SortHeader>
          <th scope="col">Status</th>
          <SortHeader column="lastInputAt" sort={activeSort} onSort={changeSort}>Terakhir diinput</SortHeader>
          <th scope="col"><span className="sr-only">Buka detail</span></th>
        </tr></thead>
        <tbody>{orderedItems.map((shipment) => (
          <tr key={shipment.noKirim}>
            <td><button className="shipment-number" type="button" onClick={() => onOpen(shipment)}>{shipment.noKirim}</button></td>
            <td>
              {shipment.destination || <span className="muted">Tujuan tidak tersedia</span>}
              {shipment.destinationMismatch && <span className="destination-warning" title="Tujuan berbeda pada baris sumber">Perlu ditinjau</span>}
            </td>
            <td className="align-right tabular">{formatNumber(shipment.recordCount)}</td>
            <td className="align-right tabular">{formatWeight(shipment.totalWeight)}</td>
            <td><StatusBadge status={shipment.status} /></td>
            <td className="date-cell is-number">{formatTime(shipment.lastInputAt)}</td>
            <td className="row-action-cell"><button className="icon-button row-open" type="button" aria-label={`Buka pengiriman ${shipment.noKirim}`} onClick={() => onOpen(shipment)}><ArrowUpRight size={16} /></button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function ShipmentDetail({ noKirim, onClose }: { noKirim: string; onClose: () => void }) {
  const { request, user } = useAuth()
  const scope = getUserQueryScope(user)
  const key = scope ? `shipment-detail:${scope}:${noKirim}:100` : null
  const detailQuery = useSharedQuery(
    key,
    () => request<ShipmentDetailResult>(`/shipments/${encodeURIComponent(noKirim)}?itemLimit=100`),
    60_000,
  )
  const reducedMotion = useReducedMotion()
  const [items, setItems] = useState<ShipmentDetailResult['items']>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [moreLoading, setMoreLoading] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)
  const data = detailQuery.data
  const loading = detailQuery.loading
  const error = detailQuery.error ?? moreError
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!data) return
    setItems(data.items)
    setCursor(data.nextItemCursor)
    setMoreError(null)
  }, [data])

  const retry = () => {
    setMoreError(null)
    detailQuery.reload()
  }

  const loadMore = async () => {
    if (!cursor) return
    setMoreLoading(true)
    setMoreError(null)
    try {
      const result = await request<ShipmentDetailResult>(`/shipments/${encodeURIComponent(noKirim)}?itemLimit=100&itemCursor=${encodeURIComponent(cursor)}`)
      setItems((current) => [...current, ...result.items])
      setCursor(result.nextItemCursor)
    } catch (reason) {
      setMoreError(reason instanceof Error ? reason.message : 'Baris berikutnya gagal dimuat.')
    } finally {
      setMoreLoading(false)
    }
  }

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')
      const first = focusable.item(0)
      const last = focusable.item(focusable.length - 1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [onClose])

  return (
    <AnimatePresence>
      <motion.div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.aside
          ref={dialogRef} className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title" tabIndex={-1}
          initial={reducedMotion ? { opacity: 0 } : { x: 32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }} exit={reducedMotion ? { opacity: 0 } : { x: 32, opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
        >
          <div className="drawer-header">
            <div><p className="eyebrow">DETAIL PENGIRIMAN</p><h2 id="detail-title">{noKirim}</h2></div>
            <button ref={closeButtonRef} className="icon-button" type="button" aria-label="Tutup detail" onClick={onClose}><X size={18} /></button>
          </div>
          {loading ? <LoadingBlock rows={5} /> : error && !data ? <LoadError message={error} retry={retry} /> : data ? (
            <>
              <div className="detail-summary">
                <div><span>Status</span><StatusBadge status={data.summary.status} /></div>
                <div><span>Tujuan</span><strong>{data.summary.destination || 'Tidak tersedia'}</strong></div>
                <div><span>Baris data</span><strong className="tabular">{formatNumber(data.summary.recordCount)}</strong></div>
                <div><span>Total berat</span><strong className="tabular">{formatWeight(data.summary.totalWeight)}</strong></div>
                <div><span>Terakhir diinput</span><strong>{formatTime(data.summary.lastInputAt)}</strong></div>
              </div>
              <DataNotice kind={data.summary.unknownStatusRecordCount > 0 || data.summary.destinationMismatch ? 'warning' : 'info'}>
                {data.summary.unknownStatusRecordCount > 0
                  ? `${formatNumber(data.summary.unknownStatusRecordCount)} baris memiliki status penerimaan yang belum dikenali.`
                  : 'Baris data menghitung rekaman sumber; total berat menjumlahkan nilai berat pada setiap rekaman.'}
              </DataNotice>
              <div className="detail-items-heading"><div><h3>Baris sumber</h3><span>{formatNumber(items.length)} dari {formatNumber(data.summary.recordCount)} ditampilkan</span></div></div>
              {error && <p className="drawer-inline-error" role="alert">{error}</p>}
              <div className="detail-items-list">
                {items.map((item) => (
                  <article className="detail-item" key={item.itemId}>
                    <div className="detail-item-top"><strong>{item.name || item.productCode || 'Nama barang tidak tersedia'}</strong><span className={`mini-status ${item.receiptStatus === 'CLOS' ? 'is-received' : item.receiptStatus === 'OPEN' ? 'is-pending' : ''}`}>{item.receiptStatus === 'CLOS' ? 'Diterima' : item.receiptStatus === 'OPEN' ? 'Terbuka' : item.receiptStatus || 'Status kosong'}</span></div>
                    <p>{[item.productCode && `Kode ${item.productCode}`, item.barcode && `Barcode ${item.barcode}`, item.attribute, item.color].filter(Boolean).join(' · ') || 'Informasi atribut tidak tersedia'}</p>
                    <div className="detail-item-footer">
                      <span className="detail-item-date">Input {formatDate(item.inputDate)}{item.receiveDate ? ` · Terima ${formatDate(item.receiveDate)}` : ''}</span>
                      <span className="detail-item-weight">Berat barang <strong className="tabular">{item.weight === null ? '—' : formatWeight(item.weight)}</strong></span>
                    </div>
                  </article>
                ))}
                {!items.length && <div className="empty-state compact"><FileSearch size={20} /><span>Tidak ada baris sumber.</span></div>}
              </div>
              {cursor && <button className="button button-secondary load-more-button" type="button" disabled={moreLoading} onClick={() => void loadMore()}>{moreLoading ? <LoaderCircle className="spin" size={16} /> : <ArrowDownRight size={15} />} Muat 100 baris berikutnya</button>}
              <footer className="drawer-footer"><span>{formatNumber(items.length)} dari {formatNumber(data.summary.recordCount)} baris sumber</span><button className="button button-primary" type="button" onClick={onClose}>Tutup</button></footer>
            </>
          ) : null}
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  )
}

export function OverviewPage() {
  const { user } = useAuth()
  const shipmentSettings = useUserSettings()
  const shipmentPeriod = shipmentSettings.data?.shipmentDefaultPeriod ?? (shipmentSettings.error ? 'this-month' : null)
  const query = useMemo(() => shipmentPeriod
    ? new URLSearchParams({ page: '1', pageSize: '8', period: shipmentPeriod }).toString()
    : '', [shipmentPeriod])
  const { data, loading, error, updatedAt, reload } = useShipments(query)
  const sales = useSalesSummary('this-month')
  const [selected, setSelected] = useState<string | null>(null)
  const [refreshPreference, setRefreshPreference] = useState<{ userId: string | null; intervalMs: number }>({ userId: null, intervalMs: defaultOverviewRefreshInterval })
  const lastAutoRefreshAt = useRef(0)
  const autoRefreshInterval = user && refreshPreference.userId === user.id ? refreshPreference.intervalMs : 0
  const autoRefreshReady = Boolean(user && refreshPreference.userId === user.id)
  const inProcessCount = countFor(data, 'pending') + countFor(data, 'partial')
  const totalShipmentCount = Object.values(data?.statusCounts ?? {}).reduce((total, count) => total + count, 0)
  const receivedPercentage = totalShipmentCount > 0 ? countFor(data, 'received') / totalShipmentCount * 100 : null
  const shipmentPeriodText = shipmentPeriod ? periodLabel(shipmentPeriod) : 'Memuat periode'
  const refreshDashboard = useCallback(() => {
    reload()
    sales.reload()
  }, [reload, sales.reload])
  const refreshAutomatically = useCallback(() => {
    const now = Date.now()
    if (now - lastAutoRefreshAt.current < 1_500) return
    lastAutoRefreshAt.current = now
    refreshDashboard()
  }, [refreshDashboard])

  useEffect(() => {
    if (!user?.id) {
      setRefreshPreference({ userId: null, intervalMs: defaultOverviewRefreshInterval })
      return
    }

    let intervalMs = defaultOverviewRefreshInterval
    try {
      const stored = window.localStorage.getItem(overviewRefreshStorageKey(user.id))
      if (stored !== null) intervalMs = normalizeOverviewRefreshInterval(Number(stored))
    } catch {
      // Keep the default interval when browser storage is unavailable.
    }
    setRefreshPreference({ userId: user.id, intervalMs })
  }, [user?.id])

  const changeAutoRefreshInterval = (intervalMs: number) => {
    if (!user?.id) return
    const normalizedInterval = normalizeOverviewRefreshInterval(intervalMs)
    setRefreshPreference({ userId: user.id, intervalMs: normalizedInterval })
    try {
      window.localStorage.setItem(overviewRefreshStorageKey(user.id), String(normalizedInterval))
    } catch {
      // The current choice still applies for this page even if storage is unavailable.
    }
  }

  useEffect(() => {
    if (!autoRefreshReady || !autoRefreshInterval || loading || sales.loading) return

    const timeout = window.setTimeout(() => {
      if (document.visibilityState === 'visible') refreshAutomatically()
    }, autoRefreshInterval)
    return () => window.clearTimeout(timeout)
  }, [autoRefreshInterval, autoRefreshReady, loading, refreshAutomatically, sales.loading])

  useEffect(() => {
    if (!autoRefreshReady || !autoRefreshInterval) return

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible' && !loading && !sales.loading) refreshAutomatically()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenVisible)
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshWhenVisible)
    }
  }, [autoRefreshInterval, autoRefreshReady, loading, refreshAutomatically, sales.loading])

  return (
    <>
      <PageHeading
        eyebrow="RINGKASAN OPERASIONAL"
        title="Kendali distribusi"
        description="Pantau pengiriman sesuai periode default dan penjualan cabang."
        action={<div className="overview-heading-actions">
          <label className="overview-auto-refresh-control">
            <Clock3 size={14} aria-hidden="true" />
            <span>Refresh otomatis</span>
            <select aria-label="Interval refresh otomatis Ringkasan" value={autoRefreshInterval} onChange={(event) => changeAutoRefreshInterval(Number(event.target.value))}>
              {overviewRefreshOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button className="button button-secondary" type="button" onClick={refreshDashboard} disabled={loading || sales.loading}><RefreshCw size={15} className={loading || sales.loading ? 'spin' : ''} /> Perbarui data</button>
        </div>}
      />

      <div className="source-status-line" aria-live="polite">
        <span className={`source-dot ${loading ? 'is-loading' : error ? 'is-down' : 'is-up'}`} />
        <strong>{loading ? data ? 'Memperbarui data' : 'Memuat sumber data' : error ? data ? 'Data terakhir tersedia' : 'Sumber data tidak tersedia' : 'Data pengiriman tersedia'}</strong>
        {updatedAt !== null && <span>· terakhir berhasil diperbarui {formatTime(new Date(updatedAt).toISOString())}</span>}
        {shipmentPeriod && <span>· periode {shipmentPeriodText.toLowerCase()}</span>}
        {autoRefreshReady && <span>· refresh otomatis {overviewRefreshOptions.find((option) => option.value === autoRefreshInterval)?.label.toLowerCase()}</span>}
        {data?.items.some((item) => item.destinationMismatch || item.unknownStatusRecordCount > 0) && <span className="source-attention">· ada baris perlu ditinjau</span>}
      </div>

      {shipmentSettings.error && !shipmentSettings.data && <DataNotice kind="warning">Pengaturan periode tidak dapat dimuat. Ringkasan sementara memakai Bulan ini.</DataNotice>}
      {error && <LoadError message={error} retry={reload} />}

      <div className="overview-grid">
        <section className="metric-card metric-dark" aria-labelledby="metric-process-title">
          <div className="metric-card-top"><span className="metric-period">{shipmentPeriodText}</span></div>
          <CardHeading className="metric-label" id="metric-process-title">No. kirim dalam proses</CardHeading>
          <div className="metric-number">{loading && !data ? <span className="skeleton-number" /> : data ? formatNumber(inProcessCount) : '—'}</div>
          <div className="metric-card-bottom"><span><strong>{!data ? '—' : formatNumber(countFor(data, 'pending'))}</strong> belum diterima</span><span className="metric-divider" /><span><strong>{!data ? '—' : formatNumber(countFor(data, 'partial'))}</strong> sebagian</span></div>
          <span className="metric-card-corner" aria-hidden="true"><PackageOpen size={85} strokeWidth={1} /></span>
        </section>

        <section className="metric-card metric-received" aria-labelledby="metric-received-title">
          <div className="metric-card-top"><span className="metric-period">{shipmentPeriodText}</span></div>
          <CardHeading className="metric-label" id="metric-received-title">No. kirim diterima</CardHeading>
          <div className="metric-number">{loading && !data ? <span className="skeleton-number light" /> : data ? formatNumber(countFor(data, 'received')) : '—'}</div>
          <div className="metric-card-bottom"><span><strong>{!data ? '—' : formatNumber(countFor(data, 'review'))}</strong> perlu ditinjau</span><span className="metric-divider" /><span>status per dokumen</span></div>
          <span className="metric-card-corner received-corner" aria-hidden="true"><PackageCheck size={78} strokeWidth={1} /></span>
        </section>

        <section className="metric-card metric-rate" aria-label="Tingkat penerimaan">
          <div className="metric-card-top"><span className="metric-period">{shipmentPeriodText}</span></div>
          <CardHeading className="metric-label">Tingkat penerimaan</CardHeading>
          <div className="metric-number">{receivedPercentage === null ? '—' : `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(receivedPercentage)}%`}</div>
          <div className="metric-rate-rule" aria-hidden="true"><span style={{ width: `${receivedPercentage ?? 0}%` }} /></div>
          <div className="metric-card-bottom">{data ? `${formatNumber(countFor(data, 'received'))} diterima dari ${formatNumber(totalShipmentCount)} nomor kirim` : 'Menunggu ringkasan pengiriman'}</div>
        </section>

        <section className="panel recent-panel">
          <PanelTitle title="Pengiriman terbaru" subtitle="Diurutkan berdasarkan waktu input terbaru" action={<Link className="text-link" to="/pengiriman">Lihat semua <ArrowRight size={14} /></Link>} />
          {loading && !data ? <LoadingBlock rows={8} /> : error && !data ? <div className="panel-error-note">Daftar menunggu koneksi ke sumber pengiriman.</div> : <ShipmentRows items={data?.items.slice(0, 8) ?? []} onOpen={(item) => setSelected(item.noKirim)} />}
          <div className="table-footnote"><CircleHelp size={14} /><span>Ringkasan mengikuti periode default {shipmentPeriodText.toLowerCase()}. “Baris data” menghitung rekaman sumber; total berat menjumlahkan nilai <code>berat</code> pada tiap rekaman per nomor kirim.</span></div>
        </section>

        <section className="panel branch-panel">
          <PanelTitle title="Dalam proses per tujuan" subtitle="Jumlah dokumen dalam proses · 5 teratas" action={<Link className="icon-link" to="/distribusi/cabang" aria-label="Buka analitik cabang"><ArrowUpRight size={16} /></Link>} />
          {loading && !data ? <LoadingBlock rows={4} /> : error && !data ? <div className="panel-error-note">Peringkat belum dapat dimuat.</div> : <DestinationRanking rows={data?.inProcessByDestination ?? []} />}
          <div className="sales-mini-section">
            <div className="sales-mini-heading"><CardHeading as="h3">Peringkat penjualan</CardHeading><span>Nilai jual · bulan ini</span></div>
            {sales.loading && !sales.data ? <LoadingBlock rows={3} /> : sales.error && !sales.data ? <div className="panel-error-note">Peringkat penjualan belum dapat dimuat.</div> : <SalesRanking rows={sales.data?.branches ?? []} limit={5} />}
          </div>
        </section>
      </div>
      {selected && <ShipmentDetail key={selected} noKirim={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

function DestinationRanking({ rows }: { rows: ShipmentListResult['inProcessByDestination'] }) {
  if (!rows.length) return <div className="empty-state ranking-empty"><PackageCheck size={20} /><span>Belum ada dokumen dalam proses.</span></div>
  const maximum = Math.max(...rows.map((row) => row.shipmentCount), 1)
  return <ol className="ranking-list">{rows.map((row, index) => (
    <li key={row.destination}>
      <span className="ranking-index">{String(index + 1).padStart(2, '0')}</span>
      <div className="ranking-content"><div className="ranking-line"><strong>{row.destination}</strong><b className="tabular">{formatNumber(row.shipmentCount)}</b></div><div className="ranking-track"><span style={{ width: `${Math.max((row.shipmentCount / maximum) * 100, 3)}%` }} /></div></div>
    </li>
  ))}</ol>
}

function sortSalesBranches(rows: SalesBranchSummary[]) {
  return [...rows].sort((left, right) => right.salesAmount - left.salesAmount || left.alias.localeCompare(right.alias, 'id'))
}

function SalesRanking({ rows, limit }: { rows: SalesBranchSummary[]; limit?: number }) {
  const rankedRows = sortSalesBranches(rows).slice(0, limit)
  if (!rankedRows.length) return <div className="empty-state ranking-empty"><Database size={20} /><span>Belum ada sumber penjualan aktif.</span></div>
  const maximum = Math.max(...rankedRows.map((row) => row.salesAmount), 1)
  return <ol className="ranking-list sales-ranking-list">{rankedRows.map((row, index) => (
    <li key={row.branchId}>
      <span className="ranking-index">{String(index + 1).padStart(2, '0')}</span>
      <div className="ranking-content"><div className="ranking-line"><strong title={`${row.alias} (${row.branchId})`}>{row.alias}</strong><b className="tabular">{formatCurrency(row.salesAmount)}</b></div><div className="ranking-track"><span style={{ width: row.salesAmount > 0 ? `${Math.max((row.salesAmount / maximum) * 100, 3)}%` : '0%' }} /></div></div>
    </li>
  ))}</ol>
}

function ShipmentFilters({ selected, onSelect, data }: { selected: string; onSelect: (value: string) => void; data?: ShipmentListResult }) {
  const allCount = data
    ? Object.values(data.statusCounts).reduce((total, count) => total + count, 0)
    : undefined
  const filters = [
    { key: 'all', label: 'Semua', count: allCount },
    { key: 'pending', label: 'Dalam proses', count: data ? countFor(data, 'pending') : undefined },
    { key: 'received', label: 'Diterima', count: data ? countFor(data, 'received') : undefined },
  ]
  return <div className="status-filters" role="group" aria-label="Filter status pengiriman">{filters.map((filter) => (
    <button key={filter.key} type="button" className={`filter-tab${selected === filter.key ? ' is-selected' : ''}`} aria-pressed={selected === filter.key} onClick={() => onSelect(filter.key)}>
      {filter.label}<span>{filter.count === undefined ? '—' : formatNumber(filter.count)}</span>
    </button>
  ))}</div>
}

function DebouncedSearch({ initialValue, onCommit }: { initialValue: string; onCommit: (value: string) => void }) {
  const [value, setValue] = useState(initialValue)
  useEffect(() => {
    const timer = window.setTimeout(() => onCommit(value.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [onCommit, value])

  return (
    <label className="search-control">
      <Search size={16} aria-hidden="true" />
      <span className="sr-only">Cari nomor kirim</span>
      <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Cari nomor kirim" maxLength={80} />
    </label>
  )
}

export function ShipmentsPage({ receiving = false }: { receiving?: boolean }) {
  const { request, user } = useAuth()
  const settingsQuery = useUserSettings()
  const isAdmin = user?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const statusParam = params.get('status') || 'all'
  const page = Math.max(1, Number(params.get('page') || 1))
  const requestedPageSize = Number(params.get('pageSize') || 20)
  const pageSize = shipmentPageSizes.find((value) => value === requestedPageSize) ?? 20
  const queryText = params.get('search') || ''
  const [selected, setSelected] = useState<string | null>(null)
  const [refreshingCache, setRefreshingCache] = useState(false)
  const [cacheRefreshError, setCacheRefreshError] = useState<string | null>(null)
  const [debugEnabled, setDebugEnabled] = useState(false)
  const shipmentSort = useTableSort({ key: 'lastInputAt', direction: 'desc' }, () => { const next = new URLSearchParams(params); next.delete('page'); setParams(next) })
  const defaultPeriod = settingsQuery.data?.shipmentDefaultPeriod ?? (settingsQuery.error ? 'this-month' : null)
  const validStatus = ['all', 'pending', 'received'].includes(statusParam) ? statusParam : 'all'
  const commitSearch = useCallback((value: string) => {
    if (value === queryText) return
    const next = new URLSearchParams(params)
    if (value) next.set('search', value)
    else next.delete('search')
    next.delete('page')
    setParams(next)
  }, [params, queryText, setParams])

  const query = useMemo(() => {
    if (!defaultPeriod) return ''
    const search = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    search.set('period', defaultPeriod)
    if (shipmentSort.sort) { search.set('sortBy', shipmentSort.sort.key); search.set('sortDirection', shipmentSort.sort.direction) }
    if (validStatus !== 'all') search.set('status', validStatus)
    if (queryText) search.set('search', queryText)
    if (debugEnabled && isAdmin && !receiving) search.set('debug', '1')
    return search.toString()
  }, [defaultPeriod, page, pageSize, validStatus, queryText, debugEnabled, isAdmin, receiving, shipmentSort.sort])
  const { data, loading, error, reload, clientRoundTripMs } = useShipments(query)

  const refreshShipments = useCallback(async () => {
    setCacheRefreshError(null)
    if (receiving) {
      reload()
      return
    }

    setRefreshingCache(true)
    try {
      await request('/shipments/refresh-cache', { method: 'POST' })
      invalidateSharedQueries('shipment')
      reload()
    } catch (reason) {
      setCacheRefreshError(reason instanceof Error ? reason.message : 'Cache pengiriman tidak dapat diperbarui.')
    } finally {
      setRefreshingCache(false)
    }
  }, [receiving, reload, request])

  const changeStatus = (value: string) => {
    const next = new URLSearchParams(params)
    if (value === 'all') next.delete('status')
    else next.set('status', value)
    next.delete('page')
    setParams(next)
  }

  const changePage = (nextPage: number) => {
    const next = new URLSearchParams(params)
    if (nextPage <= 1) next.delete('page')
    else next.set('page', String(nextPage))
    setParams(next)
  }

  const changePageSize = (value: number) => {
    const next = new URLSearchParams(params)
    if (value >= 20) next.delete('pageSize')
    else next.set('pageSize', String(value))
    next.delete('page')
    setParams(next)
  }

  const heading = receiving ? 'Pantau penerimaan' : 'Daftar pengiriman'
  return (
    <>
      <PageHeading
        eyebrow={receiving ? 'MONITOR PENERIMAAN' : 'MONITOR PENGIRIMAN'}
        title={heading}
        description={receiving ? 'Pantau status penerimaan pada dokumen pengiriman. Transaksi penerimaan tetap dikelola pada proses yang berlaku.' : `Cari nomor kirim dengan periode default ${periodLabel(defaultPeriod ?? 'this-month').toLowerCase()}. Perubahan periode tersedia di Pengaturan.`}
        action={<div className="shipment-page-actions">
          {isAdmin && !receiving && <label className="query-debug-toggle"><input type="checkbox" checked={debugEnabled} onChange={(event) => setDebugEnabled(event.target.checked)} /> <Activity size={14} /> Diagnostik query</label>}
          <button className="button button-secondary" type="button" onClick={() => void refreshShipments()} disabled={loading || refreshingCache}><RefreshCw size={15} className={loading || refreshingCache ? 'spin' : ''} /> Perbarui</button>
        </div>}
      />
      {cacheRefreshError && <LoadError message={cacheRefreshError} retry={() => void refreshShipments()} />}
      <DataNotice>Status mengikuti rekaman sumber. Total berat adalah penjumlahan berat per nomor kirim; baris data menunjukkan jumlah rekaman, bukan jumlah unit barang.</DataNotice>
      {error && data && <LoadError message={error} retry={reload} />}
      <section className="panel shipment-list-panel">
        <div className="list-toolbar">
          <div className="toolbar-heading"><div><CardHeading icon={<Filter size={19} />}>{receiving ? 'Status penerimaan' : 'Semua pengiriman'}</CardHeading><p>{data ? `${formatNumber(data.total)} nomor kirim pada cakupan ini` : 'Daftar status dari sumber data'}</p>{!receiving && <Link className="period-setting-link" to="/pengaturan">Periode: {periodLabel(defaultPeriod ?? 'this-month')} · Ubah</Link>}</div></div>
          <div className="list-toolbar-actions">
            {!receiving && <label className="page-size-control"><span>Jumlah per halaman</span><select value={pageSize} aria-label="Jumlah pengiriman per halaman" onChange={(event) => changePageSize(Number(event.target.value))}>{shipmentPageSizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>}
            <DebouncedSearch key={queryText} initialValue={queryText} onCommit={commitSearch} />
          </div>
        </div>
        <ShipmentFilters selected={validStatus} onSelect={changeStatus} data={data} />
        {loading && !data ? <LoadingBlock rows={7} /> : error && !data ? <LoadError message={error} retry={reload} /> : <ShipmentRows sort={shipmentSort.sort} onSort={shipmentSort.change} items={data?.items ?? []} onOpen={(item) => setSelected(item.noKirim)} />}
        {data && <div className="pagination-bar">
          <span>Menampilkan {data.total ? formatNumber((page - 1) * data.pageSize + 1) : '0'}–{formatNumber(Math.min(page * data.pageSize, data.total))} dari {formatNumber(data.total)} nomor kirim</span>
          <div className="pagination-controls">
            <button type="button" className="icon-button" aria-label="Halaman sebelumnya" disabled={loading || page <= 1} onClick={() => changePage(page - 1)}><ChevronLeft size={18} /></button>
            <span>Halaman <strong>{formatNumber(page)}</strong> dari <strong>{formatNumber(Math.max(1, data.totalPages))}</strong></span>
            <button type="button" className="icon-button" aria-label="Halaman berikutnya" disabled={loading || page >= data.totalPages} onClick={() => changePage(page + 1)}><ChevronRight size={18} /></button>
          </div>
        </div>}
      </section>
      {isAdmin && debugEnabled && !receiving && !loading && data?.debug && <section className="panel query-debug-panel" aria-labelledby="query-debug-title">
        <div className="query-debug-heading">
          <div><p className="eyebrow">DIAGNOSTIK ADMIN</p><CardHeading id="query-debug-title">Waktu pengambilan data</CardHeading><p>Sumber: <code>{data.debug.source}</code> · Periode {periodLabel(data.debug.period)} · Status {data.debug.status === 'all' ? 'Semua' : statusLabels[data.debug.status]}</p></div>
          <span className={`query-cache-state ${data.debug.cacheStatus}`}>{data.debug.cacheStatus === 'hit' ? 'Cache hit' : data.debug.cacheStatus === 'miss' ? 'Cache miss' : 'Query digabung'}</span>
        </div>
        <div className="query-debug-grid">
          <QueryDebugMetric label="Round-trip MongoDB" value={data.debug.mongoRoundTripMs === null ? '—' : `${data.debug.mongoRoundTripMs} ms`} detail={data.debug.cacheStatus === 'hit' ? 'Tidak ada query Mongo pada request ini' : data.debug.cacheStatus === 'coalesced' ? 'Memakai query identik yang sedang berjalan' : 'Agregasi hingga seluruh hasil diterima backend'} />
          <QueryDebugMetric label="Waktu service backend" value={`${data.debug.serviceMs} ms`} detail="Termasuk tunggu cache dan pemrosesan service" />
          <QueryDebugMetric label="Waktu request browser" value={clientRoundTripMs === null ? '—' : `${clientRoundTripMs} ms`} detail="Dari pemanggilan frontend sampai respons API diterima" />
          <QueryDebugMetric label="Rekaman sumber cocok" value={formatNumber(data.debug.matchingSourceRecords ?? 0)} detail="Baris tt_kirim_barang yang ikut membentuk hasil" />
          <QueryDebugMetric label="Nomor kirim cocok" value={formatNumber(data.debug.totalMatchingGroups)} detail={`${formatNumber(data.debug.returnedItems)} item dikirim pada halaman ${formatNumber(data.debug.page)} dari ${formatNumber(data.debug.pageSize)} per halaman`} />
          <QueryDebugMetric label="Filter tambahan" value={data.debug.searchApplied ? 'Pencarian aktif' : 'Tanpa pencarian'} detail={`Periode ${periodLabel(data.debug.period)} · ${data.debug.status === 'all' ? 'semua status' : statusLabels[data.debug.status]}`} />
        </div>
        <p className="query-debug-footnote">Durasi MongoDB adalah waktu wall-clock di backend saat menunggu agregasi, termasuk jaringan dan penerimaan hasil; ini bukan waktu CPU server MongoDB. Diagnostik tidak menjalankan query explain tambahan.</p>
      </section>}
      <p className="bottom-footnote"><ShieldCheck size={14} /> Akses data cabang dibatasi oleh server sesuai role akun.</p>
      {selected && <ShipmentDetail key={selected} noKirim={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

function QueryDebugMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="query-debug-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
}

export function BranchAnalyticsPage() {
  const [analyticsView, setAnalyticsView] = useState<'sales' | 'stock-vs-sales'>('sales')
  const showSales = analyticsView === 'sales'
  const shipmentSettings = useUserSettings()
  const shipmentPeriod = shipmentSettings.data?.shipmentDefaultPeriod ?? (shipmentSettings.error ? 'this-month' : null)
  const query = useMemo(() => shipmentPeriod
    ? new URLSearchParams({ page: '1', pageSize: '5', period: shipmentPeriod }).toString()
    : '', [shipmentPeriod])
  const { data, loading, error, reload } = useShipments(query, showSales)
  const [period, setPeriod] = useState<ShipmentPeriod>('this-month')
  const [pendingPeriod, setPendingPeriod] = useState<ShipmentPeriod | null>(null)
  const sales = useSalesSummary(period, showSales)
  const stockVsSales = useStockVsSales(!showSales)
  const rows = data?.inProcessByDestination ?? []
  const totalInProcess = countFor(data, 'pending') + countFor(data, 'partial')
  const salesSort = useTableSort()
  const salesBranches = salesSort.order(sortSalesBranches(sales.data?.branches ?? []), (row, key) => row[key as 'invoiceCount' | 'quantity' | 'totalWeight' | 'salesAmount'])
  const shipmentPeriodText = shipmentPeriod ? periodLabel(shipmentPeriod) : 'Memuat periode'
  const branchAliases = useMemo(() => new Map<string, string>(
    (sales.data?.branches ?? []).map((branch) => [branch.branchId.trim().toUpperCase(), branch.alias]),
  ), [sales.data])

  const requestSalesPeriod = (nextPeriod: ShipmentPeriod) => {
    if (nextPeriod === 'one-year' || nextPeriod === 'all') {
      setPendingPeriod(nextPeriod)
      return
    }
    setPeriod(nextPeriod)
  }

  const confirmSalesPeriod = () => {
    if (!pendingPeriod) return
    setPeriod(pendingPeriod)
    setPendingPeriod(null)
  }

  const shipmentIsUnavailable = !data

  return (
    <>
      <PageHeading
        eyebrow="ANALITIK CABANG"
        title="Kinerja cabang"
        description="Pantau penjualan, stok aktif, dan kiriman yang masih berjalan di setiap cabang."
        action={(
          <div className="analytics-actions">
            {showSales && <label className="sales-period-control"><span>Periode penjualan</span><select value={period} aria-label="Periode ringkasan penjualan" onChange={(event) => requestSalesPeriod(event.target.value as ShipmentPeriod)}>{shipmentPeriods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
            <button className="button button-secondary" type="button" onClick={() => { if (showSales) { reload(); sales.reload() } else stockVsSales.reload() }} disabled={showSales ? loading || sales.loading : stockVsSales.loading}><RefreshCw size={15} className={showSales ? loading || sales.loading ? 'spin' : '' : stockVsSales.loading ? 'spin' : ''} /> Perbarui</button>
          </div>
        )}
      />
      <div className="analytics-view-tabs" role="group" aria-label="Jenis analitik cabang">
        <button type="button" aria-pressed={showSales} className={showSales ? 'is-active' : ''} onClick={() => setAnalyticsView('sales')}>Penjualan cabang</button>
        <button type="button" aria-pressed={!showSales} className={!showSales ? 'is-active' : ''} onClick={() => setAnalyticsView('stock-vs-sales')}>Stok vs penjualan</button>
      </div>
      {showSales ? <div>
      {error && data && <LoadError message={error} retry={reload} />}
      {sales.error && sales.data && <LoadError message={sales.error} retry={sales.reload} />}
      {shipmentSettings.error && !shipmentSettings.data && <DataNotice kind="warning">Pengaturan periode tidak dapat dimuat. Ringkasan pengiriman sementara memakai Bulan ini.</DataNotice>}
      <div className="analytics-bento-grid">
        <section className="analytics-sales-hero" aria-labelledby="analytics-sales-title">
          <div className="analytics-sales-hero-top"><CardHeading>Penjualan cabang</CardHeading></div>
          <div className="analytics-sales-hero-main">
            <p id="analytics-sales-title">Nilai penjualan</p>
            <strong className="tabular">{sales.data ? <><span className="analytics-currency-prefix">Rp</span><span className="analytics-currency-amount">{formatCurrencyNumber(sales.data.totals.salesAmount)}</span></> : sales.loading ? <span className="analytics-value-skeleton" aria-label="Memuat nilai penjualan" /> : '—'}</strong>
            <span>{periodLabel(period)}</span>
          </div>
          <div className="analytics-sales-hero-footer"><span>{sales.data ? `${formatNumber(sales.data.totals.branchCount)} sumber cabang aktif` : 'Status valid DONE'}</span><span className="analytics-period-tag">{periodLabel(period)}</span></div>
        </section>

        <AnalyticsBentoStat className="analytics-stat-process" icon={<PackageOpen size={18} />} label="Pengiriman dalam proses" value={shipmentIsUnavailable ? loading ? <span className="analytics-value-skeleton" aria-label="Memuat pengiriman" /> : '—' : formatNumber(totalInProcess)} detail={`Periode ${shipmentPeriodText.toLowerCase()} · nomor kirim belum diterima sepenuhnya`} tone="amber" badge="Dalam proses" />
        <AnalyticsBentoStat className="analytics-stat-received" icon={<PackageCheck size={18} />} label="No. kirim diterima" value={shipmentIsUnavailable ? loading ? <span className="analytics-value-skeleton" aria-label="Memuat penerimaan" /> : '—' : formatNumber(countFor(data, 'received'))} detail={`Periode ${shipmentPeriodText.toLowerCase()} · semua baris sumber berstatus diterima`} tone="teal" />
        <AnalyticsBentoStat className="analytics-stat-weight" icon={<Database size={18} />} label="Total berat penjualan" value={sales.data ? formatWeight(sales.data.totals.totalWeight) : sales.loading ? <span className="analytics-value-skeleton" aria-label="Memuat total berat" /> : '—'} detail="Satuan mengikuti sumber" tone="teal" />
        <AnalyticsInvoiceQuantityStat
          invoiceValue={sales.data ? formatNumber(sales.data.totals.invoiceCount) : sales.loading ? <span className="analytics-value-skeleton" aria-label="Memuat faktur" /> : '—'}
          quantityValue={sales.data ? formatNumber(sales.data.totals.quantity) : sales.loading ? <span className="analytics-value-skeleton" aria-label="Memuat jumlah terjual" /> : '—'}
        />
      </div>
      {error && !data && <LoadError message={error} retry={reload} />}
      <div className="analytics-chart-grid">
        <section className="panel analytics-chart-panel analytics-sales-chart-panel">
          <AnalyticsPanelHeading icon={<BarChart3 size={17} />} title="Performa penjualan cabang" subtitle={`${periodLabel(period)} · status_kembali OPEN · status_valid DONE`} action={<a className="text-link" href="#branch-sales-summary">Lihat semua <ArrowRight size={14} /></a>} />
          {sales.loading && !sales.data ? <LoadingBlock rows={5} /> : sales.error && !sales.data ? <div className="chart-error">Grafik penjualan belum dapat dimuat.</div> : <SalesPerformanceChart rows={salesBranches.slice(0, 5)} />}
        </section>

        <section className="panel analytics-chart-panel analytics-distribution-panel">
          <AnalyticsPanelHeading icon={<PieChart size={17} />} title="Distribusi dalam proses" subtitle={`Komposisi hingga lima tujuan teratas · ${shipmentPeriodText}`} />
          {loading && !data ? <LoadingBlock rows={4} /> : error && !data ? <div className="chart-error">Distribusi pengiriman belum dapat dimuat.</div> : (
            <PendingDistributionChart rows={rows} totalInProcess={totalInProcess} aliasByBranchId={branchAliases} />
          )}
        </section>
      </div>
      <section className="panel sales-table-panel">
        <div id="branch-sales-summary" className="analytics-table-anchor" />
        <PanelTitle title="Ringkasan penjualan per cabang" subtitle={`${sales.data ? formatNumber(sales.data.totals.branchCount) : '—'} sumber aktif · ${periodLabel(period)} · status_kembali OPEN · status_valid DONE`} />
        {sales.loading && !sales.data ? <LoadingBlock rows={5} /> : sales.error && !sales.data ? <LoadError message={sales.error} retry={sales.reload} /> : salesBranches.length ? (
          <div className="table-scroll">
            <table className="data-table sales-branch-table">
              <thead><tr><th scope="col">Cabang</th>{salesSort.header('invoiceCount', 'Faktur')}{salesSort.header('quantity', 'Qty')}{salesSort.header('totalWeight', 'Total berat (gram)')}{salesSort.header('salesAmount', 'Nilai penjualan')}</tr></thead>
              <tbody>{salesBranches.map((branch) => (
                <tr key={branch.branchId}>
                  <td><strong>{branch.alias}</strong><small className="sales-branch-id">{branch.branchId}</small></td>
                  <td className="align-right tabular">{formatNumber(branch.invoiceCount)}</td>
                  <td className="align-right tabular">{formatNumber(branch.quantity)}</td>
                  <td className="align-right tabular">{formatWeight(branch.totalWeight)}</td>
                  <td className="align-right tabular sales-amount-cell">{formatCurrency(branch.salesAmount)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="empty-state"><Database size={23} /><strong>Belum ada sumber penjualan aktif</strong><span>Aktifkan konfigurasi cabang di menu Sumber data untuk menampilkan ringkasan.</span></div>}
      </section>
      <DataNotice kind="info">Penjualan hanya menghitung baris `tt_jual_detail` dengan `status_kembali: OPEN` dan `status_valid: DONE`. Akun cabang dibatasi backend ke sumber yang memiliki `branchId` sesuai akun tersebut.</DataNotice>
      <PeriodWarningDialog period={pendingPeriod} busy={false} subject="penjualan" note="Pencarian ini mengagregasi data dari seluruh database cabang yang aktif dan dapat berjalan lebih lama." onCancel={() => setPendingPeriod(null)} onConfirm={confirmSalesPeriod} />
      </div> : <div>
        <StockVsSalesPanel data={stockVsSales.data} loading={stockVsSales.loading} error={stockVsSales.error} reload={stockVsSales.reload} />
      </div>}
    </>
  )
}

function StockVsSalesPanel({ data, loading, error, reload }: {
  data?: StockVsSalesResult
  loading: boolean
  error: string | null
  reload: () => void
}) {
  const [branchFilter, setBranchFilter] = useState('all')
  const [jenisSearch, setJenisSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<10 | 20>(20)
  const activeBranchFilter = data?.branches.some((branch) => branch.branchId === branchFilter) ? branchFilter : 'all'
  const visibleBranches = useMemo(() => (data?.branches ?? []).filter((branch) => activeBranchFilter === 'all' || branch.branchId === activeBranchFilter), [activeBranchFilter, data])
  const filteredRows = useMemo(() => {
    const search = jenisSearch.trim().toLocaleLowerCase('id-ID')
    return visibleBranches.flatMap((branch) => branch.jenis
      .filter((row) => !search || `${row.kode} ${row.nama}`.toLocaleLowerCase('id-ID').includes(search))
      .map((row) => ({ ...row, branchId: branch.branchId, alias: branch.alias })))
  }, [jenisSearch, visibleBranches])
  const stockSort = useTableSort(undefined, () => setPage(1))
  const orderedRows = stockSort.order(filteredRows, (row, key) => row[key as 'physicalStockWeight' | 'openIncomingWeight' | 'soldWeightMonth' | 'averageSalesWeightPerDay' | 'coverageDays'])
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageRows = orderedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const monthLabel = data ? new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(`${data.period.month}-01T00:00:00+07:00`)) : 'bulan berjalan'
  const insights = visibleBranches.map((branch) => ({
    branch,
    top: branch.analysis.topSellingJenis[0],
    low: branch.analysis.lowCoverageWithSales[0],
    salesLinesWithoutWeight: branch.totals.salesLinesWithoutWeight,
  }))

  if (loading && !data) return <section className="panel stock-sales-loading"><PanelTitle title="Stok vs penjualan" subtitle="Membaca stok, kiriman berjalan, dan penjualan valid bulan ini." /><LoadingBlock rows={7} /></section>
  if (error && !data) return <LoadError message={error} retry={reload} />
  if (!data) return null

  return (
    <div className="stock-sales-workspace">
      {error && <LoadError message={error} retry={reload} />}
      <div className="stock-sales-intro">
        <div><span className="stock-sales-kicker"><Activity size={15} /> POSISI STOK & PERGERAKAN</span><CardHeading>Stok dibanding penjualan</CardHeading><p>Periode {monthLabel} · penjualan dihitung dari awal bulan sampai {formatDate(data.period.dateThrough)}.</p></div>
        <span className="stock-sales-period">{data.period.elapsedDays} hari berjalan</span>
      </div>
      <div className="stock-sales-metrics">
        <div><CardHeading as="h3">Cabang aktif</CardHeading><strong className="tabular">{formatNumber(data.totals.branchCount)}</strong></div>
        <div><CardHeading as="h3">Jenis tercatat</CardHeading><strong className="tabular">{formatNumber(data.totals.jenisCount)}</strong><small>termasuk yang tidak memiliki aktivitas</small></div>
        <div><CardHeading as="h3">Stok fisik</CardHeading><strong className="tabular">{formatWeight(data.totals.physicalStockWeight)} gram</strong><small>Total berat stok cabang</small></div>
        <div><CardHeading as="h3">Kiriman OPEN</CardHeading><strong className="tabular">{formatWeight(data.totals.openIncomingWeight)} gram</strong><small>Berat yang masih dalam perjalanan</small></div>
        <div className="stock-sales-metric-highlight"><CardHeading as="h3">Terjual bulan ini</CardHeading><strong className="tabular">{formatWeight(data.totals.soldWeightMonth)} gram</strong><small>Berat dari transaksi valid</small></div>
      </div>

      <section className="panel stock-sales-insights" aria-labelledby="stock-sales-insights-title">
        <AnalyticsPanelHeading icon={<Activity size={17} />} title="Jenis terlaris dan cakupan stok" subtitle={`Diurutkan berdasarkan gram terjual. Cakupan di bawah ${data.period.safeStockDays} hari stok aman akan ditandai untuk ditinjau.`} />
        {insights.length ? <div className="stock-insight-list" id="stock-sales-insights-title">
          {insights.map(({ branch, top, low, salesLinesWithoutWeight }) => <article className="stock-insight-row" key={branch.branchId}>
            <div className="stock-insight-branch"><strong>{branch.alias}</strong><small>{branch.branchId}</small></div>
            {top ? <div className="stock-insight-best"><span>Paling laku</span><strong>Jenis {top.kode} · {top.nama}</strong><small>{formatWeight(top.soldWeightMonth)} gram terjual · {formatWeight(top.shareOfBranchWeightPercent)}% dari berat penjualan cabang</small></div> : <div className="stock-insight-best"><span>{salesLinesWithoutWeight > 0 ? 'Data berat belum lengkap' : 'Belum ada penjualan tercatat'}</span><strong>{salesLinesWithoutWeight > 0 ? 'Penjualan belum dapat dibandingkan' : 'Belum ada Jenis terjual'}</strong><small>{salesLinesWithoutWeight > 0 ? `${formatNumber(salesLinesWithoutWeight)} baris transaksi tidak memiliki berat positif.` : 'Periksa data transaksi bulan berjalan bila ini tidak sesuai.'}</small></div>}
            {low ? <div className="stock-insight-watch"><span>Perlu ditinjau</span><strong>Jenis {low.kode}</strong><small>{formatWeight(low.availableWeight)} gram tersedia · cakupan ±{formatWeight(low.coverageDays)} hari</small></div> : <div className="stock-insight-watch is-clear"><span>Kondisi cakupan</span><strong>Tidak ada Jenis di bawah {data.period.safeStockDays} hari</strong><small>Dihitung dengan berat terjual rata-rata per hari.</small></div>}
          </article>)}
        </div> : <div className="empty-state"><Database size={22} /><strong>Belum ada sumber cabang aktif</strong><span>Aktifkan sumber database cabang untuk melihat posisi stok.</span></div>}
      </section>

      <section className="panel stock-sales-table-panel" aria-labelledby="stock-sales-table-title">
        <div className="stock-sales-table-heading">
          <div><CardHeading id="stock-sales-table-title">Rincian stok dan penjualan per Jenis</CardHeading><p>Semua Jenis aktif ditampilkan, termasuk nilai nol. OPEN dihitung terpisah dari stok fisik.</p></div>
          <div className="stock-sales-filters">
            <label><span>Cabang</span><select value={activeBranchFilter} onChange={(event) => { setBranchFilter(event.target.value); setPage(1) }}><option value="all">Semua cabang</option>{data.branches.map((branch) => <option key={branch.branchId} value={branch.branchId}>{branch.alias} · {branch.branchId}</option>)}</select></label>
            <label className="stock-sales-search"><span>Cari Jenis</span><div><Search size={15} /><input value={jenisSearch} onChange={(event) => { setJenisSearch(event.target.value); setPage(1) }} placeholder="Kode atau nama Jenis" /></div></label>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table stock-vs-sales-table">
            <thead><tr><th scope="col">Cabang</th><th scope="col">Jenis</th>{stockSort.header('physicalStockWeight', 'Stok fisik (gram)')}{stockSort.header('openIncomingWeight', 'Kiriman OPEN (gram)')}{stockSort.header('soldWeightMonth', 'Terjual bulan ini (gram)')}{stockSort.header('averageSalesWeightPerDay', 'Rata-rata gram / hari')}{stockSort.header('coverageDays', 'Cakupan (hari)')}<th scope="col">Analisis</th></tr></thead>
            <tbody>{pageRows.map((row) => <tr key={`${row.branchId}:${row.kode}`}>
              <td><strong>{row.alias}</strong><small className="sales-branch-id">{row.branchId}</small></td>
              <td><strong>Jenis {row.kode}</strong><small className="sales-branch-id">{row.nama}</small></td>
              <td className="align-right tabular">{formatWeight(row.physicalStockWeight)} gram{row.stockRecordsWithoutWeight > 0 && <small>{formatNumber(row.stockRecordsWithoutWeight)} catatan stok tanpa berat</small>}</td>
              <td className="align-right tabular">{formatWeight(row.openIncomingWeight)} gram{row.openShipmentLinesWithoutWeight > 0 && <small>{formatNumber(row.openShipmentLinesWithoutWeight)} baris OPEN tanpa berat</small>}</td>
              <td className="align-right tabular stock-sales-sold">{formatWeight(row.soldWeightMonth)} gram<small>{formatNumber(row.soldLinesMonth)} baris penjualan{row.salesLinesWithoutWeight > 0 ? ` · ${formatNumber(row.salesLinesWithoutWeight)} tanpa berat` : ''}</small></td>
              <td className="align-right tabular">{formatWeight(row.averageSalesWeightPerDay)} gram</td>
              <td className="align-right tabular">{row.coverageDays === null ? '—' : `${formatWeight(row.coverageDays)} hari`}</td>
              <td><span className={`stock-analysis-badge ${row.status}`}>{stockVsSalesStatusLabel(row.status)}</span><small className="stock-analysis-recommendation">{row.recommendation}</small></td>
            </tr>)}</tbody>
          </table>
        </div>
        {!filteredRows.length && <div className="empty-state stock-sales-empty"><Search size={20} /><strong>Tidak ada Jenis yang cocok</strong><span>Ubah kata pencarian atau pilih cabang lain.</span></div>}
        <div className="stock-sales-pagination">
          <span>Menampilkan {filteredRows.length ? formatNumber((currentPage - 1) * pageSize + 1) : 0}–{formatNumber(Math.min(currentPage * pageSize, filteredRows.length))} dari {formatNumber(filteredRows.length)} baris</span>
          <div><label>Baris per halaman<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as 10 | 20); setPage(1) }}><option value={10}>10</option><option value={20}>20</option></select></label><button className="icon-button" type="button" aria-label="Halaman sebelumnya" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} /></button><span>Halaman {currentPage} / {pageCount}</span><button className="icon-button" type="button" aria-label="Halaman berikutnya" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ChevronRight size={16} /></button></div>
        </div>
      <p className="stock-sales-footnote"><CircleHelp size={14} /> Semua nilai berat ditampilkan dalam gram. Berat penjualan dan kiriman menjumlahkan field berat per baris; berat stok menghitung berat × stock_on_hand. Cakupan menggunakan gram tersedia ÷ rata-rata gram terjual per hari. Baris tanpa berat positif ditandai dan tidak dapat menambah total gram.</p>
      </section>
      <DataNotice kind="info">Status stok aman menggunakan pengaturan {data.period.safeStockDays} hari. Stok fisik menghitung catatan tidak rusak dengan stock_on_hand lebih dari nol. Penjualan memakai status_kembali OPEN dan status_valid DONE, dengan transaksi tukar dikecualikan. Kiriman OPEN Pusat ditampilkan terpisah sebagai berat yang masih dalam perjalanan.</DataNotice>
    </div>
  )
}

function stockVsSalesStatusLabel(status: StockVsSalesResult['branches'][number]['jenis'][number]['status']) {
  const labels: Record<typeof status, string> = {
    'restock-review': 'Di bawah stok aman',
    incoming: 'Menunggu kiriman',
    healthy: 'Stok mengikuti penjualan',
    'no-sales': 'Stok tanpa penjualan',
    'no-activity': 'Belum ada aktivitas',
    'weight-missing': 'Berat penjualan belum lengkap',
  }
  return labels[status]
}

function AnalyticsBentoStat({ icon, label, value, detail, className, badge }: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  detail: string
  tone: 'amber' | 'teal'
  className: string
  badge?: string
}) {
  return (
    <section className={`analytics-bento-stat ${className}`} aria-label={label}>
      
      <div className="bento-stat-content">
        <CardHeading className="bento-stat-label" icon={icon}>{label}</CardHeading>
        <div className="bento-stat-value tabular">{value}</div>
        <small>{detail}</small>
        {badge && <span className="bento-status-badge"><span />{badge}</span>}
      </div>
    </section>
  )
}

function AnalyticsInvoiceQuantityStat({ invoiceValue, quantityValue }: { invoiceValue: React.ReactNode; quantityValue: React.ReactNode }) {
  return (
    <section className="analytics-bento-stat analytics-stat-invoice" aria-label="Faktur penjualan dan qty terjual">
      
      <div className="bento-stat-content">
        <CardHeading className="bento-stat-label" icon={<FileSearch size={19} />}>Faktur penjualan</CardHeading>
        <div className="bento-stat-value tabular">{invoiceValue}</div>
        <div className="invoice-quantity-divider" />
        <div className="invoice-quantity-row"><span>Qty terjual</span><strong className="tabular">{quantityValue}</strong></div>
      </div>
    </section>
  )
}

function AnalyticsPanelHeading({ icon, title, subtitle, action }: { icon: React.ReactNode; title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="analytics-panel-heading">
      <div className="analytics-panel-heading-main">
        <div><CardHeading icon={icon}>{title}</CardHeading><p>{subtitle}</p></div>
      </div>
      {action}
    </div>
  )
}

function SalesPerformanceChart({ rows }: { rows: SalesBranchSummary[] }) {
  const rankedRows = rows.slice(0, 5)
  if (!rankedRows.length) return <div className="empty-state chart-empty"><Database size={21} /><strong>Belum ada data penjualan</strong><span>Penjualan per cabang akan tampil setelah sumber aktif mengembalikan data.</span></div>
  const maximum = Math.max(...rankedRows.map((row) => row.salesAmount), 0)
  return (
    <ol className="sales-chart-list" aria-label="Ranking nilai penjualan per cabang">
      {rankedRows.map((row, index) => {
        const width = maximum > 0 ? (row.salesAmount / maximum) * 100 : 0
        return (
          <li className="sales-chart-row" key={row.branchId}>
            <span className="sales-chart-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="sales-chart-branch" title={`${row.alias} (${row.branchId})`}>{row.alias}</span>
            <span className="sales-chart-track" aria-hidden="true"><span style={{ width: `${width}%` }} /></span>
            <strong className="sales-chart-value tabular" title={formatCurrency(row.salesAmount)}>{formatCurrency(row.salesAmount)}</strong>
          </li>
        )
      })}
    </ol>
  )
}

const distributionColors = ['#2463ff', '#6da8ff', '#07866a', '#f0ad35', '#98a2b3']

function PendingDistributionChart({ rows, totalInProcess, aliasByBranchId }: {
  rows: ShipmentListResult['inProcessByDestination']
  totalInProcess: number
  aliasByBranchId: Map<string, string>
}) {
  const shownTotal = rows.reduce((total, row) => total + row.shipmentCount, 0)
  if (!totalInProcess) return <div className="empty-state chart-empty"><PackageCheck size={21} /><strong>Tidak ada pengiriman dalam proses</strong><span>Tidak ada nomor kirim berstatus dalam proses pada cakupan data ini.</span></div>
  if (!shownTotal) return <div className="empty-state chart-empty"><PackageOpen size={21} /><strong>Tujuan belum tersedia</strong><span>{formatNumber(totalInProcess)} nomor kirim sedang diproses, tetapi belum dapat dikelompokkan ke tujuan pada grafik.</span></div>

  const radius = 42
  const circumference = 2 * Math.PI * radius
  const segments = rows.map((row, index) => {
    const fraction = row.shipmentCount / shownTotal
    const offset = rows.slice(0, index).reduce((total, previous) => total + previous.shipmentCount / shownTotal, 0)
    return { ...row, fraction, offset, color: distributionColors[index % distributionColors.length] }
  })
  const coverage = Math.min((shownTotal / totalInProcess) * 100, 100)

  return (
    <div className="pending-distribution-chart">
      <div className="distribution-visual">
        <svg viewBox="0 0 120 120" role="img" aria-label={`${formatNumber(shownTotal)} nomor kirim pada ${rows.length} tujuan teratas`}>
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#e8edf2" strokeWidth="13" />
          <g transform="rotate(-90 60 60)">
            {segments.map((segment) => <circle key={segment.destination} cx="60" cy="60" r={radius} fill="none" stroke={segment.color} strokeWidth="13" strokeDasharray={`${segment.fraction * circumference} ${circumference}`} strokeDashoffset={-segment.offset * circumference} />)}
          </g>
        </svg>
        <div className="distribution-center"><strong className="tabular">{formatNumber(shownTotal)}</strong><span>nomor kirim</span></div>
      </div>
      <div className="distribution-details">
        <p className="distribution-coverage">{formatNumber(shownTotal)} dari {formatNumber(totalInProcess)} nomor kirim tampil · {formatNumber(Math.round(coverage))}% cakupan</p>
        <ol className="distribution-legend">
          {segments.map((segment) => {
            const alias = aliasByBranchId.get(segment.destination.trim().toUpperCase()) ?? segment.destination
            return <li key={segment.destination}><span className="distribution-legend-dot" style={{ background: segment.color }} /><span className="distribution-legend-name" title={`${alias} (${segment.destination})`}>{alias}</span><strong className="tabular">{formatNumber(segment.shipmentCount)}</strong></li>
          })}
        </ol>
      </div>
    </div>
  )
}

function PeriodWarningDialog({
  period,
  busy,
  subject = 'pengiriman',
  note = 'Periode ini hanya dipakai sebagai nilai default halaman Pengiriman.',
  onCancel,
  onConfirm,
}: {
  period: ShipmentPeriod | null
  busy: boolean
  subject?: string
  note?: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !period) return
    dialog.showModal()
    return () => dialog.close()
  }, [period])

  if (!period) return null
  const title = periodLabel(period)
  const periodText = period === 'all' ? `semua data ${subject}` : `data ${subject} selama satu tahun`

  return (
    <dialog ref={dialogRef} className="confirm-dialog" aria-labelledby="period-warning-title" onCancel={(event) => { event.preventDefault(); onCancel() }}>
      <div className="confirm-dialog-icon warning"><AlertTriangle size={20} /></div>
      <p className="eyebrow">PERIODE PENCARIAN</p>
      <h2 id="period-warning-title">Pencarian {title.toLowerCase()} bisa memakan waktu</h2>
      <p>Memuat {periodText} dapat memerlukan waktu lebih lama dan membebani sumber data. {note}</p>
      <div className="confirm-dialog-actions">
        <button className="button button-secondary" type="button" disabled={busy} onClick={onCancel}>Batal</button>
        <button className="button button-primary" type="button" disabled={busy} onClick={onConfirm}>{busy && <LoaderCircle className="spin" size={15} />}Gunakan {title}</button>
      </div>
    </dialog>
  )
}

const agentDetailOptions = [
  { value: 'low', label: 'Rendah', description: 'Ringkas dan langsung ke tujuan pertanyaan.' },
  { value: 'medium', label: 'Sedang', description: 'Kesimpulan dengan angka dan konteks utama.' },
  { value: 'high', label: 'Tinggi', description: 'Rincian data, perhitungan, dan batasan hasil.' },
] as const

const agentLanguageStyleOptions = [
  { value: 'professional', label: 'Profesional' },
  { value: 'formal', label: 'Formal' },
  { value: 'friendly', label: 'Ramah' },
  { value: 'casual', label: 'Santai' },
] as const

export function SettingsPage() {
  const { request, user } = useAuth()
  const settingsQuery = useUserSettings()
  const isAdmin = user?.role === 'admin'
  const canManageCleaningSettings = user?.role === 'admin' || user?.role === 'pusat'
  const canManageNetworkRestockSettings = canManageCleaningSettings
  const settings = settingsQuery.data ?? null
  const [pendingPeriod, setPendingPeriod] = useState<ShipmentPeriod | null>(null)
  const [periodBusy, setPeriodBusy] = useState(false)
  const [periodError, setPeriodError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [cacheError, setCacheError] = useState<string | null>(null)
  const [ttlInput, setTtlInput] = useState('60')
  const [cacheBusy, setCacheBusy] = useState(false)
  const [cacheConfirmOpen, setCacheConfirmOpen] = useState(false)
  const cacheConfirmRef = useRef<HTMLDialogElement>(null)
  const [cleaningSettings, setCleaningSettings] = useState<CleaningPrioritySettings | null>(null)
  const [cleaningDraft, setCleaningDraft] = useState<CleaningMinimumStock[]>([])
  const [cleaningBusy, setCleaningBusy] = useState(false)
  const [cleaningError, setCleaningError] = useState<string | null>(null)
  const [networkRestockSettings, setNetworkRestockSettings] = useState<NetworkRestockSettings | null>(null)
  const [safeStockDaysInput, setSafeStockDaysInput] = useState('7')
  const [fulfillmentMethodInput, setFulfillmentMethodInput] = useState<DistributionFulfillmentMethod>('branch-first')
  const [networkRestockBusy, setNetworkRestockBusy] = useState(false)
  const [networkRestockError, setNetworkRestockError] = useState<string | null>(null)
  const [networkRestockLoading, setNetworkRestockLoading] = useState(true)
  const [agentResponsePreferences, setAgentResponsePreferences] = useState<AgentResponsePreferences | null>(null)
  const [agentResponseDraft, setAgentResponseDraft] = useState<AgentResponsePreferences | null>(null)
  const [agentResponseLoading, setAgentResponseLoading] = useState(true)
  const [agentResponseBusy, setAgentResponseBusy] = useState(false)
  const [agentResponseError, setAgentResponseError] = useState<string | null>(null)

  useEffect(() => {
    if (cacheConfirmOpen) cacheConfirmRef.current?.showModal()
    else cacheConfirmRef.current?.close()
  }, [cacheConfirmOpen])

  useEffect(() => {
    if (!canManageNetworkRestockSettings) return
    const controller = new AbortController()
    setNetworkRestockLoading(true)
    request<NetworkRestockSettings>('/settings/network-restock', { signal: controller.signal })
      .then((value) => {
        setNetworkRestockSettings(value)
        setSafeStockDaysInput(String(value.safeStockDays))
        setFulfillmentMethodInput(value.fulfillmentMethod)
        setNetworkRestockError(null)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setNetworkRestockError(reason instanceof Error ? reason.message : 'Pengaturan redistribusi tidak dapat dimuat.')
      })
      .finally(() => setNetworkRestockLoading(false))
    return () => controller.abort()
  }, [canManageNetworkRestockSettings, request])

  useEffect(() => {
    if (!canManageCleaningSettings) return
    const controller = new AbortController()
    request<CleaningPrioritySettings>('/settings/cleaning-minimum-stocks', { signal: controller.signal })
      .then((value) => {
        setCleaningSettings(value)
        setCleaningDraft(value.items)
        setCleaningError(null)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setCleaningError(reason instanceof Error ? reason.message : 'Batas minimum stok tidak dapat dimuat.')
      })
    return () => controller.abort()
  }, [canManageCleaningSettings, request])

  useEffect(() => {
    if (!isAdmin) return
    const controller = new AbortController()
    request<CacheStats>('/cache', { signal: controller.signal })
      .then((value) => {
        setCacheStats(value)
        setTtlInput(String(value.ttlSeconds))
        setCacheError(null)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setCacheError(reason instanceof Error ? reason.message : 'Status cache tidak dapat dimuat.')
      })
    return () => controller.abort()
  }, [isAdmin, request])

  useEffect(() => {
    if (!isAdmin) return
    const controller = new AbortController()
    setAgentResponseLoading(true)
    request<AgentResponsePreferences>('/settings/agent-response', { signal: controller.signal })
      .then((value) => {
        setAgentResponsePreferences(value)
        setAgentResponseDraft(value)
        setAgentResponseError(null)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setAgentResponseError(reason instanceof Error ? reason.message : 'Preferensi jawaban Agent tidak dapat dimuat.')
      })
      .finally(() => setAgentResponseLoading(false))
    return () => controller.abort()
  }, [isAdmin, request])

  const savePeriod = async (period: ShipmentPeriod) => {
    setPeriodBusy(true)
    setPeriodError(null)
    try {
      const value = await request<UserSettings>('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ shipmentDefaultPeriod: period }),
      })
      settingsQuery.setData(value)
      setPendingPeriod(null)
      setNotice(`Default pengambilan data diatur ke ${periodLabel(period)}.`)
    } catch (reason) {
      setPeriodError(reason instanceof Error ? reason.message : 'Periode default tidak dapat disimpan.')
    } finally {
      setPeriodBusy(false)
    }
  }

  const choosePeriod = (period: ShipmentPeriod) => {
    setNotice(null)
    if (period === 'one-year' || period === 'all') {
      setPendingPeriod(period)
      return
    }
    void savePeriod(period)
  }

  const saveCacheTtl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const ttlSeconds = Number(ttlInput)
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 5 || ttlSeconds > 3600) {
      setCacheError('Masukkan TTL bilangan bulat antara 5 dan 3600 detik.')
      return
    }
    setCacheBusy(true)
    setCacheError(null)
    try {
      const value = await request<CacheStats>('/cache/settings', {
        method: 'PATCH',
        body: JSON.stringify({ ttlSeconds }),
      })
      invalidateSharedQueries('shipment')
      invalidateSharedQueries('sales-summary:')
      setCacheStats(value)
      setNotice(`TTL cache diubah menjadi ${ttlSeconds} detik dan cache lama dikosongkan.`)
    } catch (reason) {
      setCacheError(reason instanceof Error ? reason.message : 'TTL cache tidak dapat disimpan.')
    } finally {
      setCacheBusy(false)
    }
  }

  const clearCache = async () => {
    setCacheBusy(true)
    setCacheError(null)
    try {
      const value = await request<CacheStats>('/cache/clear', { method: 'POST' })
      invalidateSharedQueries('shipment')
      invalidateSharedQueries('sales-summary:')
      setCacheStats(value)
      setNotice('Cache pengiriman berhasil dikosongkan.')
      setCacheConfirmOpen(false)
    } catch (reason) {
      setCacheError(reason instanceof Error ? reason.message : 'Cache tidak dapat dikosongkan.')
    } finally {
      setCacheBusy(false)
    }
  }

  const addCleaningMinimum = () => {
    const used = new Set(cleaningDraft.map((item) => item.kodeDept))
    const next = cleaningSettings?.availableJenis.find((item) => !used.has(item.kode))
    if (!next) return
    setCleaningDraft((current) => [...current, { kodeDept: next.kode, namaDept: next.nama, minimumStock: 1, minimumWeight: 0 }])
  }

  const updateCleaningItem = (index: number, patch: Partial<CleaningMinimumStock>) => {
    setCleaningDraft((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      const updated = { ...item, ...patch }
      if (patch.kodeDept) {
        updated.namaDept = cleaningSettings?.availableJenis.find((option) => option.kode === patch.kodeDept)?.nama ?? patch.kodeDept
      }
      return updated
    }))
  }

  const saveCleaningMinimums = async () => {
    setCleaningBusy(true)
    setCleaningError(null)
    try {
      const value = await request<CleaningPrioritySettings>('/settings/cleaning-minimum-stocks', {
        method: 'PATCH',
        body: JSON.stringify({ items: cleaningDraft.map(({ kodeDept, minimumStock, minimumWeight }) => ({ kodeDept, minimumStock, minimumWeight })) }),
      })
      setCleaningSettings(value)
      setCleaningDraft(value.items)
      setNotice('Batas stok minimum Pusat per Jenis berhasil disimpan.')
    } catch (reason) {
      setCleaningError(reason instanceof Error ? reason.message : 'Batas stok minimum tidak dapat disimpan.')
    } finally {
      setCleaningBusy(false)
    }
  }

  const saveNetworkRestockSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const safeStockDays = Number(safeStockDaysInput)
    if (!Number.isInteger(safeStockDays) || safeStockDays < 1 || safeStockDays > 365) {
      setNetworkRestockError('Masukkan bilangan bulat antara 1 dan 365 hari.')
      return
    }
    setNetworkRestockBusy(true)
    setNetworkRestockError(null)
    try {
      const value = await request<NetworkRestockSettings>('/settings/network-restock', {
        method: 'PATCH',
        body: JSON.stringify({ safeStockDays, fulfillmentMethod: fulfillmentMethodInput }),
      })
      setNetworkRestockSettings(value)
      setSafeStockDaysInput(String(value.safeStockDays))
      setFulfillmentMethodInput(value.fulfillmentMethod)
      setNotice(`Pengaturan redistribusi tersimpan. Buffer ${value.safeStockDays} hari, metode ${value.fulfillmentMethod === 'even' ? 'dibagi merata' : 'penuhi per cabang'}.`)
    } catch (reason) {
      setNetworkRestockError(reason instanceof Error ? reason.message : 'Pengaturan redistribusi tidak dapat disimpan.')
    } finally {
      setNetworkRestockBusy(false)
    }
  }

  const saveAgentResponsePreferences = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!agentResponseDraft) return
    setAgentResponseBusy(true)
    setAgentResponseError(null)
    try {
      const value = await request<AgentResponsePreferences>('/settings/agent-response', {
        method: 'PATCH',
        body: JSON.stringify({ detailLevel: agentResponseDraft.detailLevel, languageStyle: agentResponseDraft.languageStyle }),
      })
      setAgentResponsePreferences(value)
      setAgentResponseDraft(value)
      setNotice('Preferensi jawaban Agent berhasil disimpan dan berlaku untuk semua pengguna.')
    } catch (reason) {
      setAgentResponseError(reason instanceof Error ? reason.message : 'Preferensi jawaban Agent tidak dapat disimpan.')
    } finally {
      setAgentResponseBusy(false)
    }
  }

  return (
    <>
      <PageHeading eyebrow="PREFERENSI & PERFORMA" title="Pengaturan" description="Atur rentang data, performa server, dan cara Agent menyajikan jawaban." />
      {notice && <div className="settings-feedback success" role="status"><Check size={16} />{notice}</div>}
      {(periodError ?? settingsQuery.error) && <p className="settings-feedback error" role="alert">{periodError ?? settingsQuery.error}</p>}

      <div className={`settings-layout${isAdmin ? ' has-cache' : ''}${isAdmin || canManageCleaningSettings ? ' has-secondary-column' : ''}${canManageNetworkRestockSettings ? ' has-network-restock' : ''}`}>
        <div className="settings-column">
        <section className="panel settings-card" aria-labelledby="shipment-period-title">
          <div className="settings-card-heading">
            <div><p className="eyebrow">PENGIRIMAN</p><CardHeading id="shipment-period-title">Default pengambilan data</CardHeading><p>Periode ini digunakan pada halaman Pengiriman, Dashboard, dan ringkasan distribusi di Analitik Cabang.</p></div>
          </div>
          <div className="period-options" role="group" aria-label="Periode default pengiriman">
            {shipmentPeriods.map((option) => {
              const selected = settings?.shipmentDefaultPeriod === option.value
              return <button
                key={option.value}
                className={`period-option${selected ? ' is-selected' : ''}`}
                type="button"
                aria-pressed={selected}
                disabled={periodBusy || !settings}
                onClick={() => choosePeriod(option.value)}
              >
                <span className="period-radio" aria-hidden="true" />
                <span className="period-option-copy"><strong>{option.label}</strong><small>{option.description}</small></span>
                {(option.value === 'one-year' || option.value === 'all') && <span className="period-warning-tag">Perlu konfirmasi</span>}
              </button>
            })}
          </div>
          <p className="settings-footnote"><ShieldCheck size={14} /> Pengaturan ini tersimpan pada akun dan berlaku di perangkat lain setelah masuk.</p>
        </section>

        {canManageNetworkRestockSettings && <section className="panel settings-card network-restock-settings-card" aria-labelledby="network-restock-settings-title">
          <div className="settings-card-heading">
            <div><p className="eyebrow">AGENT AI · DISTRIBUSI</p><CardHeading id="network-restock-settings-title">Pengaturan redistribusi stok</CardHeading><p>Atur cadangan stok donor dan cara Agent membagi stok ke cabang yang kekurangan.</p></div>
          </div>
          {networkRestockError && <p className="settings-feedback error" role="alert">{networkRestockError}</p>}
          {networkRestockLoading ? <LoadingBlock rows={1} /> : networkRestockSettings && <form className="safe-stock-controls" onSubmit={(event) => void saveNetworkRestockSettings(event)}>
            <label className="form-field"><span>Hari stok aman</span><div className="safe-stock-input-wrap"><input type="number" min={1} max={365} step={1} inputMode="numeric" value={safeStockDaysInput} disabled={networkRestockBusy} onChange={(event) => setSafeStockDaysInput(event.target.value)} /><span>hari</span></div></label>
            <fieldset className="fulfillment-method-fieldset" disabled={networkRestockBusy}>
              <legend>Metode pemenuhan stok</legend>
              <div className="fulfillment-method-options">
                <label className={`fulfillment-method-option${fulfillmentMethodInput === 'branch-first' ? ' is-selected' : ''}`}>
                  <input type="radio" name="fulfillment-method" value="branch-first" checked={fulfillmentMethodInput === 'branch-first'} onChange={() => setFulfillmentMethodInput('branch-first')} />
                  <span><strong>Penuhi per cabang</strong><small>Selesaikan cabang prioritas satu per satu.</small></span>
                </label>
                <label className={`fulfillment-method-option${fulfillmentMethodInput === 'even' ? ' is-selected' : ''}`}>
                  <input type="radio" name="fulfillment-method" value="even" checked={fulfillmentMethodInput === 'even'} onChange={() => setFulfillmentMethodInput('even')} />
                  <span><strong>Dibagi merata</strong><small>Bagikan stok seimbang ke cabang yang kekurangan.</small></span>
                </label>
              </div>
            </fieldset>
            <button className="button button-primary" type="submit" disabled={networkRestockBusy || (safeStockDaysInput === String(networkRestockSettings.safeStockDays) && fulfillmentMethodInput === networkRestockSettings.fulfillmentMethod)}>{networkRestockBusy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Simpan pengaturan</button>
          </form>}
          <p className="settings-footnote"><ShieldCheck size={14} /> Metode ini otomatis dipakai pada rekomendasi distribusi; Agent tidak akan menanyakannya di chat. Default metode adalah penuhi per cabang. Hari stok aman digunakan pada analisis stok vs penjualan; proyeksi restock tetap memakai target 7 hari. Perubahan mengosongkan cache analisis terkait.</p>
        </section>}

        </div>
        {(isAdmin || canManageCleaningSettings) && <div className="settings-column">
        {isAdmin && <section className="panel settings-card cache-card" aria-labelledby="cache-management-title">
          <div className="settings-card-heading">
            <div><p className="eyebrow">KINERJA SERVER</p><CardHeading id="cache-management-title">Cache pengiriman</CardHeading><p>Respons daftar dan detail digunakan ulang selama TTL untuk mengurangi agregasi berulang.</p></div>
          </div>
          {cacheError && <p className="settings-feedback error" role="alert">{cacheError}</p>}
          <div className="cache-stats-grid" aria-live="polite">
            <div><span>Entri aktif</span><strong>{cacheStats ? `${formatNumber(cacheStats.entryCount)} / ${formatNumber(cacheStats.maxEntries)}` : '—'}</strong></div>
            <div><span>Cache hit</span><strong>{cacheStats ? `${(cacheStats.hitRate * 100).toFixed(1)}%` : '—'}</strong></div>
            <div><span>Permintaan hit</span><strong>{cacheStats ? formatNumber(cacheStats.hits) : '—'}</strong></div>
            <div><span>Perkiraan ukuran</span><strong>{cacheStats ? formatBytes(cacheStats.approxBytes) : '—'}</strong></div>
          </div>
          <div className="cache-controls">
            <form className="cache-ttl-form" onSubmit={(event) => void saveCacheTtl(event)}>
              <label className="form-field"><span>TTL cache (detik)</span><input type="number" min={5} max={3600} step={1} value={ttlInput} onChange={(event) => setTtlInput(event.target.value)} /></label>
              <button className="button button-secondary" type="submit" disabled={cacheBusy}><Check size={15} /> Simpan TTL</button>
            </form>
            <button className="button button-danger" type="button" disabled={cacheBusy || !cacheStats?.entryCount} onClick={() => setCacheConfirmOpen(true)}><Trash2 size={15} /> Kosongkan cache</button>
          </div>
          <p className="settings-footnote">Cache respons berada di memori proses API. TTL tersimpan di MongoDB sistem; batas {cacheStats ? `${formatNumber(cacheStats.maxEntries)} entri / ${formatBytes(cacheStats.maxBytes)}` : '—'} · permintaan bersamaan digabung.</p>
        </section>}

        {isAdmin && <section className="panel settings-card agent-answer-settings-card" aria-labelledby="agent-answer-settings-title">
          <div className="settings-card-heading">
            <div><p className="eyebrow">AGENT AI · PENYAJIAN</p><CardHeading id="agent-answer-settings-title" icon={<MessageCircle size={19} strokeWidth={1.8} />}>Preferensi jawaban Agent</CardHeading><p>Atur tingkat rincian dan gaya bahasa untuk jawaban baru di semua akun.</p></div>
          </div>
          {agentResponseError && <p className="settings-feedback error" role="alert">{agentResponseError}</p>}
          {agentResponseLoading ? <LoadingBlock rows={2} /> : !agentResponseDraft ? <p className="settings-footnote">Preferensi belum dapat dimuat. Periksa koneksi lalu muat ulang halaman.</p> : <form className="agent-answer-settings-form" onSubmit={(event) => void saveAgentResponsePreferences(event)}>
            <fieldset className="agent-detail-fieldset" disabled={agentResponseBusy}>
              <legend>Detail jawaban</legend>
              <p>Semakin tinggi tingkatnya, semakin rinci penjelasan Agent.</p>
              <div className="agent-detail-options">
                {agentDetailOptions.map((option) => <button key={option.value} type="button" className={`agent-detail-option${agentResponseDraft.detailLevel === option.value ? ' is-selected' : ''}`} aria-pressed={agentResponseDraft.detailLevel === option.value} onClick={() => setAgentResponseDraft((current) => current ? { ...current, detailLevel: option.value } : current)}>
                  <strong>{option.label}</strong><span>{option.description}</span>
                </button>)}
              </div>
            </fieldset>
            <label className="form-field agent-language-style-field"><span>Gaya bahasa</span><select value={agentResponseDraft.languageStyle} disabled={agentResponseBusy} onChange={(event) => setAgentResponseDraft((current) => current ? { ...current, languageStyle: event.target.value as AgentResponsePreferences['languageStyle'] } : current)}>
              {agentLanguageStyleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select></label>
            <div className="agent-answer-settings-actions"><p className="settings-footnote"><ShieldCheck size={14} />Pengaturan ini mengubah cara jawaban dijelaskan; analisis, angka, satuan, akses data, dan fungsi Agent tetap mengikuti aturan sistem.</p><button className="button button-primary" type="submit" disabled={agentResponseBusy || (agentResponseDraft.detailLevel === agentResponsePreferences?.detailLevel && agentResponseDraft.languageStyle === agentResponsePreferences?.languageStyle)}>{agentResponseBusy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Simpan preferensi</button></div>
          </form>}
        </section>}

        {canManageCleaningSettings && <section className="panel settings-card cleaning-settings-card" aria-labelledby="cleaning-minimum-title">
          <div className="settings-card-heading">
            <div><p className="eyebrow">AGENT AI · BUYBACK</p><CardHeading id="cleaning-minimum-title">Prioritas cuci hasil buyback</CardHeading><p>Tetapkan safety stock Pusat per Jenis. Agent juga menghitung kekurangan proyeksi penjualan tiap Cabang sampai akhir bulan sebelum mengalokasikan buyback untuk dicuci.</p></div>
          </div>
          {cleaningError && <p className="settings-feedback error" role="alert">{cleaningError}</p>}
          {!cleaningSettings ? <LoadingBlock rows={2} /> : <>
            {!cleaningSettings.centralSourceAvailable && <div className="cleaning-settings-notice" role="status"><AlertTriangle size={15} />Aktifkan satu sumber database bertipe Pusat di menu Sumber data untuk memuat daftar Jenis dan menjalankan analisis.</div>}
            <div className="cleaning-settings-toolbar"><div><strong>Batas stok minimum Pusat</strong><span>{cleaningDraft.length} Jenis diatur · pencucian diprioritaskan jika batas unit atau berat belum tercapai</span></div><button className="button button-secondary button-compact" type="button" onClick={addCleaningMinimum} disabled={cleaningBusy || !cleaningSettings.availableJenis.length || cleaningDraft.length >= cleaningSettings.availableJenis.length}><Plus size={14} /> Tambah Jenis</button></div>
            {cleaningDraft.length ? <div className="cleaning-threshold-list">
              {cleaningDraft.map((item, index) => {
                const used = new Set(cleaningDraft.filter((_, optionIndex) => optionIndex !== index).map((option) => option.kodeDept))
                return <div className="cleaning-threshold-row" key={`${item.kodeDept}-${index}`}>
                  <label className="form-field"><span>Jenis</span><select value={item.kodeDept} disabled={cleaningBusy} onChange={(event) => updateCleaningItem(index, { kodeDept: event.target.value })}>
                    {!cleaningSettings.availableJenis.some((option) => option.kode === item.kodeDept) && <option value={item.kodeDept}>{item.kodeDept} · tidak ada di tm_dept</option>}
                    {cleaningSettings.availableJenis.filter((option) => !used.has(option.kode) || option.kode === item.kodeDept).map((option) => <option key={option.kode} value={option.kode}>{option.kode} · {option.nama}</option>)}
                  </select></label>
                  <label className="form-field"><span>Minimum unit di Pusat</span><input type="number" min={1} max={1000000} step={1} inputMode="numeric" value={item.minimumStock} disabled={cleaningBusy} onChange={(event) => updateCleaningItem(index, { minimumStock: Number(event.target.value) })} /></label>
                  <label className="form-field"><span>Minimum berat Pusat (gram)</span><input type="number" min={0} max={1000000} step={0.001} inputMode="decimal" value={item.minimumWeight} disabled={cleaningBusy} onChange={(event) => updateCleaningItem(index, { minimumWeight: Number(event.target.value) })} /></label>
                  <button className="button button-danger cleaning-remove-button" type="button" aria-label={`Hapus batas Jenis ${item.kodeDept}`} disabled={cleaningBusy} onClick={() => setCleaningDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button>
                </div>
              })}
            </div> : <div className="cleaning-settings-empty"><strong>Belum ada batas minimum</strong><span>Tambahkan Jenis untuk menentukan kapan Pusat perlu menerima barang buyback yang dicuci.</span></div>}
            <div className="cleaning-settings-actions"><p className="settings-footnote"><ShieldCheck size={14} />Stok Pusat dihitung dari berat × stock_on_hand. Minimum berat 0 menonaktifkan ambang berat; jika hanya batas unit yang diisi, Agent memperkirakan gram dari rata-rata berat. Proyeksi Cabang membandingkan penjualan bulan berjalan dengan bulan yang sama tahun lalu, lalu mengurangi stok fisik dan kiriman OPEN dari Pusat; kiriman CLOS tidak ditambahkan lagi.</p><button className="button button-primary" type="button" onClick={() => void saveCleaningMinimums()} disabled={cleaningBusy || !cleaningSettings.centralSourceAvailable}>{cleaningBusy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Simpan batas minimum</button></div>
          </>}
        </section>}
        </div>}
      </div>
      <PeriodWarningDialog period={pendingPeriod} busy={periodBusy} onCancel={() => setPendingPeriod(null)} onConfirm={() => { if (pendingPeriod) void savePeriod(pendingPeriod) }} />
      <dialog ref={cacheConfirmRef} className="confirm-dialog" aria-labelledby="cache-confirm-title" onCancel={(event) => { event.preventDefault(); if (!cacheBusy) setCacheConfirmOpen(false) }}>
        <div className="confirm-dialog-icon"><Database size={20} /></div>
        <h2 id="cache-confirm-title">Kosongkan cache pengiriman?</h2>
        <p>Permintaan berikutnya akan mengambil ulang data dari sumber dan dapat membutuhkan waktu lebih lama. Data pengiriman tetap tersimpan.</p>
        {cacheError && <p role="alert">{cacheError}</p>}
        <div className="confirm-dialog-actions"><button className="button button-secondary" type="button" disabled={cacheBusy} onClick={() => setCacheConfirmOpen(false)}>Batal</button><button className="button button-danger" type="button" disabled={cacheBusy} onClick={() => void clearCache()}>{cacheBusy && <LoaderCircle size={15} className="spin" />}Kosongkan cache</button></div>
      </dialog>
    </>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type AgentChatAttachmentView = AgentChatAttachment & {
  localPreviewUrl?: string
  isUploading?: boolean
}

function AgentChatAttachmentItem({
  attachment,
  sessionId,
  onRemove,
  disabled = false,
}: {
  attachment: AgentChatAttachmentView
  sessionId: string
  onRemove?: () => void
  disabled?: boolean
}) {
  const { request } = useAuth()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFailed, setPreviewFailed] = useState(false)
  const isImage = attachment.mime.startsWith('image/')
  const attachmentPath = `/agent/sessions/${sessionId}/attachments/${attachment.id}`
  const visiblePreviewUrl = attachment.localPreviewUrl ?? previewUrl

  useEffect(() => {
    if (attachment.localPreviewUrl || attachment.isUploading) return
    let active = true
    let objectUrl: string | null = null
    request<Blob>(attachmentPath, { responseType: 'blob' })
      .then(blob => {
        objectUrl = URL.createObjectURL(blob)
        if (active) setPreviewUrl(objectUrl)
        else URL.revokeObjectURL(objectUrl)
      })
      .catch(() => { if (active) setPreviewFailed(true) })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment.isUploading, attachment.localPreviewUrl, attachmentPath, request])

  return <div className={`agent-attachment-item${isImage ? ' is-image' : ' is-pdf'}`}>
    {isImage ? <a className="agent-attachment-image-link" href={visiblePreviewUrl ?? undefined} target="_blank" rel="noreferrer" aria-label={`Lihat gambar ${attachment.filename}`}>
      {visiblePreviewUrl ? <img src={visiblePreviewUrl} alt={attachment.filename} decoding="async" /> : <span className="agent-attachment-placeholder"><ImageIcon size={17} /></span>}
    </a> : <a className="agent-attachment-file-link" href={previewUrl ?? undefined} target="_blank" rel="noreferrer" aria-label={`Buka PDF ${attachment.filename}`}>
      <span className="agent-attachment-file-icon"><FileText size={17} /></span>
      <span className="agent-attachment-file-copy"><strong>{attachment.filename}</strong><small>{previewFailed ? 'Pratinjau tidak tersedia' : `PDF · ${formatBytes(attachment.size)}`}</small></span>
    </a>}
    {attachment.isUploading && <span className="agent-attachment-uploading">Mengunggah</span>}
    {isImage && <span className="agent-attachment-filename" title={attachment.filename}>{attachment.filename}</span>}
    {onRemove && <button className="agent-attachment-remove" type="button" disabled={disabled} aria-label={`Hapus lampiran ${attachment.filename}`} onClick={onRemove}><X size={13} /></button>}
  </div>
}

type PendingAgentScopeClarification = {
  prompt: string
  displayPrompt?: string
  needsDate: boolean
  needsSource: boolean
  optimisticMessage?: boolean
  banking?: BankScopeResolved
}

function bankingFollowUpPrompt(value: string, messages: AgentChatMessage[], sources: AgentStatus['sources']) {
  if (isBankingQuery(value) || !/\b(?:kalau|kalo|klo|terus|untuk|sekarang|yang)\b/i.test(value)) return null
  const mentionedSources = sources.filter(source => mentionsAgentSource(value, source))
  if (mentionedSources.length !== 1) return null
  const previousBankingPrompt = [...messages].reverse().find(message => message.role === 'user' && isBankingQuery(message.content))?.content
  if (!previousBankingPrompt) return null

  let prompt = previousBankingPrompt
  const labels = sources.flatMap(agentSourceLabels).sort((left, right) => right.length - left.length)
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    prompt = prompt.replace(new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'gi'), '$1 ')
  }
  const source = mentionedSources[0]
  return `${prompt.replace(/\s+/g, ' ').trim()} Toko yang diminta: ${source.alias} (${source.branchId}).`
}

function formatAgentNaturalDate(value: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(`${value}T00:00:00+07:00`))
}

function joinAgentNaturalLabels(labels: string[]) {
  if (labels.length <= 1) return labels[0] ?? 'semua toko yang tersedia'
  if (labels.length === 2) return `${labels[0]} dan ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, dan ${labels[labels.length - 1]}`
}

export function AgentPage() {
  const { user, request } = useAuth()
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [messages, setMessages] = useState<AgentChatMessage[]>([])
  const [sessions, setSessions] = useState<AgentChatSessionSummary[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [sessionActionBusy, setSessionActionBusy] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [pendingSessionDelete, setPendingSessionDelete] = useState<AgentChatSessionSummary | null>(null)
  const [sessionDeleteError, setSessionDeleteError] = useState<string | null>(null)
  const [historyQuery, setHistoryQuery] = useState('')
  const [historySearchQuery, setHistorySearchQuery] = useState('')
  const [historySearchResults, setHistorySearchResults] = useState<AgentHistorySearchResult[]>([])
  const [historySearchWarning, setHistorySearchWarning] = useState<string | null>(null)
  const [historySearchError, setHistorySearchError] = useState<string | null>(null)
  const [historySearchBusy, setHistorySearchBusy] = useState(false)
  const [pendingMessageFocusId, setPendingMessageFocusId] = useState<string | null>(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<AgentChatAttachmentView[]>([])
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const attachmentPreviewUrlsRef = useRef(new Set<string>())
  const previousAttachmentSessionRef = useRef<string | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const questionInputRef = useRef<HTMLTextAreaElement>(null)
  const [contextOpen, setContextOpen] = useState(false)
  const agentPageRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => {
    for (const url of attachmentPreviewUrlsRef.current) URL.revokeObjectURL(url)
    attachmentPreviewUrlsRef.current.clear()
  }, [])

  useEffect(() => {
    const previousSessionId = previousAttachmentSessionRef.current
    if (previousSessionId && previousSessionId !== activeSessionId) {
      for (const url of attachmentPreviewUrlsRef.current) URL.revokeObjectURL(url)
      attachmentPreviewUrlsRef.current.clear()
    }
    previousAttachmentSessionRef.current = activeSessionId
  }, [activeSessionId])

  useEffect(() => {
    const viewport = window.visualViewport
    const updateViewport = () => {
      agentPageRef.current?.style.setProperty('--agent-visible-height', `${viewport?.height ?? window.innerHeight}px`)
      agentPageRef.current?.style.setProperty('--agent-viewport-top', `${viewport?.offsetTop ?? 0}px`)
    }
    updateViewport()
    viewport?.addEventListener('resize', updateViewport)
    viewport?.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', updateViewport)
    return () => {
      viewport?.removeEventListener('resize', updateViewport)
      viewport?.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', updateViewport)
    }
  }, [])
  const [chatBusy, setBusy] = useState(false)
  const [bankingScopeBusy, setBankingScopeBusy] = useState(false)
  const busy = chatBusy || bankingScopeBusy
  const [chatProgress, setChatProgress] = useState<AgentChatProgress | null>(null)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [unreadAnswerCount, setUnreadAnswerCount] = useState(0)
  const [sendError, setSendError] = useState<string | null>(null)
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null)
  const [lastFailedRequestId, setLastFailedRequestId] = useState<string | null>(null)
  const [lastFailedBanking, setLastFailedBanking] = useState<BankSelection | undefined>(undefined)
  const [pendingScopeClarification, setPendingScopeClarification] = useState<PendingAgentScopeClarification | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const followTranscriptRef = useRef(true)
  const previousMessageKeysRef = useRef<string[]>([])
  const transcriptSessionRef = useRef<string | null>(null)
  const initializedSessionsForUser = useRef<string | null>(null)
  const reduceMotion = useReducedMotion()

  const scrollTranscriptToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const transcript = transcriptRef.current
    if (!transcript) {
      chatEndRef.current?.scrollIntoView({ behavior, block: 'end' })
      return
    }
    followTranscriptRef.current = true
    setUnreadAnswerCount(0)
    setShowScrollToBottom(false)
    transcript.scrollTo({ top: transcript.scrollHeight, behavior })
  }, [])

  const initializeSessions = useCallback(async () => {
    if (!user?.id) return
    setSessionsLoading(true)
    setSessionError(null)
    try {
      const result = await request<{ items: AgentChatSessionSummary[] }>('/agent/sessions')
      setSessions(result.items)
      const savedSessionId = readActiveAgentSession(user.id)
      const selected = result.items.find((session) => session.id === savedSessionId) ?? result.items[0]
      if (selected) {
        const detail = await request<AgentChatSession>(`/agent/sessions/${selected.id}`)
        setSessions((current) => current.map((session) => session.id === detail.id ? sessionSummaryFromDetail(detail) : session))
        setActiveSessionId(detail.id)
        setMessages(detail.messages)
        setPendingScopeClarification(null)
        setPendingAttachments(detail.pendingAttachments ?? [])
        setAttachmentError(null)
        saveActiveAgentSession(user.id, detail.id)
      } else {
        const created = await request<AgentChatSessionSummary>('/agent/sessions', { method: 'POST' })
        setSessions([created])
        setActiveSessionId(created.id)
        setMessages([])
        setPendingScopeClarification(null)
        setPendingAttachments([])
        setAttachmentError(null)
        saveActiveAgentSession(user.id, created.id)
      }
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Riwayat percakapan tidak dapat dimuat.')
    } finally {
      setSessionsLoading(false)
    }
  }, [request, user?.id])

  const loadStatus = useCallback(() => {
    const controller = new AbortController()
    request<AgentStatus>('/agent/status', { signal: controller.signal })
      .then(setStatus)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setStatusError(error instanceof Error ? error.message : 'Status Agent AI tidak dapat dimuat.')
      })
    return () => controller.abort()
  }, [request])

  useEffect(() => loadStatus(), [loadStatus])
  useEffect(() => {
    if (!user?.id) {
      initializedSessionsForUser.current = null
      setSessionsLoading(false)
      setSessions([])
      setActiveSessionId(null)
      setMessages([])
      setPendingScopeClarification(null)
      setPendingAttachments([])
      setAttachmentError(null)
      return
    }
    if (initializedSessionsForUser.current === user.id) return
    initializedSessionsForUser.current = user.id
    setSessions([])
    setActiveSessionId(null)
    setMessages([])
    setPendingScopeClarification(null)
    void initializeSessions()
  }, [initializeSessions, user?.id])
  useEffect(() => {
    const currentMessageKeys = messages.map((message, index) => message.id ?? message.requestId ?? `${message.role}:${index}:${message.content}`)
    if (transcriptSessionRef.current !== activeSessionId) {
      transcriptSessionRef.current = activeSessionId
      previousMessageKeysRef.current = currentMessageKeys
      followTranscriptRef.current = true
      setUnreadAnswerCount(0)
      setShowScrollToBottom(false)
      window.requestAnimationFrame(() => scrollTranscriptToBottom('auto'))
      return
    }

    const previousMessageKeys = previousMessageKeysRef.current
    const newAnswerCount = messages.filter((message, index) => message.role === 'assistant' && !previousMessageKeys.includes(currentMessageKeys[index])).length
    previousMessageKeysRef.current = currentMessageKeys
    if (newAnswerCount && !followTranscriptRef.current) {
      setUnreadAnswerCount((current) => current + newAnswerCount)
    }
    if (followTranscriptRef.current) {
      scrollTranscriptToBottom(reduceMotion ? 'auto' : 'smooth')
    } else {
      setShowScrollToBottom(true)
    }
  }, [activeSessionId, messages, busy, chatProgress, reduceMotion, scrollTranscriptToBottom])

  const handleTranscriptScroll = () => {
    const transcript = transcriptRef.current
    if (!transcript) return
    const atBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight <= 36
    followTranscriptRef.current = atBottom
    setShowScrollToBottom(!atBottom)
    if (atBottom) setUnreadAnswerCount(0)
  }
  useEffect(() => {
    if (!pendingMessageFocusId || !messages.some(message => message.id === pendingMessageFocusId)) return
    const messageId = pendingMessageFocusId
    setPendingMessageFocusId(null)
    setHighlightedMessageId(messageId)
    const frame = window.requestAnimationFrame(() => document.getElementById(`agent-message-${messageId}`)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }))
    const timeout = window.setTimeout(() => setHighlightedMessageId(current => current === messageId ? null : current), 3_500)
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timeout) }
  }, [messages, pendingMessageFocusId, reduceMotion])

  const openSession = async (sessionId: string) => {
    if (busy || sessionActionBusy || attachmentBusy || pendingAttachments.length || sessionId === activeSessionId || !user?.id) return
    setSessionActionBusy(true)
    setSessionError(null)
    setMessages([])
    try {
      const detail = await request<AgentChatSession>(`/agent/sessions/${sessionId}`)
      setSessions((current) => current.map((session) => session.id === detail.id ? sessionSummaryFromDetail(detail) : session))
      setActiveSessionId(detail.id)
      setMessages(detail.messages)
      setPendingScopeClarification(null)
      setPendingAttachments(detail.pendingAttachments ?? [])
      setAttachmentError(null)
      setSendError(null)
      saveActiveAgentSession(user.id, detail.id)
    } catch (error) {
      setPendingMessageFocusId(null)
      setSessionError(error instanceof Error ? error.message : 'Room percakapan tidak dapat dibuka.')
    } finally {
      setSessionActionBusy(false)
    }
  }

  const uploadAgentAttachments = async (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : []
    const sessionId = activeSessionId
    if (!files.length || !sessionId || attachmentBusy || busy) return
    const maxFiles = status?.attachmentLimits?.maxFiles ?? 3
    const maxFileBytes = (status?.attachmentLimits?.maxFileMb ?? 20) * 1024 * 1024
    const maxImageBytes = (status?.attachmentLimits?.maxImageMb ?? 10) * 1024 * 1024
    if (pendingAttachments.length + files.length > maxFiles) {
      setAttachmentError(`Maksimal ${maxFiles} lampiran dalam satu pertanyaan.`)
      return
    }
    if (files.some(file => file.size > maxFileBytes)) {
      setAttachmentError(`Ukuran setiap file maksimal ${formatBytes(maxFileBytes)}.`)
      return
    }
    const existingImageBytes = pendingAttachments.filter(file => file.mime.startsWith('image/')).reduce((sum, file) => sum + file.size, 0)
    const newImageBytes = files.filter(file => file.type.startsWith('image/')).reduce((sum, file) => sum + file.size, 0)
    if (existingImageBytes + newImageBytes > maxImageBytes) {
      setAttachmentError(`Total ukuran gambar maksimal ${formatBytes(maxImageBytes)} dalam satu pertanyaan.`)
      return
    }

    const stagedFiles = files.map((file, index) => {
      const localPreviewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
      if (localPreviewUrl) attachmentPreviewUrlsRef.current.add(localPreviewUrl)
      return {
        file,
        attachment: {
          id: `upload-${Date.now()}-${index}-${file.name}`,
          filename: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          createdAt: new Date().toISOString(),
          ...(localPreviewUrl ? { localPreviewUrl } : {}),
          isUploading: true,
        } satisfies AgentChatAttachmentView,
      }
    })

    setAttachmentBusy(true)
    setAttachmentError(null)
    setPendingScopeClarification(null)
    setPendingAttachments(current => [...current, ...stagedFiles.map(item => item.attachment)])
    const uploadedIds = new Set<string>()
    try {
      for (const staged of stagedFiles) {
        const form = new FormData()
        form.append('file', staged.file)
        const attachment = await request<AgentChatAttachment>(`/agent/sessions/${sessionId}/attachments`, { method: 'POST', body: form })
        uploadedIds.add(staged.attachment.id)
        setPendingAttachments(current => current.map(item => item.id === staged.attachment.id
          ? { ...attachment, ...(staged.attachment.localPreviewUrl ? { localPreviewUrl: staged.attachment.localPreviewUrl } : {}), isUploading: false }
          : item))
      }
    } catch (error) {
      const unsuccessful = stagedFiles.filter(item => !uploadedIds.has(item.attachment.id))
      const unsuccessfulIds = new Set(unsuccessful.map(item => item.attachment.id))
      setPendingAttachments(current => current.filter(item => !unsuccessfulIds.has(item.id)))
      for (const item of unsuccessful) {
        if (item.attachment.localPreviewUrl) {
          URL.revokeObjectURL(item.attachment.localPreviewUrl)
          attachmentPreviewUrlsRef.current.delete(item.attachment.localPreviewUrl)
        }
      }
      setAttachmentError(error instanceof Error ? error.message : 'Lampiran tidak dapat diunggah.')
    } finally {
      setAttachmentBusy(false)
    }
  }

  const removePendingAttachment = async (attachment: AgentChatAttachmentView) => {
    const sessionId = activeSessionId
    if (!sessionId || attachmentBusy || busy) return
    setAttachmentBusy(true)
    setAttachmentError(null)
    setPendingScopeClarification(null)
    try {
      await request<void>(`/agent/sessions/${sessionId}/attachments/${attachment.id}`, { method: 'DELETE' })
      setPendingAttachments(current => current.filter(item => item.id !== attachment.id))
      if (attachment.localPreviewUrl) {
        URL.revokeObjectURL(attachment.localPreviewUrl)
        attachmentPreviewUrlsRef.current.delete(attachment.localPreviewUrl)
      }
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : 'Lampiran tidak dapat dihapus.')
    } finally {
      setAttachmentBusy(false)
    }
  }

  const searchAgentHistory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = historyQuery.trim()
    if (query.length < 2 || historySearchBusy) return
    setHistorySearchBusy(true)
    setHistorySearchError(null)
    setHistorySearchWarning(null)
    setHistorySearchQuery(query)
    try {
      const result = await request<AgentHistorySearchResponse>(`/agent/history/search?q=${encodeURIComponent(query)}&limit=10`)
      setHistorySearchResults(result.items)
      setHistorySearchWarning(result.warning)
    } catch (error) {
      setHistorySearchResults([])
      setHistorySearchError(error instanceof Error ? error.message : 'Pencarian percakapan tidak dapat dilakukan.')
    } finally {
      setHistorySearchBusy(false)
    }
  }

  const openHistoryResult = async (result: AgentHistorySearchResult) => {
    if (busy || attachmentBusy || pendingAttachments.length || sessionActionBusy) return
    setContextOpen(false)
    setPendingMessageFocusId(result.messageId)
    if (result.sessionId !== activeSessionId) {
      await openSession(result.sessionId)
    }
  }

  const createSession = async () => {
    if (busy || sessionActionBusy || attachmentBusy || pendingAttachments.length || sessionsLoading || !user?.id) return
    setSessionActionBusy(true)
    setSessionError(null)
    try {
      const created = await request<AgentChatSessionSummary>('/agent/sessions', { method: 'POST' })
      setSessions((current) => [created, ...current])
      setActiveSessionId(created.id)
      setMessages([])
      setPendingScopeClarification(null)
      setPendingAttachments([])
      setAttachmentError(null)
      setDraft('')
      setSendError(null)
      setLastFailedPrompt(null)
      setLastFailedRequestId(null)
      saveActiveAgentSession(user.id, created.id)
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Room percakapan baru tidak dapat dibuat.')
    } finally {
      setSessionActionBusy(false)
    }
  }

  const deleteChatSession = async (forgetMemories = false) => {
    if (!pendingSessionDelete || busy || sessionActionBusy || !user?.id) return
    const session = pendingSessionDelete
    setSessionActionBusy(true)
    setSessionDeleteError(null)
    try {
      await request<void>(`/agent/sessions/${session.id}${forgetMemories ? '?forgetMemories=1' : ''}`, { method: 'DELETE' })
      setSessions(current => current.filter(item => item.id !== session.id))
      setPendingSessionDelete(null)
      if (activeSessionId === session.id) {
        setActiveSessionId(null)
        setMessages([])
        setPendingScopeClarification(null)
        setPendingAttachments([])
        setAttachmentError(null)
        setDraft('')
        setSendError(null)
        setLastFailedPrompt(null)
        setLastFailedRequestId(null)
        try { window.localStorage.removeItem(agentSessionStorageKey(user.id)) } catch { /* The server remains the source of truth when browser storage is unavailable. */ }
        await initializeSessions()
      }
    } catch (error) {
      setSessionDeleteError(error instanceof Error ? error.message : 'Riwayat chat tidak dapat dihapus.')
    } finally { setSessionActionBusy(false) }
  }

  const sendMessage = async (messageText: string, retrying = false, retryRequestId?: string, skipScopeClarification = false, selectedBanking?: BankSelection, reuseLastTranscriptMessage = false) => {
    const content = messageText.trim() || (!retrying && pendingAttachments.length ? 'Tolong analisis lampiran yang saya kirim.' : '')
    const sessionId = activeSessionId
    if (!content || busy || bankingScopeBusy || attachmentBusy || !sessionId || !status?.configured || !status.sources.length) return
    const attachmentsToSend = retrying ? [] : pendingAttachments
    const nextMessages: AgentChatMessage[] = retrying || reuseLastTranscriptMessage
      ? messages.slice(-50)
      : [...messages, { role: 'user' as const, content, ...(attachmentsToSend.length ? { attachments: attachmentsToSend } : {}) }].slice(-50)
    let banking = selectedBanking ?? (retrying ? lastFailedBanking : undefined)
    const bankingFollowUp = !retrying && !skipScopeClarification ? bankingFollowUpPrompt(content, messages, status.sources) : null
    const bankingPrompt = bankingFollowUp ?? content
    if (!retrying && !skipScopeClarification && (isBankingQuery(content) || bankingFollowUp || pendingAttachments.length)) {
      // Put the user's message in the transcript before the scope lookup starts.
      setMessages(nextMessages)
      setDraft('')
      if (attachmentsToSend.length) setPendingAttachments([])
      setBankingScopeBusy(true)
      setSendError(null)
      setChatProgress({ requestId: '', stage: 'preparing', message: attachmentsToSend.length ? 'Membaca identitas lampiran' : 'Menyiapkan pilihan rekening', detail: 'Memeriksa bank, rekening, toko, dan periode yang disebutkan.', updatedAt: new Date().toISOString() })
      try {
        const resolved = await request<BankScopeResult>('/agent/banking/scope', { method: 'POST', body: JSON.stringify({ prompt: bankingPrompt, sessionId, attachmentIds: attachmentsToSend.map(attachment => attachment.id) }) })
        if (resolved.handled) {
          if (resolved.needsSource || resolved.needsDate || resolved.needsAccounts || resolved.conflict) {
            setPendingScopeClarification({ prompt: bankingPrompt, displayPrompt: bankingFollowUp ? content : undefined, needsSource: resolved.needsSource, needsDate: resolved.needsDate, optimisticMessage: true, banking: resolved })
            return
          }
          banking = resolved.selection
        }
      } catch (error) {
        setMessages(messages)
        setDraft(content)
        if (attachmentsToSend.length) setPendingAttachments(attachmentsToSend)
        setSendError(error instanceof Error ? error.message : 'Bank dan rekening belum dapat diperiksa. Coba lagi.')
        return
      } finally { setBankingScopeBusy(false); setChatProgress(null) }
    }

    const reportScope = !banking && !retrying && !skipScopeClarification && !attachmentsToSend.length
      ? resolveAgentReportScope(content, status.sources)
      : null
    if (reportScope && (reportScope.needsDate || reportScope.needsSource)) {
      setPendingScopeClarification({ prompt: content, ...reportScope })
      setDraft('')
      setSendError(null)
      return
    }

    let requestId: string
    let notificationPermission: Promise<NotificationPermission | null>
    try {
      requestId = retryRequestId ?? createRequestId()
      notificationPermission = requestAgentNotificationPermission()
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Pertanyaan belum dapat disiapkan.')
      return
    }

    setPendingScopeClarification(null)
    setMessages(nextMessages)
    setDraft('')
    if (!retrying) setPendingAttachments([])
    setBusy(true)
    setSendError(null)
    setLastFailedPrompt(null)
    setLastFailedRequestId(null)
    let keepPolling = true
    let progressTimer: number | undefined
    setChatProgress({
      requestId,
      stage: 'preparing',
      message: 'Menyiapkan pertanyaan',
      detail: 'Mengirim permintaan ke backend.',
      updatedAt: new Date().toISOString(),
    })
    const pollProgress = async () => {
      if (!keepPolling) return
      try {
        const current = await request<AgentChatProgress>(`/agent/chat/${requestId}/progress`)
        if (!keepPolling) return
        setChatProgress((previous) => previous?.stage === current.stage && previous.updatedAt === current.updatedAt ? previous : current)
        if (current.stage === 'complete' || current.stage === 'error') {
          keepPolling = false
          return
        }
      } catch {
        // The chat POST can arrive after this first poll; keep trying until it reports progress.
      }
      if (keepPolling) progressTimer = window.setTimeout(() => void pollProgress(), 1_200)
    }
    progressTimer = window.setTimeout(() => void pollProgress(), 300)
    try {
      const requestMessages = nextMessages.slice(-12)
      let latestUserIndex = -1
      requestMessages.forEach((message, index) => { if (message.role === 'user') latestUserIndex = index })
      const response = await request<AgentChatResponse>('/agent/chat', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          requestId,
          ...(banking ? { banking } : {}),
          messages: requestMessages.map(({ role, content: text, attachments }, index) => ({
            role,
            content: limitAgentRequestContent(text),
            ...(role === 'user' && index === latestUserIndex && attachments?.length ? { attachmentIds: attachments.map(attachment => attachment.id) } : {}),
          })),
        }),
      })
      setMessages([...nextMessages, { role: 'assistant', requestId: response.requestId, content: response.answer, blocks: response.blocks, usedSources: response.usedSources, knowledgeReferences: response.knowledgeReferences, memoryReferences: response.memoryReferences, contextWarnings: response.contextWarnings, memoryProposal: response.memoryProposal }])
      setSessions((current) => current.map((session) => session.id === sessionId
        ? { ...session, title: session.title === 'Percakapan baru' ? makeAgentSessionTitle(content) : session.title, messageCount: session.messageCount + (reuseLastTranscriptMessage ? 1 : 2), updatedAt: new Date().toISOString() }
        : session).sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)))
      notifyAgentAnswerReady(notificationPermission, requestId)
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Pertanyaan belum dapat diproses.')
      setLastFailedPrompt(content)
      setLastFailedRequestId(requestId)
      setLastFailedBanking(banking)
    } finally {
      keepPolling = false
      if (progressTimer !== undefined) window.clearTimeout(progressTimer)
      setBusy(false)
      setChatProgress(null)
    }
  }

  const submitScopeClarification = (selection: AgentScopeSelection) => {
    const clarification = pendingScopeClarification
    if (!clarification) return
    const sourceText = selection.allSources ? 'semua toko yang tersedia' : joinAgentNaturalLabels(selection.sourceAliases)
    const dateText = selection.fromDate && selection.toDate
      ? selection.fromDate === selection.toDate
        ? `tanggal ${formatAgentNaturalDate(selection.fromDate)}`
        : `dari ${formatAgentNaturalDate(selection.fromDate)} sampai ${formatAgentNaturalDate(selection.toDate)}`
      : 'periode yang sudah disebutkan'
    const bankSelection = clarification.banking ? { ...clarification.banking.selection, branchIds: selection.branchIds, accountIds: selection.accountIds ?? [], from: selection.fromDate, to: selection.toDate } : undefined
    const accountText = bankSelection ? `, rekening ${clarification.banking!.accounts.filter(account => bankSelection.accountIds.includes(account.id)).map(account => `${account.bankName} ${account.accountNumber}`).join(', ')}` : ''
    const scopedPrompt = clarification.displayPrompt ?? `${clarification.prompt} — fokus ${sourceText}${accountText}, ${dateText}.`
    setPendingScopeClarification(null)
    void sendMessage(scopedPrompt, false, undefined, true, bankSelection, Boolean(clarification.optimisticMessage))
  }

  const [templateGroupTitle, setTemplateGroupTitle] = useState<string | null>(null)
  const templateGroups = useMemo(() => getAgentPromptTemplateGroups(user?.role), [user?.role])
  const selectedTemplateGroup = templateGroups.find(group => group.title === templateGroupTitle)
  const activeSession = sessions.find((session) => session.id === activeSessionId)
  const canChat = Boolean(status?.configured && status.sources.length && !statusError && activeSessionId && !sessionsLoading)

  useEffect(() => {
    if (!canChat) return
    const frame = window.requestAnimationFrame(() => questionInputRef.current?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [canChat])

  return (
    <div className="agent-page" ref={agentPageRef}>
      <h1 className="sr-only">Agent AI</h1>
      {statusError && <DataNotice kind="warning">{statusError}</DataNotice>}
      {pendingSessionDelete && <DeleteChatDialog title={pendingSessionDelete.title} busy={sessionActionBusy} error={sessionDeleteError} onClose={() => { if (!sessionActionBusy) setPendingSessionDelete(null) }} allowForgetMemory={user?.role === 'admin' || user?.role === 'pusat'} onConfirm={forget => void deleteChatSession(forget)} />}
      {selectedTemplateGroup && <AgentTemplateDialog group={selectedTemplateGroup} disabled={!canChat || busy || attachmentBusy || sessionActionBusy || Boolean(pendingAttachments.length)} onClose={() => setTemplateGroupTitle(null)} onSelect={prompt => { setTemplateGroupTitle(null); setContextOpen(false); void sendMessage(prompt) }} />}
      <div className={`agent-workspace${contextOpen ? ' is-context-open' : ''}`}>
        <section className="agent-chat-panel panel" aria-label="Percakapan Agent AI">
          <header className="agent-chat-header">
            <div className="agent-chat-identity"><div><CardHeading icon={<Bot size={19} />}>Asisten data Italy</CardHeading><span>{activeSession?.title ?? (status?.configured ? 'Asisten siap' : 'Agent AI belum dikonfigurasi')}</span></div></div>
            <div className="agent-chat-header-actions">
              <button className="button button-secondary agent-context-toggle" type="button" aria-expanded={contextOpen} aria-controls="agent-context" onClick={() => setContextOpen(open => !open)}><MessageCircle size={15} />{contextOpen ? 'Tutup panel' : 'Riwayat & template'}</button>
              <button className="agent-new-session-button" type="button" disabled={busy || attachmentBusy || Boolean(pendingAttachments.length) || sessionActionBusy || sessionsLoading} onClick={() => void createSession()}><Plus size={14} /> Chat baru</button>
              <button className="button button-secondary agent-refresh-connection" type="button" aria-label="Perbarui koneksi" title="Perbarui koneksi" onClick={() => { setStatusError(null); loadStatus() }}><RefreshCw size={14} /></button>
              <div className={`agent-connection${status?.configured && status.sources.length ? ' is-ready' : ''}`} role="status"><span />{status?.configured ? status.sources.length ? 'Siap menjawab' : 'Sumber belum tersedia' : 'Menunggu API key'}</div>
            </div>
          </header>

          <div ref={transcriptRef} className="agent-transcript" onScroll={handleTranscriptScroll} aria-live="polite" aria-relevant="additions text">
            {!messages.length && !pendingScopeClarification ? <div className="agent-welcome">
              <div className="agent-welcome-icon"><MessageCircle size={21} /></div>
              <h2>Apa yang ingin kamu ketahui?</h2>
              <p>Jawaban dapat berisi angka ringkasan, chart, tabel, dan catatan. Untuk akun Pusat/Admin, Agent dapat memproyeksikan restock, mengatur prioritas cuci buyback, dan menyusun distribusi gabungan per Jenis.</p>
              {!status?.configured && !statusError && <div className="agent-setup-note"><strong>Konfigurasi Agent AI</strong><span>Lengkapi kunci koneksi model di <code>backend/.env</code>, lalu jalankan ulang backend.</span></div>}
              {status?.configured && !status.sources.length && <div className="agent-setup-note"><strong>Belum ada sumber aktif</strong><span>{user?.role === 'admin' ? 'Tambahkan sumber cabang agar Agent dapat membaca skemanya.' : 'Minta administrator mengaktifkan sumber untuk akun ini.'}</span>{user?.role === 'admin' && <Link to="/pengaturan/sumber-data">Kelola sumber data <ArrowRight size={13} /></Link>}</div>}
              <div className="agent-template-library" aria-label="Template pertanyaan Agent AI">
                {templateGroups.map((group) => <section className="agent-template-group" key={group.title}>
                  <div className="agent-template-heading"><h3>{group.title}</h3><span>{group.templates.length} template</span></div>
                  <div className="agent-suggestions">
                    {group.templates.map((template) => <button key={template.label} className="agent-suggestion" type="button" disabled={!canChat || busy || attachmentBusy || sessionActionBusy || Boolean(pendingAttachments.length)} onClick={() => void sendMessage(template.prompt)}><span>{template.label}</span><ArrowUpRight size={14} /></button>)}
                  </div>
                </section>)}
              </div>
            </div> : <div className="agent-message-list">
              {messages.map((message, index) => <article id={message.id ? `agent-message-${message.id}` : undefined} className={`agent-message ${message.role === 'user' ? 'is-user' : 'is-assistant'}${message.id === highlightedMessageId ? ' is-history-match' : ''}`} key={message.id ?? `${index}-${message.role}`}>
                {message.role === 'assistant' && <span className="agent-message-mark"><Bot size={15} /></span>}
                <div className="agent-message-content">{message.role === 'assistant' ? <><AgentResponse blocks={message.blocks} fallbackText={message.content} /><AgentKnowledgeReferences {...message} />{message.requestId && <AgentAnswerFeedback requestId={message.requestId} initialFeedback={message.feedback} />}</> : <>{Boolean(message.attachments?.length) && <div className="agent-message-attachments">{message.attachments?.map(attachment => <AgentChatAttachmentItem key={attachment.id} attachment={attachment} sessionId={activeSessionId ?? ''} />)}</div>}<p>{message.content}</p></>}{Boolean(message.usedSources?.length) && <div className="agent-message-sources"><Database size={12} /><span>{message.usedSources?.map((source) => `${source.alias} (${source.branchId})`).join(' · ')}</span></div>}</div>
                {message.role === 'user' && <span className="agent-message-mark is-user" aria-hidden="true"><UserRound size={15} /></span>}
              </article>)}
              {pendingScopeClarification && <article className="agent-message is-assistant agent-scope-message">
                <span className="agent-message-mark"><Bot size={15} /></span>
                <div className="agent-message-content"><AgentScopeClarifier key={pendingScopeClarification.prompt} prompt={pendingScopeClarification.prompt} sources={status?.sources ?? []} needsDate={pendingScopeClarification.needsDate} needsSource={pendingScopeClarification.needsSource} banking={pendingScopeClarification.banking} disabled={busy || sessionActionBusy} onCancel={() => { setDraft(pendingScopeClarification.prompt); setPendingScopeClarification(null) }} onSubmit={submitScopeClarification} /></div>
              </article>}
              {busy && <div className="agent-message is-assistant agent-thinking"><span className="agent-message-mark"><Bot size={15} /></span><div className="agent-message-content" role="status" aria-live="polite"><LoaderCircle size={16} className="spin" /><div className="agent-thinking-copy"><strong>{chatProgress?.message ?? 'Menyiapkan pertanyaan'}</strong><span>{chatProgress?.detail ?? 'Backend sedang memulai proses.'}</span><div className="agent-progress-track" aria-hidden="true"><span /></div></div></div></div>}
              {sendError && <div className="agent-send-error" role="alert"><span>{sendError}</span>{lastFailedPrompt && <button className="text-link" type="button" disabled={busy} onClick={() => void sendMessage(lastFailedPrompt, true, lastFailedRequestId ?? undefined)}>Coba lagi</button>}</div>}
              <div ref={chatEndRef} />
            </div>}
          </div>
          <div className="agent-composer-dock">
            {showScrollToBottom && <button className="agent-scroll-to-bottom" type="button" aria-label="Lompat ke pesan terbaru" title="Ke pesan terbaru" onClick={() => scrollTranscriptToBottom(reduceMotion ? 'auto' : 'smooth')}>
              <ChevronDown size={21} strokeWidth={2.6} />
              {unreadAnswerCount > 0 && <span className="agent-scroll-to-bottom-badge" aria-label={`${unreadAnswerCount} jawaban baru`}>{unreadAnswerCount > 99 ? '99+' : unreadAnswerCount}</span>}
            </button>}

            <form className="agent-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(draft) }}>
              {Boolean(pendingAttachments.length) && <div className="agent-composer-files" aria-label="Lampiran yang akan dikirim">{pendingAttachments.map(attachment => <AgentChatAttachmentItem key={attachment.id} attachment={attachment} sessionId={activeSessionId ?? ''} onRemove={() => void removePendingAttachment(attachment)} disabled={attachmentBusy || busy} />)}</div>}
              {attachmentBusy && <div className="agent-attachment-status" role="status"><LoaderCircle size={13} className="spin" /> Mengunggah lampiran…</div>}
              {attachmentError && <div className="agent-attachment-error" role="alert">{attachmentError}</div>}
              <input ref={attachmentInputRef} className="sr-only" type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,application/pdf,image/jpeg,image/png,image/gif,image/webp" multiple disabled={!canChat || busy || attachmentBusy || sessionActionBusy} onChange={event => { void uploadAgentAttachments(event.currentTarget.files); event.currentTarget.value = '' }} />
              <label className="sr-only" htmlFor="agent-question">Tulis pertanyaan</label>
              <textarea ref={questionInputRef} id="agent-question" rows={1} maxLength={20_000} placeholder={canChat ? 'Tanyakan sesuatu tentang data cabang…' : 'Memuat room atau lengkapi koneksi Agent AI terlebih dahulu'} value={draft} onChange={(event) => { setDraft(event.target.value); event.target.style.height = 'auto'; event.target.style.height = `${Math.min(event.target.scrollHeight, 96)}px` }} disabled={!canChat || busy || bankingScopeBusy || attachmentBusy || sessionActionBusy} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(draft) } }} />
              <button className="agent-attach-button" type="button" aria-label="Lampirkan gambar atau PDF" title="Lampirkan gambar atau PDF" disabled={!canChat || busy || bankingScopeBusy || attachmentBusy || sessionActionBusy} onClick={() => attachmentInputRef.current?.click()}><Paperclip size={16} /></button>
              <button className="agent-send-button" type="submit" aria-label="Kirim pertanyaan" disabled={!canChat || busy || bankingScopeBusy || attachmentBusy || sessionActionBusy || (!draft.trim() && !pendingAttachments.length)}>{busy || bankingScopeBusy ? <LoaderCircle size={17} className="spin" /> : <Send size={16} />}</button>
              <p>Enter untuk mengirim · Shift + Enter baris baru · Gambar/PDF maks. {status?.attachmentLimits?.maxFileMb ?? 20} MB</p>
            </form>
          </div>
        </section>

        <button className="agent-context-backdrop" type="button" aria-label="Tutup panel riwayat dan template" tabIndex={contextOpen ? 0 : -1} onClick={() => setContextOpen(false)} />
        <aside id="agent-context" className="agent-context-column" aria-label="Riwayat chat dan template Agent AI" aria-hidden={!contextOpen}>
          <div className="agent-context-drawer-header">
            <div><strong>Konteks Agent</strong><span>Riwayat chat dan template</span></div>
            <button className="icon-button" type="button" aria-label="Tutup panel riwayat dan template" onClick={() => setContextOpen(false)}><X size={17} /></button>
          </div>
          <section className="agent-context-panel agent-history-panel panel">
            <div className="agent-context-heading"><div><CardHeading>Riwayat chat</CardHeading><p>{sessionsLoading ? 'Memuat room…' : `${formatNumber(sessions.length)} room tersimpan`}</p></div></div>
            <form className="agent-history-search" onSubmit={event => void searchAgentHistory(event)} role="search" aria-label="Cari percakapan terdahulu">
              <label className="sr-only" htmlFor="agent-history-search-input">Cari isi percakapan</label>
              <input id="agent-history-search-input" type="search" maxLength={200} value={historyQuery} onChange={event => setHistoryQuery(event.target.value)} placeholder="Cari topik di percakapan lama…" disabled={historySearchBusy || busy} />
              <button className="button button-secondary" type="submit" aria-label="Cari percakapan" title="Cari percakapan" disabled={historySearchBusy || busy || historyQuery.trim().length < 2}>{historySearchBusy ? <LoaderCircle size={14} className="spin" /> : <Search size={14} />}</button>
            </form>
            {historySearchError && <div className="agent-session-error" role="alert">{historySearchError}</div>}
            {historySearchQuery && <section className="agent-history-search-results" aria-label={`Hasil pencarian ${historySearchQuery}`}>
              <div className="agent-history-search-heading"><strong>Hasil pencarian</strong><button type="button" className="text-link" onClick={() => { setHistoryQuery(''); setHistorySearchQuery(''); setHistorySearchResults([]); setHistorySearchWarning(null); setHistorySearchError(null) }}>Bersihkan</button></div>
              {historySearchWarning && <p className="agent-history-search-warning">{historySearchWarning}</p>}
              {historySearchBusy ? <div className="agent-session-empty"><LoaderCircle size={14} className="spin" /> Mencari percakapan…</div> : historySearchResults.length ? <div className="agent-history-result-list">
                {historySearchResults.map(result => <button key={`${result.sessionId}-${result.requestId}`} className="agent-history-result" type="button" disabled={busy || attachmentBusy || Boolean(pendingAttachments.length) || sessionActionBusy} onClick={() => void openHistoryResult(result)}>
                  <span className="agent-history-result-title"><MessageCircle size={12} /><strong>{result.sessionTitle}</strong><small>{result.matchType === 'both' ? 'Teks + makna' : result.matchType === 'semantic' ? 'Makna' : 'Teks'}</small></span>
                  <span className="agent-history-result-copy"><b>Anda:</b> {result.question || 'Pertanyaan tidak tersedia'}{result.answer && <><br /><b>Agent:</b> {result.answer}</>}</span>
                  <span className="agent-history-result-date">{formatAgentSessionDate(result.createdAt)} · Buka pesan</span>
                </button>)}
              </div> : <div className="agent-session-empty">Tidak ada percakapan yang cocok.</div>}
            </section>}
            {sessionError && <div className="agent-session-error" role="alert"><span>{sessionError}</span><button type="button" className="text-link" disabled={sessionsLoading || sessionActionBusy} onClick={() => void initializeSessions()}>Muat ulang</button></div>}
            {!sessionError && sessionsLoading ? <div className="agent-session-empty"><LoaderCircle size={14} className="spin" /> Memuat riwayat chat…</div> : sessions.length ? <div className="agent-session-list" aria-label="Room percakapan tersimpan">
              {sessions.map((session) => <div className={`agent-session-row${session.id === activeSessionId ? ' is-active' : ''}`} key={session.id}><button type="button" aria-current={session.id === activeSessionId ? 'page' : undefined} className={`agent-session-item${session.id === activeSessionId ? ' is-active' : ''}`} disabled={busy || attachmentBusy || Boolean(pendingAttachments.length) || sessionActionBusy || sessionsLoading} onClick={() => { setContextOpen(false); void openSession(session.id) }}>
                <MessageCircle size={13} />
                <span><strong>{session.title}</strong><small>{formatAgentSessionDate(session.updatedAt)}{session.messageCount ? ` · ${formatNumber(session.messageCount)} pesan` : ' · belum ada pesan'}</small></span>
              </button><button className="icon-button agent-session-delete" type="button" title="Hapus riwayat chat" aria-label={`Hapus percakapan ${session.title}`} disabled={busy || sessionActionBusy || sessionsLoading} onClick={() => { setSessionDeleteError(null); setPendingSessionDelete(session) }}><Trash2 size={15} /></button></div>)}
            </div> : <div className="agent-session-empty">Belum ada room percakapan.</div>}
          </section>

          <section className="agent-context-panel agent-guide-panel panel">
            <div className="agent-context-heading"><div><CardHeading>Cakupan template</CardHeading><p>Klik kategori untuk memilih dan mengirim template pertanyaan.</p></div></div>
            <ul className="agent-guide-list">{templateGroups.map((group) => <li key={group.title}><button className="agent-template-group-open" type="button" aria-haspopup="dialog" onClick={() => setTemplateGroupTitle(group.title)}><span>{group.title}</span><span><strong>{group.templates.length}</strong><ChevronRight size={14} aria-hidden="true" /></span></button></li>)}</ul>
          </section>

        </aside>
      </div>
    </div>
  )
}

function AgentAnswerFeedback({ requestId, initialFeedback }: { requestId: string; initialFeedback?: AgentChatMessage['feedback'] }) {
  const { request } = useAuth()
  const [rating, setRating] = useState(initialFeedback?.rating ?? '')
  const [category, setCategory] = useState(initialFeedback?.category ?? '')
  const [openCategories, setOpenCategories] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(nextRating: 'helpful' | 'needs-improvement', nextCategory?: string) {
    if (busy) return
    setBusy(true); setError('')
    try {
      const result = await request<{ rating: 'helpful' | 'needs-improvement'; category?: string }>(`/agent/chat/${requestId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ rating: nextRating, ...(nextCategory ? { category: nextCategory } : {}) }),
      })
      setRating(result.rating); setCategory(result.category ?? ''); setOpenCategories(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Penilaian belum tersimpan.')
    } finally { setBusy(false) }
  }

  return <div className="agent-answer-feedback">
    <span>{rating ? (rating === 'helpful' ? 'Jawaban dinilai membantu' : 'Masukan tersimpan') : 'Apakah jawaban ini membantu?'}</span>
    <button type="button" className={rating === 'helpful' ? 'is-selected' : ''} disabled={busy} aria-label="Jawaban membantu" title="Membantu" onClick={() => void submit('helpful')}><ThumbsUp size={14} /></button>
    <button type="button" className={rating === 'needs-improvement' ? 'is-selected' : ''} disabled={busy} aria-label="Jawaban perlu diperbaiki" title="Perlu diperbaiki" onClick={() => setOpenCategories(value => !value)}><ThumbsDown size={14} /></button>
    {openCategories && <div className="agent-feedback-categories"><label htmlFor={`agent-feedback-${requestId}`}>Apa yang perlu diperbaiki?</label><select id={`agent-feedback-${requestId}`} value={category} onChange={event => setCategory(event.target.value)}><option value="">Pilih kategori</option><option value="incorrect">Angka atau hasil kurang tepat</option><option value="incomplete">Jawaban belum lengkap</option><option value="unclear">Penjelasan sulit dipahami</option><option value="wrong-analysis">Analisis atau pilihan tool kurang sesuai</option><option value="other">Lainnya</option></select><button type="button" className="button button-secondary button-compact" disabled={busy} onClick={() => void submit('needs-improvement', category || undefined)}>{busy ? 'Menyimpan…' : 'Kirim masukan'}</button></div>}
    {error && <small role="alert">{error}</small>}
    {rating === 'needs-improvement' && category && !openCategories && <small>{category === 'incorrect' ? 'Angka atau hasil kurang tepat' : category === 'incomplete' ? 'Jawaban belum lengkap' : category === 'unclear' ? 'Penjelasan sulit dipahami' : category === 'wrong-analysis' ? 'Analisis atau pilihan tool kurang sesuai' : 'Lainnya'}</small>}
  </div>
}

function agentSessionStorageKey(userId: string) {
  return `pantes-agent-active-session:${userId}`
}

function limitAgentRequestContent(value: string) {
  if (value.length <= AGENT_REQUEST_CONTENT_LIMIT) return value
  const contentLimit = AGENT_REQUEST_CONTENT_LIMIT - AGENT_REQUEST_TRUNCATION_MARKER.length
  const headLength = Math.ceil(contentLimit * 0.65)
  const tailLength = contentLimit - headLength
  return `${value.slice(0, headLength)}${AGENT_REQUEST_TRUNCATION_MARKER}${tailLength ? value.slice(-tailLength) : ''}`
}

function readActiveAgentSession(userId: string): string | null {
  try {
    return window.localStorage.getItem(agentSessionStorageKey(userId))
  } catch {
    return null
  }
}

function saveActiveAgentSession(userId: string, sessionId: string) {
  try {
    window.localStorage.setItem(agentSessionStorageKey(userId), sessionId)
  } catch {
    // The server still keeps the sessions; this only remembers which room to reopen first.
  }
}

function sessionSummaryFromDetail(session: AgentChatSession): AgentChatSessionSummary {
  return {
    id: session.id,
    title: session.title,
    messageCount: session.messageCount,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}

function makeAgentSessionTitle(content: string) {
  const title = content.replace(/\s+/g, ' ').trim()
  return title.length > 64 ? `${title.slice(0, 61).trimEnd()}…` : title || 'Percakapan baru'
}

function formatAgentSessionDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Waktu tidak tersedia'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
}

type AgentPromptTemplate = { label: string; prompt: string }
type AgentPromptTemplateGroup = { title: string; templates: AgentPromptTemplate[] }

function getAgentPromptTemplateGroups(role: Role | undefined): AgentPromptTemplateGroup[] {
  const now = new Date()
  const today = localIsoDate(now)
  const monthStart = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1))
  const previousMonthStart = localIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  const previousMonthEnd = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 0))
  const branchScope = role === 'cabang' ? 'cabang saya' : 'seluruh cabang yang dapat saya akses, pisahkan hasil per cabang'
  const salesBranchFocus = role === 'cabang' ? 'Gunakan cabang saya.' : 'Gunakan cabang yang sudah saya pilih dalam percakapan; jika belum jelas, tanyakan dahulu. Jangan memilih cabang sendiri.'
  const salesPresentation = 'Tampilkan berat dalam gram dengan format 13,180.379, nilai rupiah seperti Rp 2.940.631.000. Gunakan tabel yang memisahkan Cabang, Sales, Jenis sesuai tingkat rincian. Total harus mencakup seluruh hasil filter, bukan hanya halaman. Jelaskan hasMore, jenisHasMore, modelTruncated, atau nama/data yang belum tersedia; jangan menganggap sumber gagal sebagai nol. Kode sales sama pada cabang berbeda tetap terpisah. Identitas sales diambil dari lookup tm_sales dan dekripsi nama_sales, jangan menebak nama atau kode.'
  const groups: AgentPromptTemplateGroup[] = [
    {
      title: 'Data & koleksi',
      templates: [
        { label: 'Lihat sumber data yang bisa saya akses', prompt: 'Tampilkan sumber database aktif yang bisa saya akses, bedakan sumber Pusat dan Cabang serta tampilkan alias dan ID sumbernya.' },
        { label: 'Lihat koleksi yang tersedia', prompt: 'Daftar nama collection yang tersedia pada sumber database yang bisa saya akses.' },
        { label: 'Jelaskan struktur data penjualan', prompt: 'Jelaskan struktur field collection tt_jual_detail pada sumber yang bisa saya akses. Jangan tampilkan dokumen mentah atau informasi pelanggan.' },
        { label: 'Agregasi khusus penjualan per Jenis', prompt: `Gunakan agregasi baca-saja khusus pada tt_jual_detail ${role === 'cabang' ? 'di cabang saya' : 'pada sumber cabang yang dapat saya akses'} untuk periode ${previousMonthStart} sampai ${previousMonthEnd}. Kelompokkan berdasarkan field kode_dept (tampilkan sebagai Jenis) dan jumlahkan field berat dalam gram. Terapkan filter penjualan yang berlaku, jelaskan sumber dan periode, serta jangan tampilkan dokumen mentah.` },
      ],
    },
    {
      title: 'Data atomik & perbandingan',
      templates: [
        { label: 'Penjualan pada periode pilihan', prompt: `Gunakan get_sales_period untuk penjualan ${branchScope} dari ${monthStart} sampai ${today}. Tampilkan total gram, nilai IDR, serta rincian per Jenis.` },
        { label: 'Stok fisik saat ini', prompt: `Gunakan get_current_stock untuk stok fisik saat ini ${branchScope} per Jenis dalam pcs. Utamakan stock_on_hand; jika null/tidak tersedia gunakan qty. Tampilkan gram hanya sebagai informasi tambahan bila ada. Jangan gunakan filter periode.` },
        { label: 'Pengiriman dari Pusat pada periode pilihan', prompt: `Gunakan get_shipments_period untuk pengiriman Pusat dengan tujuan ${branchScope} dari ${monthStart} sampai ${today}. Pisahkan gram OPEN dan CLOS. Jelaskan tanggal ini adalah tanggal kirim.` },
        { label: 'Buyback belum disortir pada periode pilihan', prompt: `Gunakan get_buyback_period untuk kandidat buyback yang masih belum disortir, tidak hancur, bukan CANC, ${branchScope} yang tercatat dari ${monthStart} sampai ${today}. Rinci gram per Jenis dan jelaskan bahwa ini kandidat tersedia sekarang, bukan saldo historis.` },
        { label: 'Gabungkan penjualan, stok, pengiriman dan buyback', prompt: `Bandingkan penjualan, stok fisik saat ini, pengiriman dan kandidat buyback ${branchScope}. Gunakan get_sales_period, get_current_stock, get_shipments_period dan get_buyback_period; periode transaksi ${monthStart} sampai ${today}. Jalankan beberapa function call untuk data independen. Tampilkan stok fisik dalam pcs (stock_on_hand, fallback qty); penjualan, pengiriman dan buyback dalam gram, serta nilai penjualan dalam IDR. Sajikan comparison hanya untuk nilai dengan satuan sama dan analysis untuk temuan serta saran. Jangan tambahkan CLOS ke stok fisik. Kiriman OPEN dalam periode bukan seluruh OPEN aktif.` },
      ],
    },
    {
      title: 'Penjualan cabang & sales',
      templates: [
        { label: 'Ringkasan penjualan setiap cabang', prompt: `Gunakan get_branch_sales untuk penjualan ${branchScope} dari ${monthStart} sampai ${today}, includeJenis=false. Tampilkan total berat terjual dan nilai penjualan setiap cabang, urutkan gram terbesar, lalu tawarkan pendalaman per Jenis atau sales. ${salesPresentation}` },
        { label: 'Rincian penjualan cabang per Jenis', prompt: `${salesBranchFocus} Gunakan get_branch_sales dari ${monthStart} sampai ${today} dengan branchIds tepat dan includeJenis=true. Rinci gram dan rupiah per Jenis, sorot Jenis dominan. Gunakan jenisCode bila saya memilih satu Jenis dan page untuk halaman lanjut. ${salesPresentation}` },
        { label: 'Penjualan setiap cabang menurut sales', prompt: `Gunakan get_sales_by_salesperson untuk penjualan ${branchScope} dari ${monthStart} sampai ${today}. Kelompokkan Cabang → Sales → Jenis, includeJenis=true. Tampilkan nama/kode sales, total gram dan rupiah setiap sales, serta rincian Jenisnya. Gunakan pageSize=5 dan jenisPageSize=5 untuk ringkasan lintas cabang; jelaskan rincian yang belum tampil dan tawarkan pendalaman satu cabang/sales. ${salesPresentation}` },
        { label: 'Perinci penjualan seorang sales', prompt: `${salesBranchFocus} Saya ingin memperinci penjualan seorang sales dari ${monthStart} sampai ${today}. Jika sales belum disebutkan, tanyakan dahulu. Cari nama/kode yang benar melalui get_sales_by_salesperson pada cabang tersebut; jangan mengambil nama dari cabang lain. Lalu panggil dengan branchIds dan salesCode yang sesuai, includeJenis=true, untuk total dan rincian gram/rupiah per Jenis. jenisPage untuk halaman lanjut. ${salesPresentation}` },
        { label: 'Sales yang menjual Jenis tertentu', prompt: `${salesBranchFocus} Jika Jenis belum disebutkan, tanyakan dahulu dan petakan nama Jenis ke kode yang tersedia. Gunakan get_sales_by_salesperson dari ${monthStart} sampai ${today}, branchIds tepat, jenisCode yang dipilih, includeJenis=true. Tampilkan gram dan rupiah Jenis tersebut per sales. Jelaskan bahwa total difilter pada Jenis tersebut, bukan semua penjualan cabang. ${salesPresentation}` },
        { label: 'Bandingkan penjualan dua sales', prompt: `${salesBranchFocus} Jika dua sales belum disebutkan, tanyakan dahulu. Temukan kode/nama sales yang benar melalui get_sales_by_salesperson. Bandingkan keduanya pada ${monthStart} sampai ${today} dengan branchIds dan salesCode masing-masing; kedua pembacaan boleh berjalan bersamaan. Bandingkan gram dengan gram dan rupiah dengan rupiah, serta kontribusi per Jenis. Persentase tidak dihitung jika pembanding nol; jangan menyimpulkan penyebab perbedaan tanpa data. ${salesPresentation}` },
        { label: 'Penjualan pada periode yang saya pilih', prompt: `Saya ingin laporan penjualan cabang atau per sales pada periode pilihan. Jika tanggal awal/akhir, cabang, atau tingkat rincian belum jelas dalam percakapan, tanyakan dahulu. Gunakan get_branch_sales untuk ringkasan/per Jenis, atau get_sales_by_salesperson untuk Cabang → Sales → Jenis, dengan from/to inklusif sesuai pilihan saya, maksimum 366 hari. Jangan otomatis mengganti periode pilihan dengan bulan berjalan. ${salesPresentation}` },
      ],
    },
    {
      title: 'Penjualan & kondisi stok',
      templates: [
        { label: 'Ringkasan penjualan bulan ini', prompt: `Buat laporan penjualan ${branchScope} dari ${monthStart} sampai ${today}. Tampilkan total berat terjual dalam gram, nilai penjualan, faktur, dan Jenis teratas; gunakan filter penjualan yang berlaku.` },
        { label: 'Laporan penjualan periode sebelumnya', prompt: `Buat laporan penjualan ${branchScope} dari ${previousMonthStart} sampai ${previousMonthEnd}. Tampilkan total berat dalam gram, nilai penjualan, dan Jenis teratas.` },
        { label: 'Bandingkan stok dan penjualan per Jenis', prompt: 'Analisis stok fisik, kiriman OPEN masuk, dan berat penjualan bulan ini per cabang dan Jenis. Sorot Jenis yang paling laku serta yang cakupan stoknya paling rendah; tampilkan semua angka berat dalam gram.' },
        { label: 'Risiko kehabisan stok minggu depan', prompt: 'Cabang dan Jenis mana yang berisiko kehabisan stok dalam 7 hari mulai besok? Bandingkan penjualan bulan berjalan dengan periode tanggal yang sama tahun lalu, lalu tampilkan cakupan stok dan perkiraan defisit dalam gram.' },
        { label: 'Risiko kehabisan stok bulan depan', prompt: 'Cabang dan Jenis mana yang berisiko kehabisan stok selama bulan kalender berikutnya? Bandingkan penjualan bulan berjalan dengan periode tanggal yang sama tahun lalu, lalu tampilkan cakupan dan perkiraan defisit dalam gram.' },
      ],
    },
  ]

  groups.push({
    title: 'Knowledge & memory',
    templates: [
      { label: 'Cari SOP distribusi', prompt: 'Gunakan search_knowledge untuk mencari SOP atau panduan distribusi yang boleh saya akses. Ringkas aturan relevan dan sebut judul/lokasi kutipannya. Jika tidak ada dokumen yang sesuai, jelaskan bahwa referensi belum tersedia; jangan mengarang SOP.' },
      { label: 'SOP dibanding kondisi cabang', prompt: 'Saya ingin membandingkan SOP yang tersimpan dengan kondisi stok/penjualan cabang. Jika cabang atau topik belum jelas, tanyakan dahulu. Cari knowledge yang boleh saya akses lalu panggil fungsi data terbaru yang relevan. Bedakan aturan dalam dokumen dari rumus Pengaturan; jelaskan konflik jika ada. Semua angka barang dalam gram dan sertakan referensi.' },
      { label: 'Lihat catatan bisnis bersama yang relevan', prompt: 'Gunakan recall_shared_memory untuk mencari catatan bersama yang sudah disetujui mengenai istilah Jenis, distribusi dan cara membaca analisis Italy. Ringkas catatan yang ditemukan, sebutkan bahwa ini memory bersama; jangan menganggapnya sebagai saldo stok terkini. Jika belum ada, jelaskan dengan jujur.' },
    ],
  })

  const focusBranch = role === 'cabang'
    ? 'Gunakan cabang saya saja.'
    : 'Jika cabang belum disebutkan, tanyakan satu cabang tujuan sebelum membaca data. Jangan memilih cabang sendiri.'
  const presentation = 'Tampilkan gram (bukan unit/qty), pisahkan nilai rupiah. Gunakan comparison untuk dua nilai dengan satuan sama dan analysis untuk temuan serta tindakan. Maksimal 8 Jenis utama pada ringkasan; jelaskan cakupan rincian, tetap pertahankan total seluruh hasil, dan tawarkan pendalaman. Sumber unavailable bukan nol; ungkapkan partial/truncated dan baris tanpa berat. Stok adalah posisi saat ini, bukan saldo historis. Jangan mengarang hubungan sebab-akibat atau menganggap saran sudah dieksekusi.'
  const comparableDays = Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate())
  const comparableCurrentTo = localIsoDate(new Date(now.getFullYear(), now.getMonth(), comparableDays))
  const comparablePreviousTo = localIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, comparableDays))
  groups.push({
    title: 'Analisis operasional gabungan',
    templates: [
      { label: 'Ringkasan kondisi satu cabang', prompt: `${focusBranch} Buat ringkasan operasional cabang menggunakan get_sales_period, get_current_stock, get_shipments_period dan get_buyback_period. Periode transaksi ${monthStart}–${today}; pembacaan independen boleh dipanggil bersamaan. Tampilkan gram terjual, stok fisik sekarang, kiriman OPEN/CLOS dalam periode, kandidat buyback periode yang masih eligible sekarang, dan nilai penjualan IDR. Jelaskan Jenis dominan dan tiga hal yang perlu ditinjau owner. Jangan tambahkan CLOS atau buyback ke stok siap jual; OPEN periode ini belum tentu seluruh OPEN aktif. ${presentation}` },
      { label: 'Tren penjualan dibanding bulan lalu', prompt: `${focusBranch} Bandingkan penjualan cabang dengan dua get_sales_period: ${monthStart}–${comparableCurrentTo} dan ${previousMonthStart}–${comparablePreviousTo}. Kedua periode sama-sama ${comparableDays} hari; jangan bandingkan bulan berjalan dengan bulan lalu penuh. Hitung perubahan gram dan IDR per Jenis, tampilkan kenaikan/penurunan utama. Persentase terhadap pembanding nol tidak tersedia. ${presentation}` },
      { label: 'Jenis laku, bagaimana posisi stoknya?', prompt: `${focusBranch} Gabungkan get_sales_period ${monthStart}–${today} dan get_current_stock. Urutkan Jenis berdasarkan gram terjual. Per Jenis hitung rata-rata gram terjual per hari dari jumlah hari kalender periode, lalu cakupan stok fisik = stok fisik sekarang / rata-rata harian. Jika demand nol, cakupan tidak dapat dihitung. Ini cakupan stok fisik saja; tidak termasuk OPEN. Untuk risiko/rekomendasi restock yang menghitung seluruh OPEN aktif gunakan analisis stok/restock yang tersedia, bukan OPEN terbatas periode. Tampilkan Jenis laku dengan stok fisik paling terbatas. ${presentation}` },
      { label: 'Stok besar tetapi penjualan rendah', prompt: `${focusBranch} Baca get_current_stock dan get_sales_period ${monthStart}–${today}. Cari Jenis dengan stok gram besar dan penjualan gram rendah/nol pada periode. Tampilkan stok, penjualan, rata-rata harian dan cakupan stok fisik bila demand positif, serta porsi stok tiap Jenis dari total stok cabang. Tidak laku pada periode bukan bukti usia stok lama atau dead stock. Sarankan peninjauan komposisi atau analisis distribusi lebih lanjut, jangan langsung mengarang donor/penerima. ${presentation}` },
      { label: 'Pengiriman Pusat dibanding penjualan', prompt: `${focusBranch} Panggil get_shipments_period dan get_sales_period ${monthStart}–${today}, serta get_current_stock. Bandingkan gram kiriman OPEN dan CLOS per Jenis dengan gram terjual dan stok fisik sekarang. Periode kiriman adalah tanggal dikirim; CLOS adalah status saat dibaca, bukan berarti diterima dalam periode. Jangan menyatakan kiriman tertentu habis terjual tanpa pelacakan barang; jangan menjumlahkan CLOS ke tm_barang. OPEN pada rentang ini bukan seluruh OPEN aktif. ${presentation}` },
      { label: 'Buyback mana yang relevan dengan penjualan?', prompt: `${focusBranch} Gabungkan get_buyback_period dan get_sales_period ${monthStart}–${today}, serta get_current_stock. Per Jenis bandingkan gram kandidat buyback yang tercatat dalam periode dan masih eligible saat ini dengan gram terjual dan stok fisik sekarang. Sorot kandidat dari Jenis laku sebagai bahan tinjauan pencucian, bukan stok siap jual atau permintaan cuci resmi. Jangan menyebut hasil ini seluruh stok buyback lintas tanggal. Prioritas cuci resmi yang mempertimbangkan kebutuhan Pusat/cabang harus memakai tool suggest_buyback_cleaning_priority jika akun berwenang. ${presentation}` },
    ],
  })
  if (role !== 'cabang') groups.push({
    title: 'Perbandingan antar cabang',
    templates: [
      { label: 'Bandingkan performa dua cabang', prompt: `Tanyakan dua cabang yang ingin dibandingkan jika belum disebutkan, lalu petakan alias ke ID sumber yang diizinkan. Gunakan get_sales_period ${monthStart}–${today} dan get_current_stock untuk kedua cabang; pembacaan independen boleh bersamaan. Tampilkan comparison gram terjual dan comparison nilai penjualan IDR secara terpisah, stok fisik, Jenis utama, serta selisih/persentase terhadap cabang pembanding. Gram dan omzet bukan laba; jangan menganggap perbedaan omzet sebagai keuntungan. ${presentation}` },
      { label: 'Bandingkan satu Jenis lintas toko', prompt: `Jika kode/nama Jenis belum disebutkan, tanyakan dulu. Gunakan get_sales_period ${monthStart}–${today} dan get_current_stock dengan jenisCode yang sama pada cabang aktif yang diizinkan. Buat tabel per cabang: gram terjual, stok fisik sekarang, rata-rata gram harian dan cakupan stok fisik (tanpa OPEN). Urutkan penjualan gram; bedakan nol terverifikasi dari sumber tidak tersedia. Sorot stok besar di cabang dengan penjualan rendah sebagai kandidat peninjauan, bukan instruksi transfer final; rute transfer harus dihitung oleh suggest_network_restock. ${presentation}` },
    ],
  })

  if (role !== 'cabang') {
    groups.push({
      title: 'Inventory & distribusi',
      templates: [
        { label: 'Ringkasan inventory Pusat dan cabang', prompt: 'Tampilkan ringkasan inventory fisik terkini Pusat, setiap cabang, dan total jaringan. Kelompokkan per Jenis, sertakan porsi stok tiap lokasi terhadap total jaringan, dan tampilkan jumlah pcs sebagai nilai utama. Sertakan gram terpisah sebagai informasi tambahan bila tersedia; record tanpa berat tetap dihitung dalam pcs.' },
        { label: 'Bandingkan stok Pusat untuk order supplier', prompt: 'Bandingkan kebutuhan restock seluruh cabang dengan stok Pusat untuk 7 hari ke depan. Gunakan analisis order supplier per Jenis, tampilkan kebutuhan cabang, stok Pusat fisik dan tersedia setelah OPEN keluar, surplus Cabang yang dapat dimutasi, dukungan stok jaringan, serta saran order supplier dalam pcs. Urutkan Jenis dengan saran order terbesar. Jangan tampilkan rute transfer panjang; jelaskan bahwa hasil adalah rekomendasi, bukan transaksi pembelian.' },
        { label: 'Proyeksi restock satu cabang', prompt: 'Buat proyeksi restock 7 hari ke depan untuk satu cabang yang saya maksud, berdasarkan penjualan 7 hari terakhir vs rentang tanggal yang sama bulan sebelumnya. Jika saya belum menyebut alias cabangnya, tanyakan dahulu. Tampilkan pembanding penjualan, kebutuhan harian, patokan stok dasar, kebutuhan 7 hari, target total (patokan + kebutuhan 7 hari), stok fisik, kiriman OPEN, risiko, urgensi, dan saran restock per Jenis dalam pcs. Akhiri dengan rekomendasi jalur mutasi dari mana ke mana, Jenis dan pcs yang dikirim.' },
        { label: 'Rencana distribusi gabungan seluruh cabang', prompt: 'Buat rencana distribusi stok gabungan seluruh cabang untuk 7 hari ke depan, gunakan penjualan 7 hari terakhir vs rentang tanggal yang sama bulan sebelumnya. Prioritas penerima yang kekurangan: Exclusive (flag profit_bagus), opening, boost, lalu tanpa flag; dalam flag sama cakupan stok terendah. Target cabang = patokan stok dasar + kebutuhan penjualan 7 hari. Donor menyisakan target yang sama. Tampilkan patokan, kebutuhan 7 hari, target total, cabang surplus, cabang kekurangan, prioritas transfer, Jenis, jumlah transfer dalam pcs, dan kebutuhan yang belum terpenuhi.' },
        { label: 'Prioritas cuci hasil buyback', prompt: 'Susun prioritas pencucian buyback bulan ini. Gabungkan kekurangan safety stock Pusat dengan kekurangan proyeksi penjualan setiap Cabang sampai akhir bulan. Bandingkan penjualan bulan ini dengan bulan yang sama tahun lalu dan gunakan nilai gram terbesar. Stok tersedia Cabang adalah tm_barang ditambah kiriman OPEN dari database Pusat; jangan tambahkan CLOS. Tampilkan ringkasan gram, chart kebutuhan per Jenis, perhitungan penjualan/stok/kekurangan per Cabang dan Jenis, serta alokasi sumber buyback per tujuan.' },
      ],
    })
  }

  if (role === 'admin') {
    groups.push({
      title: 'Kelola prioritas cabang',
      templates: [
        { label: 'Ubah flag prioritas cabang', prompt: 'Saya ingin mengubah daftar flag prioritas penerima distribusi. Jika pasangan cabang dan flag tujuan belum lengkap, tanyakan daftar yang ingin saya ubah dengan format satu pasangan per baris BRANCH_ID=FLAG. FLAG harus salah satu dari profit_bagus (label Exclusive), opening, boost, atau none (tanpa flag). Saya dapat mengubah beberapa cabang sekaligus. Jangan menebak pasangan yang belum saya sebutkan. Cocokkan cabang dengan ID sumber yang tepat, simpan perubahan yang saya minta, lalu ringkas perubahan sebelumnya dan sesudahnya. Jangan mengubah stok atau membuat transaksi.' },
      ],
    })
  }

  return groups
}

function localIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

type SourceDraft = { databaseName: string; alias: string; branchId: string; sourceType: 'branch' | 'central'; distributionPriority: DistributionPriority; itemCategory: 'X' | 'BIASA'; active: boolean }
const emptySourceDraft: SourceDraft = { databaseName: '', alias: '', branchId: '', sourceType: 'branch', distributionPriority: 'none', itemCategory: 'BIASA', active: true }

export function DataSourcesPage() {
  const { user, request } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [sources, setSources] = useState<AgentDataSourceConfig[]>([])
  const [draft, setDraft] = useState<SourceDraft>(emptySourceDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busySourceId, setBusySourceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadSources = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await request<{ items: AgentDataSourceConfig[] }>('/sources', { signal })
      setSources(result.items)
      setError(null)
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : 'Daftar sumber data tidak dapat dimuat.')
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    if (!isAdmin) return
    const controller = new AbortController()
    request<{ items: AgentDataSourceConfig[] }>('/sources', { signal: controller.signal })
      .then((result) => {
        setSources(result.items)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'Daftar sumber data tidak dapat dimuat.')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [isAdmin, request])

  const refreshSources = () => {
    setLoading(true)
    void loadSources()
  }

  const resetForm = () => {
    setDraft(emptySourceDraft)
    setEditingId(null)
  }

  const submitSource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)
    const path = editingId ? `/sources/${encodeURIComponent(editingId)}` : '/sources'
    try {
      const saved = await request<AgentDataSourceConfig>(path, {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          databaseName: draft.databaseName.trim(),
          alias: draft.alias.trim(),
          branchId: draft.branchId.trim(),
          sourceType: draft.sourceType,
          distributionPriority: draft.sourceType === 'central' ? 'none' : draft.distributionPriority,
          ...(draft.sourceType === 'branch' ? { itemCategory: draft.itemCategory } : {}),
          ...(editingId ? { active: draft.active } : {}),
        }),
      })
      setSources((current) => editingId
        ? current.map((source) => source.id === saved.id ? saved : source)
        : [...current, saved].sort((a, b) => a.alias.localeCompare(b.alias, 'id')))
      setNotice(editingId ? 'Konfigurasi sumber Agent AI diperbarui.' : 'Konfigurasi sumber Agent AI berhasil ditambahkan.')
      resetForm()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sumber data tidak dapat disimpan.')
    } finally {
      setSaving(false)
    }
  }

  const editSource = (source: AgentDataSourceConfig) => {
    setEditingId(source.id)
    setDraft({ databaseName: source.databaseName, alias: source.alias, branchId: source.branchId, sourceType: source.sourceType ?? 'branch', distributionPriority: source.distributionPriority ?? 'none', itemCategory: source.itemCategory ?? 'BIASA', active: source.active })
    setError(null)
    setNotice(null)
    document.getElementById('source-database-name')?.focus()
  }

  const toggleSource = async (source: AgentDataSourceConfig) => {
    setBusySourceId(source.id)
    setError(null)
    try {
      const updated = await request<AgentDataSourceConfig>(`/sources/${encodeURIComponent(source.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          databaseName: source.databaseName,
          alias: source.alias,
          branchId: source.branchId,
          sourceType: source.sourceType ?? 'branch',
          distributionPriority: source.distributionPriority ?? 'none',
          ...(source.sourceType !== 'central' ? { itemCategory: source.itemCategory ?? 'BIASA' } : {}),
          active: !source.active,
        }),
      })
      setSources((current) => current.map((entry) => entry.id === updated.id ? updated : entry))
      setNotice(updated.active ? `${updated.alias} ditandai siap untuk Agent AI.` : `${updated.alias} ditandai belum siap untuk Agent AI.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Status sumber tidak dapat diubah.')
    } finally {
      setBusySourceId(null)
    }
  }

  if (!isAdmin) {
    return <><PageHeading eyebrow="PENGATURAN AGENT AI" title="Sumber data Agent AI" description="Konfigurasi database cabang hanya dapat dikelola administrator." /><DataNotice kind="warning">Akun ini tidak memiliki izin untuk mengubah konfigurasi database cabang untuk Agent AI.</DataNotice></>
  }

  return (
    <>
      <PageHeading eyebrow="PENGATURAN AGENT AI" title="Sumber data Agent AI" description="Daftarkan database cabang dan satu sumber Pusat untuk rekomendasi distribusi gabungan." action={<button className="button button-secondary" type="button" disabled={loading} onClick={refreshSources}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Perbarui</button>} />
      <DataNotice kind="warning">Sumber bertanda siap dapat dibaca Agent AI dalam mode agregasi. Pengelompokan cabang mall dan cabang lainnya adalah metadata sumber, terpisah dari kategori produk X, XB, dan B. Dokumen mentah tidak dikirim ke model. Data pengiriman tetap bersumber dari <span className="mono">db_pntspst2.tt_kirim_barang</span>. URI MongoDB dan kredensial tetap berada di backend.</DataNotice>
      {notice && <div className="settings-feedback success" role="status"><Check size={16} />{notice}</div>}
      {error && <p className="settings-feedback error" role="alert">{error}</p>}

      <div className="source-summary-grid" aria-label="Ringkasan sumber data">{[
        { label: 'Total sumber', value: sources.length, description: 'Konfigurasi tersimpan' },
        { label: 'Cabang', value: sources.filter((source) => source.sourceType !== 'central').length, description: 'Sumber data cabang' },
        { label: 'Pusat', value: sources.filter((source) => source.sourceType === 'central').length, description: 'Sumber distributor pusat' },
      ].map((metric) => <section className="panel source-summary-card" key={metric.label}><div><CardHeading>{metric.label}</CardHeading><strong>{loading && !sources.length ? '…' : error && !sources.length ? '—' : formatNumber(metric.value)}</strong><small>{metric.description}</small></div></section>)}</div>
      <div className="sources-layout">
        <section className="panel sources-list-card">
          <div className="sources-list-heading"><div><p className="eyebrow">KONFIGURASI SUMBER</p><CardHeading>Sumber data untuk Agent AI</CardHeading><p>{sources.length ? `${formatNumber(sources.length)} konfigurasi tersimpan` : 'Konfigurasi disimpan aman di database sistem.'}</p></div><span className="source-count-badge">{formatNumber(sources.filter((source) => source.active).length)} siap</span></div>
          {loading && !sources.length ? <LoadingBlock rows={3} /> : error && !sources.length ? <LoadError message={error} retry={refreshSources} /> : !sources.length ? <div className="empty-state source-empty"><Database size={22} /><strong>Belum ada konfigurasi sumber</strong><span>Tambahkan database cabang dan sumber Pusat untuk menyiapkan Agent AI.</span></div> : <SourceDirectory sources={sources} busySourceId={busySourceId} onEdit={editSource} onToggle={(source) => void toggleSource(source)} />}
        </section>
        <section className="panel source-editor-card">
          <div className="settings-card-heading">
            <div><p className="eyebrow">KONFIGURASI AGENT AI</p><CardHeading>{editingId ? 'Ubah sumber data Agent AI' : 'Tambah sumber data Agent AI'}</CardHeading><p>Gunakan nama database yang tersedia pada replica set server.</p></div>
          </div>
          <form className="source-form" onSubmit={(event) => void submitSource(event)}>
            <label className="form-field"><span>Jenis sumber</span><select value={draft.sourceType} onChange={(event) => { const sourceType = event.target.value as SourceDraft['sourceType']; setDraft((current) => ({ ...current, sourceType, distributionPriority: sourceType === 'central' ? 'none' : current.distributionPriority, itemCategory: sourceType === 'branch' && current.sourceType === 'central' ? 'BIASA' : current.itemCategory, branchId: sourceType === current.sourceType ? current.branchId : sourceType === 'central' ? 'PUSAT' : '' })) }}><option value="branch">Cabang</option><option value="central">Pusat (distributor)</option></select></label>
            {draft.sourceType === 'branch' && <label className="form-field"><span>Kelompok cabang</span><select value={draft.itemCategory} onChange={(event) => setDraft((current) => ({ ...current, itemCategory: event.target.value as SourceDraft['itemCategory'] }))}><option value="X">Khusus mall</option><option value="BIASA">Cabang lainnya</option></select><small>Pengelompokan sumber cabang ini tidak menentukan kategori barang X, XB, atau B.</small></label>}
            {draft.sourceType === 'branch' && <label className="form-field"><span>Flag prioritas sharing stok</span><select value={draft.distributionPriority} onChange={event => setDraft(current => ({ ...current, distributionPriority: event.target.value as DistributionPriority }))}>{distributionPriorityOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>Urutan penerima yang kekurangan: Exclusive → Opening → Boost → Tanpa flag. Flag sama: cakupan stok terendah lebih dulu.</small></label>}
            <label className="form-field"><span>Nama database</span><input id="source-database-name" value={draft.databaseName} onChange={(event) => setDraft((current) => ({ ...current, databaseName: event.target.value }))} placeholder="db_cabang_fcl" required minLength={1} maxLength={63} pattern="[a-zA-Z0-9_-]+" title="Gunakan huruf, angka, garis bawah, atau tanda hubung." /></label>
            <label className="form-field"><span>{draft.sourceType === 'central' ? 'Alias sumber Pusat' : 'Alias cabang'}</span><input value={draft.alias} onChange={(event) => setDraft((current) => ({ ...current, alias: event.target.value }))} placeholder={draft.sourceType === 'central' ? 'Italy Pusat' : 'Cabang FCL'} required minLength={1} maxLength={80} /></label>
            <label className="form-field"><span>{draft.sourceType === 'central' ? 'ID sumber Pusat' : 'Branch ID'}</span><input value={draft.branchId} onChange={(event) => setDraft((current) => ({ ...current, branchId: event.target.value }))} placeholder={draft.sourceType === 'central' ? 'PUSAT' : 'FCL'} required minLength={1} maxLength={40} /></label>
            {editingId && <label className="source-active-control"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))} /><span>Tandai siap untuk integrasi Agent AI</span></label>}
            <div className="source-form-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving ? <LoaderCircle size={15} className="spin" /> : editingId ? <Check size={15} /> : <Plus size={15} />}{editingId ? 'Simpan perubahan' : 'Tambah konfigurasi'}</button>{editingId && <button className="button button-secondary" type="button" onClick={resetForm}>Batal</button>}</div>
          </form>
        </section>

      </div>
      <p className="bottom-footnote"><ShieldCheck size={14} /> Tandai tepat satu sumber sebagai Pusat untuk mengaktifkan rencana distribusi gabungan. Sumber lama tanpa penanda tetap dianggap Cabang.</p>
    </>
  )
}

type UsersPageResult = { items: User[]; nextCursor: string | null }
type UserDraft = { name: string; email: string; password: string; role: Role | ''; branchId: string }

const roleOptions: Array<{ value: Role; label: string }> = [
  { value: 'admin', label: 'Administrator' },
  { value: 'pusat', label: 'Pusat' },
  { value: 'cabang', label: 'Cabang' },
]

function blankUserDraft(): UserDraft {
  return { name: '', email: '', password: '', role: '', branchId: '' }
}

function userRoleLabel(role: Role) {
  return roleOptions.find((option) => option.value === role)?.label ?? role
}

export function UserManagementPage() {
  const userSort = useTableSort()
  const { request, user } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [draft, setDraft] = useState<UserDraft>(blankUserDraft)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<User | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const editorDialogRef = useRef<HTMLDialogElement>(null)
  const deleteDialogRef = useRef<HTMLDialogElement>(null)
  const requestSequence = useRef(0)

  const loadUsers = useCallback(async (cursor: string | null = null, append = false, searchValue = search) => {
    const sequence = ++requestSequence.current
    if (append) setLoadingMore(true)
    else {
      setLoading(true)
      setLoadError(null)
    }

    const params = new URLSearchParams({ limit: '100' })
    if (cursor) params.set('cursor', cursor)
    if (searchValue.trim()) params.set('search', searchValue.trim())

    try {
      const result = await request<UsersPageResult>(`/users?${params.toString()}`)
      if (sequence !== requestSequence.current) return
      setUsers((current) => append ? [...current, ...result.items] : result.items)
      setNextCursor(result.nextCursor)
    } catch (reason) {
      if (sequence !== requestSequence.current) return
      setLoadError(reason instanceof Error ? reason.message : 'Daftar pengguna tidak dapat dimuat.')
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [request, search])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadUsers(null, false, search) }, 220)
    return () => window.clearTimeout(timer)
  }, [loadUsers, search])

  useEffect(() => {
    const dialog = editorDialogRef.current
    if (!dialog) return
    if (editorMode && !dialog.open) dialog.showModal()
    else if (!editorMode && dialog.open) dialog.close()
    return () => { if (dialog.open) dialog.close() }
  }, [editorMode])

  useEffect(() => {
    const dialog = deleteDialogRef.current
    if (!dialog) return
    if (pendingDelete && !dialog.open) dialog.showModal()
    else if (!pendingDelete && dialog.open) dialog.close()
    return () => { if (dialog.open) dialog.close() }
  }, [pendingDelete])

  const counts = useMemo(() => users.reduce((result, entry) => {
    result.active += Number(entry.active)
    result.inactive += Number(!entry.active)
    return result
  }, { active: 0, inactive: 0 }), [users])

  const openCreate = () => {
    setEditingUser(null)
    setDraft(blankUserDraft())
    setFormError(null)
    setEditorMode('create')
  }

  const openEdit = (entry: User) => {
    setEditingUser(entry)
    setDraft({ name: entry.name, email: entry.email, password: '', role: entry.role, branchId: entry.branchId ?? '' })
    setFormError(null)
    setEditorMode('edit')
  }

  const closeEditor = () => {
    if (saving) return
    setEditorMode(null)
    setEditingUser(null)
    setFormError(null)
  }

  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft.role) {
      setFormError('Pilih role untuk pengguna ini.')
      return
    }
    if (draft.role === 'cabang' && !draft.branchId.trim()) {
      setFormError('Branch ID wajib diisi untuk role Cabang.')
      return
    }

    const target = editingUser
    const mode = editorMode
    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        name: draft.name.trim(),
        email: draft.email.trim(),
        role: draft.role,
        ...(draft.role === 'cabang' ? { branchId: draft.branchId.trim() } : {}),
        ...(mode === 'create' ? { password: draft.password } : {}),
      }
      const saved = await request<User>(target && mode === 'edit' ? `/users/${encodeURIComponent(target.id)}` : '/users', {
        method: target && mode === 'edit' ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })

      setEditorMode(null)
      setEditingUser(null)
      setNotice(mode === 'edit' ? `Perubahan akun ${saved.name} berhasil disimpan.` : `Akun ${saved.name} berhasil ditambahkan.`)
      if (target?.id === user?.id) {
        window.location.reload()
        return
      }
      await loadUsers(null, false, search)
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Perubahan pengguna tidak dapat disimpan.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await request<void>(`/users/${encodeURIComponent(pendingDelete.id)}`, { method: 'DELETE' })
      setUsers((current) => current.filter((entry) => entry.id !== pendingDelete.id))
      setNotice(`Akun ${pendingDelete.name} berhasil dihapus.`)
      setPendingDelete(null)
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'Akun tidak dapat dihapus.')
    } finally {
      setDeleting(false)
    }
  }

  if (user?.role !== 'admin') {
    return <div className="user-management-page"><PageHeading eyebrow="PENGATURAN AKUN" title="Kelola pengguna" description="Akses halaman ini hanya tersedia untuk administrator." /><DataNotice kind="warning">Akun ini tidak memiliki izin untuk mengelola pengguna.</DataNotice></div>
  }

  return (
    <div className="user-management-page">
      <PageHeading eyebrow="PENGATURAN AKUN" title="Kelola pengguna" description="Atur akun dan cakupan akses untuk Pusat serta cabang." action={<button className="button button-primary" type="button" onClick={openCreate}><Plus size={15} /> Tambah pengguna</button>} />
      {notice && <div className="settings-feedback success" role="status"><Check size={15} />{notice}<button className="icon-button" type="button" aria-label="Tutup notifikasi" onClick={() => setNotice(null)}><X size={14} /></button></div>}
      {loadError && <LoadError message={loadError} retry={() => void loadUsers(null, false, search)} />}

      <section className="panel user-list-panel" aria-labelledby="user-list-title">
        <div className="user-list-toolbar">
          <div className="user-list-heading">
            
            <div><CardHeading id="user-list-title">Akun terdaftar</CardHeading><p>{loading && !users.length ? 'Memuat pengguna…' : `${formatNumber(users.length)} akun dimuat (cakupan sort) · ${formatNumber(counts.active)} aktif · ${formatNumber(counts.inactive)} nonaktif`}</p></div>
          </div>
          <div className="user-list-controls">
            <label className="user-search"><Search size={14} aria-hidden="true" /><span className="sr-only">Cari pengguna</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, email, atau branch ID" maxLength={80} /></label>
            <button className="button button-secondary button-compact" type="button" onClick={() => void loadUsers(null, false, search)} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} /> Perbarui</button>
          </div>
        </div>

        {loading && !users.length ? <LoadingBlock rows={5} /> : loadError && !users.length ? null : users.length ? (
          <div className="table-scroll">
            <table className="data-table user-table">
              <thead><tr>{userSort.header('name', 'Pengguna', false)}{userSort.header('role', 'Role', false)}{userSort.header('branchId', 'Cakupan', false)}{userSort.header('active', 'Status', false)}{userSort.header('createdAt', 'Dibuat', false)}<th scope="col" className="user-actions-heading">Aksi</th></tr></thead>
              <tbody>{userSort.order(users, (row, key) => key === 'active' ? Number(row.active) : row[key as 'name' | 'role' | 'branchId' | 'createdAt']).map((entry) => (
                <tr key={entry.id}>
                  <td><div className="user-identity"><span className="user-avatar" aria-hidden="true">{entry.name.trim().charAt(0).toUpperCase() || 'U'}</span><span><strong>{entry.name}{entry.id === user.id && <em>Akun Anda</em>}</strong><small>{entry.email}</small></span></div></td>
                  <td><span className={`user-role-badge role-${entry.role}`}>{userRoleLabel(entry.role)}</span></td>
                  <td>{entry.role === 'cabang' ? <span className="user-branch-id">{entry.branchId || '—'}</span> : entry.role === 'pusat' ? 'Pusat' : 'Semua akses'}</td>
                  <td><span className={`user-state-badge${entry.active ? ' is-active' : ''}`}><i />{entry.active ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td className="user-created-date">{formatDate(entry.createdAt, { dateStyle: 'medium' })}</td>
                  <td><div className="user-row-actions"><button className="icon-button" type="button" aria-label={`Ubah ${entry.name}`} title="Ubah pengguna" onClick={() => openEdit(entry)}><Pencil size={15} /></button><button className="icon-button user-delete-action" type="button" aria-label={`Hapus ${entry.name}`} title={entry.id === user.id ? 'Anda tidak dapat menghapus akun sendiri' : 'Hapus pengguna'} disabled={entry.id === user.id} onClick={() => { setDeleteError(null); setPendingDelete(entry) }}><Trash2 size={15} /></button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="user-empty-state"><Users size={22} /><strong>{search ? 'Pengguna tidak ditemukan' : 'Belum ada pengguna'}</strong><span>{search ? 'Coba kata kunci lain.' : 'Tambahkan akun pertama untuk tim Pusat atau cabang.'}</span>{!search && <button className="button button-secondary button-compact" type="button" onClick={openCreate}><Plus size={14} /> Tambah pengguna</button>}</div>}

        {nextCursor && !loading && <div className="user-list-footer"><span>Menampilkan {formatNumber(users.length)} akun dari daftar yang tersedia.</span><button className="button button-secondary button-compact" type="button" disabled={loadingMore} onClick={() => void loadUsers(nextCursor, true, search)}>{loadingMore ? <LoaderCircle size={14} className="spin" /> : <ChevronRight size={14} />}Muat pengguna berikutnya</button></div>}
      </section>
      <p className="bottom-footnote"><ShieldCheck size={14} /> Hanya administrator yang dapat mengelola akun. Menghapus pengguna juga mencabut sesi masuknya.</p>

      <dialog ref={editorDialogRef} className="user-editor-dialog" aria-labelledby="user-editor-title" onCancel={(event) => { event.preventDefault(); closeEditor() }}>
        <div className="user-dialog-heading"><span className="user-dialog-icon"><Users size={18} /></span><div><p className="eyebrow">PENGATURAN AKUN</p><h2 id="user-editor-title">{editorMode === 'edit' ? 'Ubah pengguna' : 'Tambah pengguna'}</h2><p>{editorMode === 'edit' ? 'Perbarui identitas dan cakupan akses akun.' : 'Buat akun baru untuk tim Pusat atau cabang.'}</p></div><button className="icon-button" type="button" aria-label="Tutup" disabled={saving} onClick={closeEditor}><X size={17} /></button></div>
        <form className="user-editor-form" onSubmit={(event) => void submitUser(event)}>
          <label className="form-field user-form-full"><span>Nama</span><input autoFocus value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required minLength={2} maxLength={100} autoComplete="name" placeholder="Nama pengguna" /></label>
          <label className="form-field user-form-full"><span>Email</span><input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} required maxLength={254} autoComplete="email" placeholder="nama@perusahaan.co.id" /></label>
          <label className="form-field"><span>Role</span><select value={draft.role} disabled={editingUser?.id === user.id} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as Role | '', branchId: event.target.value === 'cabang' ? current.branchId : '' }))} required><option value="" disabled>Pilih role</option>{roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          {draft.role === 'cabang' ? <label className="form-field"><span>Branch ID</span><input value={draft.branchId} onChange={(event) => setDraft((current) => ({ ...current, branchId: event.target.value }))} required minLength={1} maxLength={100} placeholder="Contoh: FCL" /></label> : <div className="user-scope-note"><ShieldCheck size={15} /><span>{draft.role === 'admin' ? 'Administrator memiliki akses pengelolaan seluruh akun.' : draft.role === 'pusat' ? 'Akun Pusat dapat melihat data operasional pusat.' : 'Pilih role untuk menentukan cakupan akun.'}</span></div>}
          {editorMode === 'create' && <label className="form-field user-form-full"><span>Password awal</span><input type="password" value={draft.password} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} required minLength={12} maxLength={128} autoComplete="new-password" placeholder="Minimal 12 karakter" /><small>Gunakan minimal 12 karakter. Password tidak ditampilkan kembali setelah akun dibuat.</small></label>}
          {editingUser?.id === user.id && <p className="user-self-note">Role akun Anda tidak dapat diubah dari halaman ini.</p>}
          {formError && <div className="user-form-error" role="alert"><AlertTriangle size={15} />{formError}</div>}
          <div className="user-editor-actions"><button className="button button-secondary" type="button" disabled={saving} onClick={closeEditor}>Batal</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? <LoaderCircle size={15} className="spin" /> : editorMode === 'edit' ? <Check size={15} /> : <Plus size={15} />}{saving ? 'Menyimpan…' : editorMode === 'edit' ? 'Simpan perubahan' : 'Buat pengguna'}</button></div>
        </form>
      </dialog>

      <dialog ref={deleteDialogRef} className="confirm-dialog" aria-labelledby="delete-user-title" onCancel={(event) => { event.preventDefault(); if (!deleting) setPendingDelete(null) }}>
        <div className="confirm-dialog-icon warning"><AlertTriangle size={20} /></div>
        <p className="eyebrow">HAPUS PENGGUNA</p>
        <h2 id="delete-user-title">Hapus akun {pendingDelete?.name}?</h2>
        <p>Akun ini akan dihapus dan sesi masuknya dicabut. Tindakan ini tidak dapat dibatalkan.</p>
        {deleteError && <div className="user-form-error" role="alert"><AlertTriangle size={15} />{deleteError}</div>}
        <div className="confirm-dialog-actions"><button className="button button-secondary" type="button" disabled={deleting} onClick={() => setPendingDelete(null)}>Batal</button><button className="button button-danger" type="button" disabled={deleting || !pendingDelete} onClick={() => void confirmDelete()}>{deleting ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}{deleting ? 'Menghapus…' : 'Hapus pengguna'}</button></div>
      </dialog>
    </div>
  )
}

export function LoginPage() {
  const { login, status } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email.trim(), password)
    } catch (reason) {
      const statusCode = reason instanceof ApiError ? reason.status : -1
      setError(statusCode === 401 ? 'Email atau kata sandi tidak sesuai.' : reason instanceof Error ? reason.message : 'Login belum berhasil. Coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') return <div className="login-loading" role="status"><LoaderCircle size={22} className="spin" /> Memeriksa sesi…</div>

  return (
    <main className="login-page">
      <div className="login-brand"><div className="brand-mark"><PackageOpen size={20} /></div><div><strong>Italy</strong><span>Asisten data AI</span></div></div>
      <div className="login-layout">
        <section className="login-story"><p className="eyebrow login-story-badge"><BarChart3 size={17} /> ASISTEN DATA ITALY</p><h1>Tanya data pada Agent, <span>dapatkan jawabannya.</span></h1><p>Gunakan Agent AI untuk mencari dan merangkum laporan penjualan, pembelian, otorisasi, marketplace, dan aktivitas login.</p><div className="login-story-meta"><span><ShieldCheck size={15} /> Akses berbasis peran</span><span><Database size={15} /> Data mengikuti cakupan akun</span></div></section>
        <section className="login-card panel" aria-labelledby="login-title">
          <div className="login-card-heading"><p className="eyebrow">AKSES AGENT AI</p><CardHeading id="login-title" icon={<ShieldCheck size={19} />}>Masuk ke Agent Italy</CardHeading><p>Gunakan akun yang diberikan administrator untuk mengakses data sesuai cakupan akun.</p></div>
          <form onSubmit={(event) => void submit(event)}>
            <label className="form-field"><span>Email</span><span className="login-input-wrap"><Mail size={19} aria-hidden="true" /><input type="email" name="email" autoComplete="username" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@perusahaan.co.id" /></span></label>
            <label className="form-field"><span>Kata sandi</span><span className="password-input login-input-wrap"><LockKeyhole size={19} aria-hidden="true" /><input type={passwordVisible ? 'text' : 'password'} name="password" autoComplete="current-password" required maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan kata sandi" /><button className="icon-button" type="button" aria-label={passwordVisible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} aria-pressed={passwordVisible} onClick={() => setPasswordVisible((visible) => !visible)}>{passwordVisible ? <EyeOff size={19} /> : <Eye size={19} />}</button></span></label>
            {error && <p className="form-error" role="alert"><AlertTriangle size={15} /> {error}</p>}
            <button className="button button-primary login-submit" type="submit" disabled={busy || !email.trim() || !password}>{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}{busy ? 'Memverifikasi…' : 'Masuk'}</button>
          </form>
          <p className="login-security-note"><ShieldCheck size={14} /> Sesi aman dengan akses singkat dan cookie refresh terlindungi.</p>
        </section>
      </div>
      <footer className="login-footer"><span>© Italy · Agent AI laporan internal</span><span>Versi web internal</span></footer>
    </main>
  )
}

