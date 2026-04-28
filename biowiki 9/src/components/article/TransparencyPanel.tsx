import { formatDate } from '@/lib/utils'
import type { Article } from '@/types'

interface TransparencyPanelProps {
  article: Article
}

export function TransparencyPanel({ article }: TransparencyPanelProps) {
  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
    >
      {/* AI badge */}
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-bio-400 animate-pulse" />
        <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
          AI-generated content
        </span>
      </div>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        This article was autonomously synthesized by Claude from peer-reviewed research.
        All claims are grounded in the cited papers below.
      </p>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Stat label="Source papers" value={String(article.papers_count)} />
        <Stat label="Model" value={article.generation_model} />
        <Stat label="Generated" value={formatDate(article.updated_at)} />
        <Stat
          label="Verified"
          value={article.hallucination_check_passed === true ? 'Passed' : article.hallucination_check_passed === false ? 'Failed' : 'Pending'}
          accent={article.hallucination_check_passed === true}
        />
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs mb-0.5" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
      <div
        className="text-xs font-medium"
        style={{ color: accent ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
      >
        {value}
      </div>
    </div>
  )
}
