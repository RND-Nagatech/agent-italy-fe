import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Clock3, ListChecks, RefreshCw, ThumbsDown, ThumbsUp, Wrench } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { CardHeading } from '../components/CardHeading'
import './AgentEvaluationPage.css'

type TraceFeedback = { rating: 'helpful' | 'needs-improvement'; category?: string; updatedAt: string } | null
type Trace = {
  id: string
  sessionId: string | null
  user: { name: string; role: string }
  status: 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt: string | null
  durationMs: number | null
  toolCalls: Array<{ name: string; durationMs: number; outcome: 'success' | 'error' }>
  executionPlans?: Array<{ round: number; status: 'approved' | 'rejected'; toolNames: string[]; reason?: string; createdAt: string }>
  appliedSkills: Array<{ name: string; version: number }>
  usedSources: Array<{ alias: string; branchId: string }>
  errorStatus: number | null
  feedback: TraceFeedback
  attempts: number
}
type TraceResult = {
  period: { days: number; from: string }
  summary: { total: number; completed: number; failed: number; running: number; helpful: number; needsImprovement: number }
  items: Trace[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

const fmtNumber = (value: number) => new Intl.NumberFormat('id-ID').format(value)
const fmtDateTime = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(date)
}
const fmtDuration = (value: number | null) => value === null ? 'Berjalan' : value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} dtk`
const roleName: Record<string, string> = { admin: 'Admin', pusat: 'Pusat', cabang: 'Cabang' }
const feedbackName: Record<string, string> = { incorrect: 'Angka/hasil kurang tepat', incomplete: 'Belum lengkap', unclear: 'Sulit dipahami', 'wrong-analysis': 'Analisis/tool kurang sesuai', other: 'Lainnya' }

export function AgentEvaluationPage() {
  const { request } = useAuth()
  const [data, setData] = useState<TraceResult | null>(null)
  const [days, setDays] = useState(30)
  const [rating, setRating] = useState('all')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const query = new URLSearchParams({ days: String(days), page: String(page), pageSize: '25', rating })
      setData(await request<TraceResult>(`/agent/traces?${query}`))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Jejak Agent tidak dapat dimuat.')
    } finally { setLoading(false) }
  }, [request, days, page, rating])

  useEffect(() => { void load() }, [load])

  function changeDays(value: number) { setDays(value); setPage(1) }
  function changeRating(value: string) { setRating(value); setPage(1) }

  const summary = data?.summary
  return <div className="agent-evaluation-page">
    <div className="page-heading"><div><p className="eyebrow">KUALITAS & OPERASI</p><h1>Evaluasi Agent</h1><p>Lihat jejak proses dan masukan pengguna untuk meningkatkan jawaban.</p></div><button className="button button-secondary" type="button" disabled={loading} onClick={() => void load()}><RefreshCw size={15} className={loading ? 'spin' : ''} />Perbarui</button></div>
    <div className="agent-evaluation-note"><Activity size={16} /><span>Jejak mencatat status, durasi, tool, sumber, dan penilaian. Isi pertanyaan dan jawaban tidak disalin ke halaman ini.</span></div>
    {error && <p className="agent-evaluation-error" role="alert">{error}</p>}

    <div className="agent-evaluation-stats">
      <section className="panel"><CardHeading icon={<Activity size={18} />}>Eksekusi</CardHeading><strong>{fmtNumber(summary?.total ?? 0)}</strong><small>{days} hari terakhir</small></section>
      <section className="panel"><CardHeading icon={<CheckCircle2 size={18} />}>Selesai</CardHeading><strong>{fmtNumber(summary?.completed ?? 0)}</strong><small>{fmtNumber(summary?.running ?? 0)} masih berjalan</small></section>
      <section className="panel"><CardHeading icon={<AlertTriangle size={18} />}>Gagal</CardHeading><strong>{fmtNumber(summary?.failed ?? 0)}</strong><small>Eksekusi yang berakhir error</small></section>
      <section className="panel"><CardHeading icon={<ThumbsUp size={18} />}>Penilaian membantu</CardHeading><strong>{fmtNumber(summary?.helpful ?? 0)}</strong><small>{fmtNumber(summary?.needsImprovement ?? 0)} masukan perlu perbaikan</small></section>
    </div>

    <section className="panel agent-evaluation-history">
      <header className="agent-evaluation-toolbar"><div><CardHeading icon={<Clock3 size={18} />}>Jejak jawaban</CardHeading><p>Setiap baris adalah satu pertanyaan dalam satu room.</p></div><div className="agent-evaluation-filters"><label>Periode<select value={days} onChange={event => changeDays(Number(event.target.value))}><option value={7}>7 hari</option><option value={30}>30 hari</option><option value={90}>90 hari</option></select></label><label>Penilaian<select value={rating} onChange={event => changeRating(event.target.value)}><option value="all">Semua</option><option value="helpful">Membantu</option><option value="needs-improvement">Perlu perbaikan</option><option value="unrated">Belum dinilai</option></select></label></div></header>
      <div className="agent-evaluation-table-scroll"><table className="agent-evaluation-table"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Status</th><th>Durasi</th><th>Tool</th><th>Sumber data</th><th>Penilaian</th></tr></thead><tbody>
        {loading && !data?.items.length ? <tr><td colSpan={7} className="agent-evaluation-empty">Memuat jejak…</td></tr> : data?.items.length ? data.items.map(trace => <tr key={trace.id}>
          <td><strong>{fmtDateTime(trace.startedAt)}</strong>{trace.sessionId && <small>Room {trace.sessionId.slice(-6)}</small>}</td>
          <td><strong>{trace.user.name}</strong><small>{roleName[trace.user.role] ?? trace.user.role}</small></td>
          <td><span className={`agent-trace-status is-${trace.status}`}>{trace.status === 'completed' ? 'Selesai' : trace.status === 'failed' ? `Gagal${trace.errorStatus ? ` · ${trace.errorStatus}` : ''}` : 'Berjalan'}</span>{trace.attempts > 1 && <small>{trace.attempts} percobaan</small>}</td>
          <td className="is-number">{fmtDuration(trace.durationMs)}</td>
          <td><div className="agent-trace-process">{trace.executionPlans?.length ? <details className="agent-trace-details"><summary><ListChecks size={13} />{trace.executionPlans.length} rencana</summary><ul>{trace.executionPlans.map((plan, index) => <li key={`${plan.round}-${index}`}><span>Putaran {plan.round}: {plan.toolNames.length ? plan.toolNames.join(', ') : 'format fungsi tidak valid'}</span><small className={`agent-plan-status is-${plan.status}`}>{plan.status === 'approved' ? 'Disetujui · akan dijalankan' : 'Ditolak · tidak dijalankan'}{plan.reason ? ` · ${plan.reason}` : ''}</small></li>)}</ul></details> : null}{trace.toolCalls.length ? <details className="agent-trace-details"><summary><Wrench size={13} />{trace.toolCalls.length} tool dijalankan</summary><ul>{trace.toolCalls.map((tool, index) => <li key={`${tool.name}-${index}`}><span>{tool.name}</span><small>{fmtDuration(tool.durationMs)} · {tool.outcome === 'success' ? 'berhasil' : 'gagal'}</small></li>)}</ul></details> : !trace.executionPlans?.length ? <span className="agent-evaluation-muted">Tidak ada tool</span> : null}{trace.appliedSkills?.length > 0 && <details className="agent-trace-details"><summary>{trace.appliedSkills.length} skill</summary><ul>{trace.appliedSkills.map(skill => <li key={`${skill.name}-${skill.version}`}><span>{skill.name}</span><small>Versi {skill.version}</small></li>)}</ul></details>}</div></td>
          <td>{trace.usedSources.length ? <details className="agent-trace-details"><summary>{trace.usedSources.length} sumber</summary><ul>{trace.usedSources.map(source => <li key={`${source.branchId}-${source.alias}`}><span>{source.alias}</span><small>{source.branchId}</small></li>)}</ul></details> : <span className="agent-evaluation-muted">Belum tercatat</span>}</td>
          <td>{trace.feedback ? <span className={`agent-trace-feedback is-${trace.feedback.rating}`}>{trace.feedback.rating === 'helpful' ? <ThumbsUp size={13} /> : <ThumbsDown size={13} />}{trace.feedback.rating === 'helpful' ? 'Membantu' : feedbackName[trace.feedback.category ?? ''] ?? 'Perlu perbaikan'}</span> : <span className="agent-evaluation-muted">Belum dinilai</span>}</td>
        </tr>) : <tr><td colSpan={7} className="agent-evaluation-empty">Belum ada jejak untuk filter ini.</td></tr>}
      </tbody></table></div>
      <footer className="agent-evaluation-pagination"><span>{fmtNumber(data?.pagination.total ?? 0)} jejak · halaman {data?.pagination.page ?? page} dari {data?.pagination.totalPages ?? 1}</span><div><button className="button button-secondary button-compact" type="button" disabled={loading || page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Sebelumnya</button><button className="button button-secondary button-compact" type="button" disabled={loading || page >= (data?.pagination.totalPages ?? 1)} onClick={() => setPage(value => value + 1)}>Berikutnya</button></div></footer>
    </section>
  </div>
}
