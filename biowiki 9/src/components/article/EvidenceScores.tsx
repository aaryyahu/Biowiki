import { cn, evidenceColor, evidenceLabel } from '@/lib/utils'
import type { EvidenceScore } from '@/types'

interface EvidenceBarProps {
  score: EvidenceScore
  className?: string
}

export function EvidenceBar({ score, className }: EvidenceBarProps) {
  const pct = (score.score / 10) * 100
  const color = evidenceColor(score.score)
  const label = evidenceLabel(score.score)

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {score.dimension}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
          <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
            {score.score.toFixed(1)}
          </span>
        </div>
      </div>
      <div className="evidence-bar">
        <div
          className={cn('evidence-fill', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {score.reasoning && (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          {score.reasoning}
        </p>
      )}
    </div>
  )
}

interface EvidenceScoresProps {
  scores: EvidenceScore[]
  className?: string
}

export function EvidenceScores({ scores, className }: EvidenceScoresProps) {
  if (!scores.length) return null

  return (
    <div className={cn('space-y-4', className)}>
      {scores.map((score) => (
        <EvidenceBar key={score.id} score={score} />
      ))}
    </div>
  )
}
