import { useEffect, useRef, useState, type DragEvent } from 'react'
import { ArrowRight, FileImage, FileText, FolderOpen, LoaderCircle, Upload, X } from 'lucide-react'
import { AGENT_ATTACHMENT_ACCEPT, agentAttachmentMime, inspectAgentAttachments, planAgentAttachments, type AgentAttachmentLimits, type AgentAttachmentSource } from '../lib/agent-attachment-files'
import { captureAgentDrop, readAgentDrop } from '../lib/agent-folder-drop'
import './AgentFolderDialog.css'

export function AgentFolderDialog({ pending, limits, disabled, onClose, onAttach }: {
  pending: Array<{ mime: string; size: number }>; limits: AgentAttachmentLimits; disabled: boolean
  onClose: () => void; onAttach: (files: File[], source: AgentAttachmentSource) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null), fileRef = useRef<HTMLInputElement>(null), readState = useRef({ generation: 0 })
  const [files, setFiles] = useState<File[]>([]), [checked, setChecked] = useState(new Set<File>())
  const [source, setSource] = useState<AgentAttachmentSource>('folder')
  const [reading, setReading] = useState(false), [dragging, setDragging] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    const dialog = dialogRef.current!
    const state = readState.current
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; dialog.showModal()
    return () => { state.generation++; dialog.close(); document.body.style.overflow = overflow; if (focus?.isConnected) focus.focus() }
  }, [])
  const inspected = inspectAgentAttachments(files, source)
  const selected = inspected.files.filter(file => checked.has(file))
  const plan = planAgentAttachments(selected, source, pending, limits)
  const available = Math.max(0, limits.maxFiles - pending.length)
  const validation = selected.length ? plan.error : null
  const stage = (next: File[], kind: AgentAttachmentSource) => {
    const result = inspectAgentAttachments(next, kind)
    setFiles(next); setSource(kind); setChecked(new Set(result.files)); setError(result.files.length ? '' : 'Tidak ada gambar atau PDF yang didukung dalam pilihan ini.')
  }
  const drop = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault(); event.stopPropagation(); setDragging(false)
    if (reading || disabled) return
    const current = ++readState.current.generation
    setReading(true); setError('')
    try {
      const captured = captureAgentDrop(event.dataTransfer)
      const next = await readAgentDrop(captured)
      if (readState.current.generation === current) stage(next, captured.source)
    } catch (cause) {
      if (readState.current.generation === current) setError(cause instanceof Error ? cause.message : 'Folder belum dapat dibaca. Coba seret kembali.')
    } finally { if (readState.current.generation === current) setReading(false) }
  }
  const total = selected.reduce((sum, file) => sum + file.size, 0)
  const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`
  return <dialog ref={dialogRef} className="agent-folder-dialog" aria-labelledby="agent-folder-title" aria-describedby="agent-folder-description" onCancel={event => { event.preventDefault(); onClose() }}
    onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.stopPropagation() } }} onDrop={event => { void drop(event) }}>
    <header><div className="agent-folder-heading"><span className="agent-folder-heading-icon"><FolderOpen size={23} /></span><div><h2 id="agent-folder-title">Lampirkan isi folder</h2><p id="agent-folder-description">Periksa file pilihan sebelum ditambahkan ke chat.</p></div></div><button className="icon-button" type="button" onClick={onClose} aria-label="Tutup lampiran folder"><X size={20} /></button></header>
    <div className="agent-folder-body">
      <div className={`agent-folder-dropzone${dragging ? ' is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}>
        {reading ? <LoaderCircle size={30} className="spin" /> : <FolderOpen size={32} />}<strong>{reading ? 'Membaca isi folder…' : 'Seret folder ke sini'}</strong>
        <span>Gambar dan PDF di dalam subfolder juga ikut terbaca.</span><small>Maks. {available} file lagi · Gambar total {limits.maxImageBytes / (1024 * 1024)} MB · File {limits.maxFileBytes / (1024 * 1024)} MB</small>
      </div>
      <div className="agent-folder-file-option"><span>Atau pilih gambar/PDF satu per satu</span><button className="button button-secondary" type="button" disabled={reading || disabled} onClick={() => fileRef.current?.click()}><Upload size={15} />Pilih file</button></div>
      <input ref={fileRef} hidden type="file" multiple accept={AGENT_ATTACHMENT_ACCEPT} onChange={event => { const next = Array.from(event.currentTarget.files ?? []); if (next.length) stage(next, 'files'); event.currentTarget.value = '' }} />
      {inspected.files.length > 0 && <section className="agent-folder-selection" aria-label="File dari folder yang dipilih">
        <div className="agent-folder-selection-heading"><div><strong>{inspected.folderName ? `Folder ${inspected.folderName}` : 'File pilihan'}</strong><small>{inspected.files.length} gambar/PDF ditemukan</small></div><label><input type="checkbox" checked={selected.length === inspected.files.length} disabled={reading || disabled} onChange={event => setChecked(event.target.checked ? new Set(inspected.files) : new Set())} />Pilih semua</label></div>
        <ul>{inspected.files.map((file, index) => <li key={`${file.webkitRelativePath || file.name}:${index}`}><label><input type="checkbox" checked={checked.has(file)} disabled={reading || disabled} onChange={event => setChecked(current => { const next = new Set(current); if (event.target.checked) next.add(file); else next.delete(file); return next })} />
          <span className="agent-folder-file-icon">{agentAttachmentMime(file)?.startsWith('image/') ? <FileImage size={19} /> : <FileText size={19} />}</span><span className="agent-folder-file-copy"><strong>{file.name}</strong><small>{file.webkitRelativePath || 'Gambar/PDF pilihan'}</small></span><span className="agent-folder-file-size">{size(file.size)}</span></label></li>)}</ul>
      </section>}
      {inspected.skipped.length > 0 && <p className="agent-folder-note">{inspected.skipped.length} file tidak didukung dilewati: {inspected.skipped.slice(0, 3).join(', ')}{inspected.skipped.length > 3 ? ', …' : ''}.</p>}
      {(error || validation) && <p className="agent-folder-error" role="alert">{error || validation}</p>}
    </div>
    <footer><span>{selected.length ? `${selected.length} file dipilih · ${size(total)}` : 'Belum ada file dipilih'}<small>Periksa pilihan, lalu tambahkan ke chat.</small></span><div><button type="button" className="button button-secondary" onClick={onClose}>Batal</button><button type="button" className="button button-primary" disabled={disabled || reading || !selected.length || Boolean(error || validation)} onClick={() => onAttach(plan.files, source)}>{reading ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}Tambahkan ke chat{selected.length ? ` (${selected.length})` : ''}</button></div></footer>
  </dialog>
}
