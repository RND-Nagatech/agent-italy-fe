export type ReleasablePayment = {
  merchantRef: string | null
  method: 'qris' | 'va'
  status: string
  qrData: string | null
  canRelease?: boolean
  releasedAt?: string | null
}

export function canReleasePayment(payment: ReleasablePayment | null): boolean {
  return !!payment?.merchantRef && payment.method === 'qris'
    && ['needs_review', 'failed'].includes(payment.status)
    && payment.canRelease === true && !payment.qrData && !payment.releasedAt
}

// A failed network response does not establish whether release reached the gateway.
export async function releaseAndVerify<T extends ReleasablePayment>(
  payment: T,
  send: (path: string, options?: { method: string }) => Promise<T>,
  onLatest?: (payment: T) => void,
): Promise<T> {
  if (!canReleasePayment(payment)) throw new Error('Pembayaran ini tidak memenuhi syarat pelepasan QRIS.')
  const path = `/agent-usage/topups/${encodeURIComponent(payment.merchantRef!)}`
  let result: T
  try {
    result = await send(`${path}/release`, { method: 'POST' })
  } catch (originalError) {
    try {
      const latest = await send(path)
      onLatest?.(latest)
      if (latest.status === 'paid' || latest.releasedAt) return latest
    } catch { /* Keep the original failure when status verification is unavailable. */ }
    throw originalError
  }
  if (result.status !== 'paid' && !result.releasedAt) {
    throw new Error('Pelepasan belum terkonfirmasi. Perbarui status sebelum membuat pembayaran baru.')
  }
  return result
}
