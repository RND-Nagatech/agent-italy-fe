export const AGENT_ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.gif,.webp,application/pdf,image/jpeg,image/png,image/gif,image/webp'
export type AgentAttachmentSource = 'files' | 'folder'
type PendingFile = { mime: string; size: number }
export type AgentAttachmentLimits = { maxFiles: number; maxFileBytes: number; maxImageBytes: number }

const mimeByExtension: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
}
export function agentAttachmentMime(file: Pick<File, 'name'>): string | null {
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
  return Object.hasOwn(mimeByExtension, extension) ? mimeByExtension[extension] : null
}

export function inspectAgentAttachments(input: readonly File[], source: AgentAttachmentSource) {
  const skipped: string[] = []
  const files = input.filter(file => {
    if (source === 'folder' && (file.webkitRelativePath || file.name).split(/[\\/]/).some(part => part.startsWith('.') || part === '__MACOSX')) return false
    if (agentAttachmentMime(file)) return true
    skipped.push(file.webkitRelativePath || file.name)
    return false
  })
  const roots = [...new Set(input.map(file => file.webkitRelativePath?.split('/')[0]).filter(Boolean))]
  const folderName = source === 'folder' ? roots.length === 1 ? roots[0]! : 'pilihan' : null
  if (source === 'folder') files.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, 'id', { numeric: true }))
  return { files, skipped, folderName }
}

/** Validate the whole selection before uploading any part of a folder. */
export function planAgentAttachments(input: readonly File[], source: AgentAttachmentSource, pending: readonly PendingFile[], limits: AgentAttachmentLimits) {
  const { files, skipped, folderName } = inspectAgentAttachments(input, source)
  const fail = (error: string) => ({ files: [] as File[], skipped, folderName, error })
  if (source === 'files' && skipped.length) return fail('Format didukung: PDF, JPG, PNG, GIF, dan WebP.')
  if (!files.length) return fail(source === 'folder' ? 'Folder ini tidak berisi gambar atau PDF yang didukung.' : 'Pilih gambar atau PDF untuk dilampirkan.')
  if (pending.length + files.length > limits.maxFiles) return fail(`Pilihan ini berisi ${files.length} file yang didukung. Maksimal ${limits.maxFiles} lampiran dalam satu pertanyaan${pending.length ? `; sudah ada ${pending.length} lampiran` : ''}. Tidak ada file baru yang diunggah.`)
  if (files.some(file => !file.size || file.size > limits.maxFileBytes)) return fail(`Setiap file harus berisi data dan berukuran maksimal ${limits.maxFileBytes / (1024 * 1024)} MB. Tidak ada file baru yang diunggah.`)
  const imageBytes = pending.filter(file => file.mime.startsWith('image/')).reduce((sum, file) => sum + file.size, 0)
    + files.filter(file => agentAttachmentMime(file)?.startsWith('image/')).reduce((sum, file) => sum + file.size, 0)
  if (imageBytes > limits.maxImageBytes) return fail(`Total ukuran gambar maksimal ${limits.maxImageBytes / (1024 * 1024)} MB dalam satu pertanyaan. Tidak ada file baru yang diunggah.`)
  return { files, skipped, folderName, error: null }
}
