export type AgentDropEntry = {
  name: string; isFile: boolean; isDirectory: boolean
  file?: (resolve: (file: File) => void, reject: (error: unknown) => void) => void
  createReader?: () => { readEntries: (resolve: (entries: AgentDropEntry[]) => void, reject: (error: unknown) => void) => void }
}
export type AgentCapturedDrop = { entries: AgentDropEntry[]; files: File[]; source: 'files' | 'folder' }

/** Capture entries during the drop event; its data store cannot be read later. */
export function captureAgentDrop(data: Pick<DataTransfer, 'items' | 'files'>): AgentCapturedDrop {
  const entries: AgentDropEntry[] = [], files: File[] = []
  const items = Array.from(data.items).filter(item => item.kind === 'file')
  for (const item of items) {
    const compatible = item as DataTransferItem & { getAsEntry?: () => FileSystemEntry | null }
    const entry = (compatible.getAsEntry ?? compatible.webkitGetAsEntry)?.call(item)
    if (entry) entries.push(entry as unknown as AgentDropEntry)
    else { const file = item.getAsFile(); if (file) files.push(file) }
  }
  if (!items.length) files.push(...Array.from(data.files))
  return { entries, files, source: entries.some(entry => entry.isDirectory) ? 'folder' : 'files' }
}

/** Read every directory batch (Chromium can return only 100 entries at a time). */
export async function readAgentDrop(drop: AgentCapturedDrop, maxEntries = 2000): Promise<File[]> {
  const files = [...drop.files]
  let visited = files.length
  const hidden = (name: string) => name.startsWith('.') || name === '__MACOSX'
  const tooLarge = () => new Error('Folder terlalu besar untuk dibaca sekaligus. Seret folder yang lebih kecil berisi file acuan.')
  if (visited > maxEntries) throw tooLarge()
  const visit = async (entry: AgentDropEntry, parent: string) => {
    if (++visited > maxEntries) throw tooLarge()
    if (hidden(entry.name)) return
    const path = parent ? `${parent}/${entry.name}` : entry.name
    if (entry.isFile && entry.file) {
      const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject))
      // Keep the relative path local; FormData still sends the original basename.
      const local = new File([file], file.name, { type: file.type, lastModified: file.lastModified })
      if (parent) Object.defineProperty(local, 'webkitRelativePath', { value: path })
      files.push(local)
    } else if (entry.isDirectory && entry.createReader) {
      const reader = entry.createReader()
      while (true) {
        const entries = await new Promise<AgentDropEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
        if (!entries.length) break
        for (const child of entries) await visit(child, path)
      }
    } else throw new Error('Isi folder belum dapat dibaca. Coba seret folder kembali atau pilih file gambar/PDF.')
  }
  for (const entry of drop.entries) await visit(entry, '')
  return files
}
