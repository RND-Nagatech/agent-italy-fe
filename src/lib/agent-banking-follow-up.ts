import { isBankingQuery } from './banking.ts'
import { agentSourceLabels, mentionsAgentSource } from './agent-report-scope.ts'
import type { AgentChatMessage, AgentSourceSummary } from './types.ts'

/**
 * Rebuilds a banking prompt only when the immediately previous user message
 * was also a banking question. Older messages are deliberately ignored so a
 * stock follow-up cannot inherit a stale transfer context.
 */
export function bankingFollowUpPrompt(
  value: string,
  messages: AgentChatMessage[],
  sources: AgentSourceSummary[],
) {
  if (isBankingQuery(value) || !/\b(?:kalau|kalo|klo|terus|untuk|sekarang|yang)\b/i.test(value)) return null
  const mentionedSources = sources.filter(source => mentionsAgentSource(value, source))
  if (mentionedSources.length !== 1) return null

  const previousUserPrompt = [...messages].reverse().find(message => message.role === 'user')?.content
  if (!previousUserPrompt || !isBankingQuery(previousUserPrompt)) return null

  let prompt = previousUserPrompt
  const labels = sources.flatMap(agentSourceLabels).sort((left, right) => right.length - left.length)
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    prompt = prompt.replace(new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'gi'), '$1 ')
  }
  const source = mentionedSources[0]
  return `${prompt.replace(/\s+/g, ' ').trim()} Toko yang diminta: ${source.alias} (${source.branchId}).`
}
