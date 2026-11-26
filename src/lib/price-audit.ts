export type PriceRule = {
  family: 'young' | 'old'; kind: 'sales' | 'buyback'; kadar: number | null; sourceCode: string;
  rate: number; maxRate: number | null; fee: number | null; feeType: 'nominal' | 'percent' | 'unknown'; condition: string; note: string;
  sourceRow?: string; printedKadar?: string; sourceLabel?: string;
}
export type PriceReferenceSection = { date: string; batch?: number | null; effectiveFrom?: string | null; complete: boolean; warnings: string[]; rows: PriceRule[] }
export type PriceReference = PriceReferenceSection & { id: string; filename: string; sections?: PriceReferenceSection[] }
export type PriceAuditSelection = {
  windows: Array<{ date: string; fromTime: string; toTime: string; attachmentIds: string[] }>
  toleranceRp: number; buybackRatesFinal: boolean
  buybackAutoBatch?: boolean
  salesAutoBatch?: boolean
  salesMarketplaceOnly?: boolean
  kadarOverrides: Array<{ referenceId: string; rowIndex: number; kadar: number }>
}
export type PriceAuditScope = {
  handled: boolean; needsTime?: boolean; needsDate?: boolean; dateConflict?: boolean
  buybackAutoBatch?: boolean
  salesAutoBatch?: boolean
  references?: PriceReference[]; windows?: PriceAuditSelection['windows']; selection?: PriceAuditSelection
}
export type PriceReadStatus = {
  id: string; status: 'queued' | 'reading' | 'complete' | 'error'; message: string
  elapsedMs: number; handled?: boolean; reference?: PriceReference
}
export function dailyPriceWindows(references: PriceReference[]): PriceAuditSelection['windows'] {
  const dates = [...new Set(references.map(ref => ref.date))]
  return dates.map(date => ({ date, fromTime: '00:00', toTime: '24:00', attachmentIds: [...new Set(references.filter(ref => ref.date === date).map(ref => ref.id))] }))
}
export const dailyBuybackWindows = dailyPriceWindows
type PriceReadRequest = <T>(path: string, options?: { method?: string; body?: string }) => Promise<T>
export async function readPriceAttachment(
  sessionId: string, attachmentId: string, request: PriceReadRequest,
  progress: (status: PriceReadStatus) => void = () => {},
  pause: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 1500)),
) {
  let state = await request<PriceReadStatus>('/agent/price-audit/reads', { method: 'POST', body: JSON.stringify({ sessionId, attachmentId }) })
  // Covers four PDF pages with bounded provider retries, plus time in the queue.
  const deadline = Date.now() + 20 * 60 * 1000
  while (state.status === 'queued' || state.status === 'reading') {
    progress(state)
    if (Date.now() >= deadline) throw new Error('Pembacaan belum selesai. Coba lagi untuk melanjutkan file yang sama.')
    await pause()
    state = await request<PriceReadStatus>(`/agent/price-audit/reads/${state.id}`)
  }
  progress(state)
  if (state.status === 'error') throw new Error(state.message)
  return state
}
export function shouldCheckPriceAttachments(text: string, count: number) {
  return count > 0 && !/\b(?:mutasi|rekening|bank|bca|bri|bni|mandiri)\b/i.test(text)
}
export async function resolveChatPriceScope(
  attachmentIds: string[],
  resolve: (ids: string[]) => Promise<PriceAuditScope>,
  progress: (completed: number, total: number) => void = () => {},
): Promise<PriceAuditScope> {
  let completed = 0
  const results: PriceAuditScope[] = []
  // Separate HTTP requests prevent several extraction calls accumulating
  // behind a single reverse-proxy timeout. Final composition reads the cache.
  for (let i = 0; i < attachmentIds.length; i += 2) {
    const batch = await Promise.allSettled(attachmentIds.slice(i, i + 2).map(async id => {
      try { return await resolve([id]) }
      finally { progress(++completed, attachmentIds.length) }
    }))
    const failed = batch.find(result => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
    results.push(...batch.filter((result): result is PromiseFulfilledResult<PriceAuditScope> => result.status === 'fulfilled').map(result => result.value))
  }
  if (!results.some(result => result.handled)) return { handled: false }
  if (results.some(result => !result.handled)) throw new Error('Pisahkan file harga penjualan/buyback dari lampiran lain. Semua lampiran tetap tersedia.')
  return attachmentIds.length === 1 ? results[0] : resolve(attachmentIds)
}
export function isPriceAuditQuery(text: string) {
  return /\b(?:cek|check|periksa|pemeriksaan|cocokkan|audit|validasi|rekonsiliasi)\b/i.test(text)
    && /\b(?:penjualan|marketplace|harga\s+online|buy\s*back|harga\s+emas)\b/i.test(text)
    && /\b(?:acuan|file|lampiran|data\s+saya|harga|buy\s*back)\b/i.test(text)
    && !/\b(?:mutasi|rekening|bank)\b/i.test(text)
}
