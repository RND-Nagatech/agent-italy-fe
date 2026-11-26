import assert from 'node:assert/strict'
import test from 'node:test'
import { bankingFollowUpPrompt } from '../src/lib/agent-banking-follow-up.ts'
import type { AgentChatMessage, AgentSourceSummary } from '../src/lib/types.ts'

const sources: AgentSourceSummary[] = [
  { alias: 'ITALY PUSAT (ITY)', branchId: 'ITY', sourceType: 'central' },
  { alias: 'ITALY OTISTA (IT2)', branchId: 'IT2', sourceType: 'branch' },
]

const userMessage = (content: string): AgentChatMessage => ({ role: 'user', content })

test('does not reuse an old banking prompt after a stock question', () => {
  const messages = [
    userMessage('penjualan transfer tanggal 12'),
    { role: 'assistant', content: 'Laporan transfer.' } satisfies AgentChatMessage,
    userMessage('jumlah stock saat ini'),
  ]

  assert.equal(bankingFollowUpPrompt('kalo italy pusat', messages, sources), null)
})

test('keeps a direct banking follow-up tied to the immediately previous question', () => {
  const messages = [userMessage('penjualan transfer tanggal 12')]

  assert.equal(
    bankingFollowUpPrompt('kalo italy pusat', messages, sources),
    'penjualan transfer tanggal 12 Toko yang diminta: ITALY PUSAT (ITY) (ITY).',
  )
})

test('does not reinterpret an already banking question as a follow-up', () => {
  const messages = [userMessage('jumlah stock saat ini')]

  assert.equal(bankingFollowUpPrompt('penjualan transfer italy pusat', messages, sources), null)
})
