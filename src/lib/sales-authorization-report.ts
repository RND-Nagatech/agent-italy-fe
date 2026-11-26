/** Match the existing authorization table shape, including reports saved before Excel export was added. */
export function isSalesAuthorizationTable(columns: string[]): boolean {
  const labels = new Set(columns.map(column => column.trim().toLocaleLowerCase('id-ID')))
  return ['tanggal', 'no. faktur', 'barcode', 'keterangan', 'deskripsi', 'berat awal (gram)', 'berat (gram)', 'input oleh']
    .every(label => labels.has(label))
}
