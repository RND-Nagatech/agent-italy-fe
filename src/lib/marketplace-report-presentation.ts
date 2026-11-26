/** Old saved reports retain the field; only its user-facing label changes. */
export function marketplaceColumnLabel(column: string): string {
  return /^lebih\s+bayar(?:\s*\(IDR\))?$/i.test(column.trim()) ? 'Pengembalian Kelebihan Pembayaran (IDR)' : column
}
