import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, CircleAlert, CopyPlus, LoaderCircle, Pencil, Plus, RefreshCw, Save, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { CardHeading } from '../components/CardHeading'
import type { Role } from '../lib/types'
import './AgentSkillsPage.css'

type Skill = {
  id: string
  name: string
  description: string
  triggerKeywords: string[]
  roles: Role[]
  instructions: string
  alwaysApply: boolean
  enabled: boolean
  version: number
  createdAt: string
  updatedAt: string
}

type Draft = Omit<Skill, 'id' | 'version' | 'createdAt' | 'updatedAt'>
const roleOptions: Array<{ value: Role; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'pusat', label: 'Pusat' },
  { value: 'cabang', label: 'Cabang' },
]
const freshDraft = (): Draft => ({ name: '', description: '', triggerKeywords: [], roles: ['admin', 'pusat', 'cabang'], instructions: '', alwaysApply: false, enabled: true })
const formatDate = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(value))

export function AgentSkillsPage() {
  const { request } = useAuth()
  const [items, setItems] = useState<Skill[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(freshDraft)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const selected = useMemo(() => items.find(item => item.id === selectedId) ?? null, [items, selectedId])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const result = await request<{ items: Skill[] }>('/agent/skills')
      setItems(result.items)
      setSelectedId(current => current && result.items.some(item => item.id === current) ? current : result.items[0]?.id ?? null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Skill Agent tidak dapat dimuat.')
    } finally { setLoading(false) }
  }, [request])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (selected) setDraft({ name: selected.name, description: selected.description, triggerKeywords: selected.triggerKeywords, roles: selected.roles, instructions: selected.instructions, alwaysApply: selected.alwaysApply, enabled: selected.enabled })
    else setDraft(freshDraft())
  }, [selected])

  function createNew() {
    setSelectedId(null); setDraft(freshDraft()); setError(''); setNotice('')
  }

  function toggleRole(role: Role) {
    setDraft(current => ({ ...current, roles: current.roles.includes(role) ? current.roles.filter(value => value !== role) : [...current.roles, role] }))
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const payload = { ...draft, triggerKeywords: draft.triggerKeywords.map(value => value.trim()).filter(Boolean) }
    if (!payload.alwaysApply && !payload.triggerKeywords.length) { setError('Tambahkan kata pemicu atau aktifkan untuk semua pertanyaan.'); return }
    if (!payload.roles.length) { setError('Pilih minimal satu cakupan role.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const saved = await request<Skill>(selectedId ? `/agent/skills/${selectedId}` : '/agent/skills', {
        method: selectedId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })
      setItems(current => [saved, ...current.filter(item => item.id !== saved.id)].sort((a, b) => Number(b.enabled) - Number(a.enabled) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt)))
      setSelectedId(saved.id)
      setNotice(`Skill tersimpan sebagai versi ${saved.version}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Skill belum dapat disimpan.')
    } finally { setBusy(false) }
  }

  async function toggleEnabled(skill: Skill) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const updated = await request<Skill>(`/agent/skills/${skill.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !skill.enabled }) })
      setItems(current => [updated, ...current.filter(item => item.id !== skill.id)].sort((a, b) => Number(b.enabled) - Number(a.enabled) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt)))
      setNotice(updated.enabled ? 'Skill diaktifkan.' : 'Skill dinonaktifkan; aturan bawaan tetap dipakai.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Status skill tidak dapat diubah.') }
    finally { setBusy(false) }
  }

  async function remove(skill: Skill) {
    if (busy || !window.confirm(`Hapus skill “${skill.name}”? Penghapusan ini tidak dapat dibatalkan.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await request<void>(`/agent/skills/${skill.id}`, { method: 'DELETE' })
      setItems(current => current.filter(item => item.id !== skill.id))
      setSelectedId(current => current === skill.id ? null : current)
      setNotice('Skill dihapus.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Skill tidak dapat dihapus.') }
    finally { setBusy(false) }
  }

  return <div className="agent-skills-page">
    <div className="page-heading"><div><p className="eyebrow">KONFIGURASI AGENT</p><h1>Skill Agent</h1><p>Atur panduan operasional yang dipakai Agent berdasarkan topik dan role.</p></div><button className="button button-secondary" type="button" disabled={loading || busy} onClick={() => void load()}><RefreshCw size={15} className={loading ? 'spin' : ''} />Perbarui</button></div>
    <div className="agent-skill-notice"><ShieldCheck size={17} /><span>Skill mengarahkan interpretasi dan cara menjelaskan. Hak akses, tool, sumber data, filter, dan perhitungan tetap dikendalikan backend.</span></div>
    {error && <div className="agent-skill-alert" role="alert"><CircleAlert size={16} />{error}</div>}
    {notice && <div className="agent-skill-success" role="status"><Check size={16} />{notice}</div>}

    <div className="agent-skills-layout">
      <section className="panel agent-skill-directory">
        <div className="agent-skill-panel-heading"><div><CardHeading icon={<SlidersHorizontal size={18} />}>Panduan tersimpan</CardHeading><p>{items.length} skill · {items.filter(item => item.enabled).length} aktif</p></div><button className="button button-primary button-compact" type="button" onClick={createNew}><Plus size={14} />Skill baru</button></div>
        {loading && !items.length ? <div className="agent-skill-empty"><LoaderCircle size={17} className="spin" /> Memuat skill…</div> : items.length ? <div className="agent-skill-list">{items.map(skill => <article key={skill.id} className={`agent-skill-list-item${skill.id === selectedId ? ' is-selected' : ''}${!skill.enabled ? ' is-disabled' : ''}`}>
          <button type="button" className="agent-skill-select" onClick={() => { setSelectedId(skill.id); setNotice(''); setError('') }}><span><strong>{skill.name}</strong><small>{skill.description || 'Tanpa keterangan'}</small></span><span className={`agent-skill-status${skill.enabled ? ' is-enabled' : ''}`}>{skill.enabled ? 'Aktif' : 'Nonaktif'}</span></button>
          <div className="agent-skill-list-meta"><span>{skill.alwaysApply ? 'Semua pertanyaan' : skill.triggerKeywords.slice(0, 3).join(' · ') || 'Tanpa pemicu'}</span><small>v{skill.version}</small></div>
        </article>)}</div> : <div className="agent-skill-empty"><SlidersHorizontal size={20} /><strong>Belum ada skill</strong><span>Buat panduan untuk membantu Agent menangani pertanyaan tertentu.</span></div>}
      </section>

      <section className="panel agent-skill-editor">
        <div className="agent-skill-panel-heading"><div><CardHeading icon={selected ? <Pencil size={18} /> : <CopyPlus size={18} />}>{selected ? 'Edit skill' : 'Skill baru'}</CardHeading><p>{selected ? `Versi ${selected.version} · diperbarui ${formatDate(selected.updatedAt)}` : 'Buat panduan terarah untuk kebutuhan operasional.'}</p></div>{selected && <button className={`agent-skill-toggle${draft.enabled ? ' is-enabled' : ''}`} type="button" disabled={busy} onClick={() => void toggleEnabled(selected)}>{draft.enabled ? 'Aktif' : 'Nonaktif'}</button>}</div>
        <form className="agent-skill-form" onSubmit={event => void save(event)}>
          <label>Nama skill<input required minLength={2} maxLength={80} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="Contoh: Analisis penjualan per Jenis" /></label>
          <label>Keterangan singkat<input maxLength={240} value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} placeholder="Jelaskan kapan panduan ini digunakan" /></label>
          <label>Kata pemicu <small>Pisahkan dengan koma. Cocokkan berdasarkan teks pertanyaan.</small><input value={draft.triggerKeywords.join(', ')} onChange={event => setDraft(current => ({ ...current, triggerKeywords: event.target.value.split(',').map(value => value.trim()).filter(Boolean).slice(0, 12) }))} placeholder="penjualan, per jenis, tren" disabled={draft.alwaysApply} /></label>
          <fieldset><legend>Berlaku untuk role</legend><div className="agent-skill-role-options">{roleOptions.map(option => <label key={option.value}><input type="checkbox" checked={draft.roles.includes(option.value)} onChange={() => toggleRole(option.value)} />{option.label}</label>)}</div></fieldset>
          <label className="agent-skill-check"><input type="checkbox" checked={draft.alwaysApply} onChange={event => setDraft(current => ({ ...current, alwaysApply: event.target.checked }))} /><span><strong>Terapkan untuk semua pertanyaan</strong><small>Skill tetap dibatasi oleh jumlah dan panjang panduan yang aktif.</small></span></label>
          <label className="agent-skill-check"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft(current => ({ ...current, enabled: event.target.checked }))} /><span><strong>Aktifkan skill</strong><small>Skill nonaktif tidak dimasukkan ke konteks Agent.</small></span></label>
          <label>Instruksi untuk Agent<textarea required minLength={10} maxLength={4_000} rows={10} value={draft.instructions} onChange={event => setDraft(current => ({ ...current, instructions: event.target.value }))} placeholder="Jelaskan urutan analisis, pertanyaan klarifikasi, fokus jawaban, dan bentuk ringkasan yang diharapkan." /></label>
          <div className="agent-skill-form-footer"><span>{draft.instructions.length.toLocaleString('id-ID')} / 4.000 karakter</span><div>{selected && <button className="button button-danger" type="button" disabled={busy} onClick={() => void remove(selected)}><Trash2 size={14} />Hapus</button>}<button className="button button-primary" type="submit" disabled={busy || !draft.name.trim() || draft.roles.length === 0}>{busy ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}{selected ? 'Simpan perubahan' : 'Buat skill'}</button></div></div>
        </form>
      </section>
    </div>
  </div>
}
