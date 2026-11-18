export type BaselineItem = { branchId: string; jenisCode: string; baselinePcs: number; active: boolean; note: string }
export type BaselineCatalog = { branches: Array<{ branchId: string; alias: string; active: boolean }>; availableJenis: Array<{ kode: string; nama: string }> }
export type BaselineListing = BaselineCatalog & { revision: number; items: BaselineItem[]; updatedAt: string | null; catalogWarning: string | null }

export function parseBaselineCsv(text: string, catalog: BaselineCatalog): BaselineItem[] {
  const normalized = text.replace(/^\uFEFF/, '')
  const firstLine = normalized.split(/\r?\n/)[0] ?? ''
  const separator = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ','
  const cells: string[][] = [], row: string[] = []
  let field = '', quoted = false
  for (let index = 0; index <= normalized.length; index++) {
    const character = normalized[index]
    if (character === '"') {
      if (quoted && normalized[index + 1] === '"') { field += '"'; index++ } else quoted = !quoted
    } else if ((character === separator || character === '\n' || character === undefined) && !quoted) {
      row.push(field.replace(/\r$/, '').trim()); field = ''
      if (character !== separator) { if (row.some(Boolean)) cells.push([...row]); row.length = 0 }
    } else if (character !== undefined) field += character
  }
  if (quoted) throw new Error('Tanda kutip CSV belum ditutup.')
  const headers = cells.shift()?.map(value => value.toLowerCase().replace(/[ _-]/g, '')) ?? []
  const column = (...names: string[]) => headers.findIndex(header => names.includes(header))
  const branchCol = column('branchid', 'cabang'), jenisCol = column('jeniscode', 'jenis', 'kodejenis'), pcsCol = column('baselinepcs', 'patokan', 'pcs')
  const noteCol = column('note', 'catatan'), activeCol = column('active', 'aktif')
  if ([branchCol, jenisCol, pcsCol].some(index => index < 0)) throw new Error('Header wajib: cabang, jenis, patokan. Kolom aktif dan catatan opsional.')
  if (!cells.length || cells.length > 500) throw new Error('Impor harus berisi 1–500 baris per penyimpanan.')
  const aliases = (text: string) => text.toUpperCase().replace(/^PANTES\s+/, '').replace(/[^A-Z0-9]/g, '')
  const seen = new Set<string>()
  return cells.map((values, index) => {
    const rawBranch = values[branchCol] ?? ''
    const exact = catalog.branches.find(branch => branch.branchId.toLowerCase() === rawBranch.toLowerCase())
    const matches = exact ? [exact] : catalog.branches.filter(branch => aliases(branch.alias) === aliases(rawBranch))
    const jenis = catalog.availableJenis.find(item => item.kode.toLowerCase() === values[jenisCol]?.toLowerCase())
    const rawPcs = values[pcsCol] ?? ''
    if (matches.length !== 1 || !jenis) throw new Error(`Baris ${index + 2}: cabang/Jenis tidak dikenal atau alias ambigu. Gunakan kode dari aplikasi.`)
    if (!/^\d+$/.test(rawPcs) || Number(rawPcs) > 1_000_000) throw new Error(`Baris ${index + 2}: patokan harus pcs bulat 0–1.000.000 tanpa pemisah ribuan.`)
    const activeText = activeCol >= 0 ? values[activeCol]?.toLowerCase() : 'true'
    if (!['true', 'false', '1', '0', 'ya', 'tidak', ''].includes(activeText ?? '')) throw new Error(`Baris ${index + 2}: aktif harus true/false.`)
    const item = { branchId: matches[0].branchId, jenisCode: jenis.kode, baselinePcs: Number(rawPcs), active: !['false', '0', 'tidak'].includes(activeText ?? ''), note: noteCol >= 0 ? values[noteCol] ?? '' : '' }
    const key = JSON.stringify([item.branchId, item.jenisCode])
    if (seen.has(key)) throw new Error(`Baris ${index + 2}: pasangan ${item.branchId}/${item.jenisCode} duplikat.`)
    if (item.note.length > 300) throw new Error(`Baris ${index + 2}: catatan maksimal 300 karakter.`)
    seen.add(key)
    return item
  })
}
