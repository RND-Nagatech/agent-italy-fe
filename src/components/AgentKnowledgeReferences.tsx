import '../pages/KnowledgePage.css'
import { BookOpen, Brain } from 'lucide-react'
import { Link } from 'react-router'
import type { AgentContextReferences } from '../lib/types'
export function AgentKnowledgeReferences({ knowledgeReferences = [], memoryReferences = [], contextWarnings = [], memoryProposal }: AgentContextReferences) {
  return <>
    {memoryProposal && <p className="agent-context-warning">Permintaan memory dicatat. Periksa status/persetujuan di <Link to="/knowledge?tab=memories">Memory bersama</Link>.</p>}
    {contextWarnings.map((warning, index) => <p key={index} className="agent-context-warning" role="status">{warning}</p>)}
    {(knowledgeReferences.length > 0 || memoryReferences.length > 0) && <details className="agent-knowledge-references"><summary><BookOpen size={15} />Referensi knowledge & memory</summary>
      {knowledgeReferences.map(ref => <div key={ref.chunkId}><Link to={`/knowledge?document=${encodeURIComponent(ref.documentId)}`}>{ref.title} · {ref.locationLabel || `halaman ${ref.page}`}</Link><p>{ref.excerpt}</p></div>)}
      {memoryReferences.map(ref => <div key={ref.id}><Link to="/knowledge?tab=memories"><Brain size={13} /> {ref.title} · memory bersama</Link></div>)}
    </details>}
  </>
}
