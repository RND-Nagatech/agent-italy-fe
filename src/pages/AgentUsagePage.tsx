import { useTableSort } from '../lib/table-sort'
import { useState } from 'react'
import { Wallet, History, Coins, Activity, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { getUserQueryScope, useSharedQuery } from '../lib/shared-query'
import './AgentUsagePage.css'
import { CardHeading } from '../components/CardHeading'
import { AgentTopUp } from '../components/AgentTopUp'

type Balance = {
  account: { clientName: string; keyHint: string }
  balanceIdr: number; minimumBalanceForRequestIdr: number; canMakeRequest: boolean
  status: { client: string; key: string }
  topUps: { count: number; last: { amountIdr: number; createdAt: string } | null }
}
type Summary = {
  period: { from: string; to: string; timeZone: string }
  totals: { requests: number; errors: number; confirmedRequests: number; costIdr: number; tokens: { input: number; cacheHit: number; cacheMiss: number; output: number; billable: number } }
  byStatus: Record<string, number>
  series: { date: string; requests: number; tokens: number; costIdr: number }[]
}
type UsageRecord = { id: string; requestId: string; model: string; statusCode: number; usageStatus: string; inputTokens: number | null; cacheHitTokens: number | null; cacheMissTokens: number | null; outputTokens: number | null; billableTokens: number | null; costIdr: number | null; startedAt: string; latencyMs: number | null }
type Records = { data: UsageRecord[]; pagination: { limit: number; nextCursor: string | null } }
const number = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n)
const money = (n: number | null | undefined) => n == null ? '—' : `Rp ${number(n)}`
const dateTime = (s: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(s))
function ErrorNotice({ message }: { message: string | null }) { return message ? <p className="usage-error" role="alert">{message}</p> : null }
function initialPeriod() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const start = new Date(`${today}T00:00:00+07:00`); start.setUTCDate(start.getUTCDate() - 29)
  return { from: start.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }), to: today }
}
function rangeParams(from: string, to: string) {
  const end = new Date(`${to}T00:00:00+07:00`); end.setUTCDate(end.getUTCDate() + 1)
  return new URLSearchParams({ from: new Date(`${from}T00:00:00+07:00`).toISOString(), to: end.toISOString() }).toString()
}
function BalanceCostChart({ series }: { series: Summary['series'] }) {
  const days = [...series].sort((a, b) => a.date.localeCompare(b.date))
  if (!days.length) return null
  const maximum = Math.max(1, ...days.map(day => day.costIdr))
  const start = Date.parse(days[0].date)
  const duration = Date.parse(days[days.length - 1].date) - start
  const points = days.map(day => ({ ...day, x: duration ? (Date.parse(day.date) - start) / duration * 1000 : 500, y: 150 - day.costIdr / maximum * 132 }))
  const line = points.map((point, i) => `${i ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  return <div className="usage-balance-chart"><span>Biaya harian · periode terpilih</span><svg viewBox="0 0 1000 160" preserveAspectRatio="none" role="img" aria-label="Tren biaya penggunaan harian dalam rupiah, bukan perubahan saldo"><title>Biaya harian: {days.map(day => `${day.date}: ${money(day.costIdr)}`).join('; ')}</title><defs><linearGradient id="balance-cost-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2463ff" stopOpacity="0.18" /><stop offset="100%" stopColor="#2463ff" stopOpacity="0.02" /></linearGradient></defs>{points.length > 1 && <><path d={`${line} L 1000 160 L 0 160 Z`} fill="url(#balance-cost-fill)" /><path d={line} stroke="#2463ff" strokeWidth="2.5" vectorEffect="non-scaling-stroke" fill="none" /></>}{points.map(point => <circle key={point.date} cx={point.x} cy={point.y} r="3" fill="#2463ff"><title>{point.date}: {money(point.costIdr)}</title></circle>)}</svg></div>
}
export function AgentUsagePage() {
  const { user, request } = useAuth()
  const [range, setRange] = useState(initialPeriod)
  const [draft, setDraft] = useState(range)
  const [validation, setValidation] = useState('')
  const [cursors, setCursors] = useState<string[]>([])
  const [limit, setLimit] = useState(20)
  const scope = getUserQueryScope(user)
  const params = rangeParams(range.from, range.to)
  const cursor = cursors.at(-1)
  const balance = useSharedQuery(`agent-usage:balance:${scope}`, () => request<Balance>('/agent-usage/balance'), 30_000)
  const summary = useSharedQuery(`agent-usage:summary:${scope}:${params}`, () => request<Summary>(`/agent-usage/summary?${params}`), 30_000)
  const records = useSharedQuery(`agent-usage:records:${scope}:${params}:${limit}:${cursor || ''}`, () => request<Records>(`/agent-usage/requests?${params}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`), 30_000)
  const sorting = useTableSort()
  const busy = balance.loading || summary.loading || records.loading
  const b = balance.data; const s = summary.data
  const series = s?.series ?? []
  function refresh() { balance.reload(); summary.reload(); records.reload() }
  function apply() {
    if (!draft.from || !draft.to || draft.from > draft.to) { setValidation('Pilih tanggal awal dan akhir yang valid.'); return }
    setValidation(''); setRange(draft); setCursors([])
  }
  return <div className="agent-usage-page">
    <div className="page-heading"><div><h1>Penggunaan Agent</h1><p>Pantau saldo gateway, biaya, dan aktivitas key aplikasi Italy.</p></div><button className="button button-secondary" disabled={busy} onClick={refresh}><RefreshCw size={16} className={busy ? 'spin' : ''} />Perbarui</button></div>
    <form className="usage-toolbar panel" onSubmit={event => { event.preventDefault(); apply() }}>
      <label>Dari tanggal<input type="date" required value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
      <label>Sampai tanggal<input type="date" required value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
      <button className="button button-primary" type="submit">Terapkan periode</button><span>Tanggal inklusif · waktu Jakarta<br />Saldo selalu menunjukkan kondisi terkini.</span>
      {validation && <p role="alert" className="usage-error">{validation}</p>}
    </form>
    <ErrorNotice message={balance.error} /><ErrorNotice message={summary.error} />
    <div className="usage-kpis" aria-busy={busy}>
      <section className="panel usage-balance"><CardHeading className="usage-kpi-title" icon={<Wallet size={19} />}>Saldo tersisa</CardHeading><strong>{money(b?.balanceIdr)}</strong>{b && <span className={`usage-status ${b.canMakeRequest ? 'is-ok' : 'is-error'}`}>{b.canMakeRequest ? 'Siap digunakan' : 'Request diblokir'}</span>}<p>Minimum request {money(b?.minimumBalanceForRequestIdr)}. {b?.account.clientName}</p>{b?.topUps.last && <small>Top-up terakhir {money(b.topUps.last.amountIdr)}<br />{dateTime(b.topUps.last.createdAt)}</small>}{b && !b.canMakeRequest && <p role="status">Periksa saldo serta status client ({b.status.client}) dan key ({b.status.key}) di gateway.</p>}<BalanceCostChart series={series} /></section>
      <section className="panel usage-kpi"><CardHeading className="usage-kpi-title" icon={<Coins size={19} />}>Biaya periode terpilih</CardHeading><strong>{money(s?.totals.costIdr)}</strong><p>Biaya tercatat untuk key aplikasi ini.</p></section>
      <section className="panel usage-kpi"><CardHeading className="usage-kpi-title" icon={<Activity size={19} />}>Total request</CardHeading><strong>{number(s?.totals.requests)}</strong><p>{number(s?.totals.confirmedRequests)} terkonfirmasi · {number(s?.totals.errors)} error</p></section>
      
    </div>
    <AgentTopUp onPaid={refresh} />
    <section className="panel usage-history"><div className="usage-panel-heading"><div><CardHeading className="usage-kpi-title" icon={<History size={19} />}>Riwayat request</CardHeading><p>Satu interaksi Agent bisa menghasilkan beberapa request model. Sort berlaku pada halaman request yang ditampilkan.</p></div><label>Baris per halaman <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setCursors([]) }}><option>20</option><option>50</option><option>100</option></select></label></div><ErrorNotice message={records.error} />
      <div className="usage-table-scroll"><table><thead><tr>{sorting.header('startedAt', 'Waktu Jakarta', false)}<th>ID request</th>{sorting.header('statusCode', 'HTTP / pencatatan', true)}{sorting.header('costIdr', 'Biaya', true)}{sorting.header('latencyMs', 'Durasi', true)}</tr></thead><tbody>{records.loading && !records.data ? <tr><td colSpan={5}>Memuat riwayat request…</td></tr> : records.data?.data.length ? sorting.order(records.data.data, (row, key) => row[key as 'costIdr' | 'latencyMs' | 'startedAt' | 'statusCode']).map(row => <tr key={row.id}><td>{dateTime(row.startedAt)}</td><td><small title={row.requestId}>{row.requestId}</small></td><td className="is-number"><span className={`usage-status ${row.statusCode >= 400 ? 'is-error' : 'is-ok'}`}>{row.statusCode}</span><small>{row.usageStatus}</small></td><td className="is-number">{money(row.costIdr)}</td><td className="is-number">{row.latencyMs == null ? '—' : `${number(row.latencyMs / 1000)} dtk`}</td></tr>) : <tr><td colSpan={5} className="usage-empty">{records.error ? 'Riwayat belum dapat ditampilkan.' : 'Belum ada request pada periode ini.'}</td></tr>}</tbody></table></div>
      <div className="usage-pagination"><span>Halaman {cursors.length + 1} · {number(records.data?.data.length)} request ditampilkan</span><div><button className="button button-secondary" disabled={!cursors.length || records.loading} onClick={() => setCursors(cursors.slice(0, -1))}><ChevronLeft size={16} />Sebelumnya</button><button className="button button-secondary" disabled={!records.data?.pagination.nextCursor || records.loading} onClick={() => { const next = records.data?.pagination.nextCursor; if (next) setCursors([...cursors, next]) }}>Berikutnya<ChevronRight size={16} /></button></div></div>
    </section>
    <p className="usage-footnote">Data hanya untuk key gateway yang dikonfigurasi pada server Italy. Saldo key lain tidak digabung. {summary.updatedAt && `Terakhir diperbarui ${dateTime(new Date(summary.updatedAt).toISOString())}.`}</p>
  </div>
}
