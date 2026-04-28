import Link from 'next/link'
import { formatRelativeDate } from '@/lib/utils'
import { CategoryBadge } from '@/components/ui/CategoryBadge'
import type { Article } from '@/types'

interface ArticleCardProps {
  article: Article
  showSummary?: boolean
}

export function ArticleCard({ article, showSummary = true }: ArticleCardProps) {
  return (
    <Link
      href={`/articles/${article.slug}`}
      className="card group block p-5 transition-all duration-200 hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <CategoryBadge category={article.category} />
        <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          {formatRelativeDate(article.updated_at)}
        </span>
      </div>

      <h3 className="text-base font-semibold leading-snug mb-2 group-hover:text-bio-400 transition-colors"
        style={{ color: 'var(--color-text-primary)' }}>
        {article.title}
      </h3>

      {showSummary && (
        <p className="text-sm leading-relaxed line-clamp-2 mb-4"
          style={{ color: 'var(--color-text-secondary)' }}>
          {article.summary}
        </p>
      )}

      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span className="flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-bio-400" />
          {article.papers_count} papers
        </span>
        <span>·</span>
        <span>AI-generated</span>
      </div>
    </Link>
  )
}
