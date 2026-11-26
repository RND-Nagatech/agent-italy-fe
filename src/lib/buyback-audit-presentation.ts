/** Keep saved audit explanations readable without exposing database names. */
export function buybackAuditExplanation(value: string): string {
  return value
    .replace(/Barang tidak ditemukan di master Mongo\s*DB maupun Maria\s*DB; kode intern belum diketahui/gi, 'Kode intern barang belum diketahui')
    .replace(/Barcode ditemukan pada beberapa barang di Maria\s*DB; kode intern tidak dipilih dengan menebak/gi, 'Barcode ditemukan pada beberapa data barang; kode intern belum dapat dipastikan')
    .replace(/Kode intern barang lama di Maria\s*DB kosong atau belum dapat dibaca/gi, 'Kode intern barang lama kosong atau belum dapat dibaca')
    .replace(/Barang tidak ditemukan di Mongo\s*DB; koneksi Maria\s*DB untuk barang lama belum dikonfigurasi/gi, 'Pencarian data barang lama belum tersedia; kode intern belum diketahui')
    .replace(/Pencarian barang lama di Maria\s*DB belum dapat dibaca; kode intern belum diketahui/gi, 'Data barang lama belum dapat diperiksa; kode intern belum diketahui')
}
