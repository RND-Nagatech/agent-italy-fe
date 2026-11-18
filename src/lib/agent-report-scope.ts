import type { AgentSourceSummary } from './types'

type ReportSource = Pick<AgentSourceSummary, 'alias' | 'branchId'>

function normalizeScopeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function agentSourceLabels(source: ReportSource) {
  const shortAlias = source.alias.replace(/^ITALY\s+/i, '').replace(/\s*\([^)]*\)\s*$/, '').trim()
  return [...new Set([source.alias, source.branchId, shortAlias, source.alias.replace(/^ITALY\s+/i, '').trim()].filter(Boolean))]
}

export function mentionsAgentSource(value: string, source: ReportSource) {
  const normalized = ` ${normalizeScopeText(value)} `
  return agentSourceLabels(source).some(label => {
    const normalizedLabel = normalizeScopeText(label)
    // The brand alone does not identify a store; short codes must match a whole word.
    return Boolean(normalizedLabel) && !/^(?:italy|pantes)$/.test(normalizedLabel)
      && normalized.includes(` ${normalizedLabel} `)
  })
}

export function resolveAgentReportScope(value: string, sources: readonly ReportSource[]) {
  if (!/(penjualan|pembelian|otorisasi|marketplace|rongsok|transaksi|login|transfer|debit|debet|credit|non cash|non-cash|harga online|laporan|\bdata\b|pengiriman|penerimaan)/i.test(value)) return null

  const hasDate = /(hari ini|kemarin|tadi|sekarang|bulan ini|bulan lalu|minggu ini|minggu lalu|tahun ini|tahun lalu|tanggal|tgl|s\/d|sd|hingga|sampai|januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)/i.test(value)
    || /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/.test(value)
  const allSources = /\b(?:semua|seluruh)\s+(?:toko|cabang|sumber)\b/i.test(normalizeScopeText(value))
  return {
    needsDate: !hasDate,
    needsSource: !allSources && !sources.some(source => mentionsAgentSource(value, source)),
  }
}
