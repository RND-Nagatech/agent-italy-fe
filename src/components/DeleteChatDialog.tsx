import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Trash2 } from 'lucide-react'
export function DeleteChatDialog({ title, busy, error, onClose, onConfirm, allowForgetMemory = false }: { title: string; busy: boolean; error: string | null; onClose: () => void; onConfirm: (forget: boolean) => void; allowForgetMemory?: boolean }) {
  const [forgetMemories, setForgetMemories] = useState(false)
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
  return <dialog ref={ref} className="confirm-dialog agent-delete-dialog" aria-labelledby="delete-chat-title" aria-describedby="delete-chat-description" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="confirm-dialog-icon warning"><Trash2 size={21} /></div>
    <h2 id="delete-chat-title">Hapus riwayat chat?</h2>
    <p id="delete-chat-description">Percakapan <strong>{title}</strong> beserta seluruh pesan dan jawaban Agent akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.</p>
    {allowForgetMemory && <label className="delete-chat-memory-option"><input type="checkbox" checked={forgetMemories} disabled={busy} onChange={event => setForgetMemories(event.target.checked)} /><span>Hapus juga memory yang diajukan dari chat ini. Memory tersebut tidak lagi tersedia bagi semua pengguna.</span></label>}
    {error && <p className="agent-delete-error" role="alert">{error}</p>}
    <div className="confirm-dialog-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={onClose} autoFocus>Batal</button><button className="button agent-delete-confirm" type="button" disabled={busy} onClick={() => onConfirm(forgetMemories)}>{busy ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}{busy ? 'Menghapus…' : 'Hapus chat'}</button></div>
  </dialog>
}
