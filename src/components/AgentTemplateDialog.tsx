import { useEffect, useRef } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import { CardHeading } from './CardHeading'
import './AgentTemplateDialog.css'

type Template = { label: string; prompt: string }
export function AgentTemplateDialog({ group, disabled, onSelect, onClose }: {
  group: { title: string; templates: Template[] }; disabled: boolean
  onSelect: (prompt: string) => void; onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => { dialog.close(); document.body.style.overflow = overflow; if (focus?.isConnected) focus.focus() }
  }, [])
  return <dialog ref={ref} className="agent-template-dialog" aria-labelledby="agent-template-dialog-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <header><div><CardHeading id="agent-template-dialog-title">{group.title}</CardHeading><p>Pilih pertanyaan untuk langsung dikirim ke percakapan aktif.</p></div><button type="button" className="icon-button" aria-label="Tutup pilihan template" onClick={onClose}><X size={19} /></button></header>
    <div className="agent-template-dialog-options">{group.templates.map(template => <button key={template.label} type="button" disabled={disabled} onClick={() => onSelect(template.prompt)}><span><strong>{template.label}</strong><small>{template.prompt}</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}</div>
    {disabled && <p className="agent-template-dialog-note" role="status">Template dapat dikirim setelah Agent siap dan proses percakapan selesai.</p>}
    <footer><span>{group.templates.length} template tersedia</span><button className="button button-secondary" type="button" onClick={onClose}>Tutup</button></footer>
  </dialog>
}
