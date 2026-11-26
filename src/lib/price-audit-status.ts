const rangeStatus: Record<string, string> = {
  'Cocok': 'Masih dalam batas range acuan',
  'Tidak cocok': 'Di luar range acuan',
  'Belum dapat diperiksa': 'Perlu diperhatikan',
}

/** Also normalizes saved marketplace reports when displayed or exported again. */
export function marketplaceStatusLabel(value: string): string {
  return rangeStatus[value] ?? value
}

export function marketplaceStatusCell(column: string, value: string | number | null) {
  return /^(?:status|hasil)\s+pemeriksaan$/i.test(column.trim()) && typeof value === 'string' ? marketplaceStatusLabel(value) : value
}
