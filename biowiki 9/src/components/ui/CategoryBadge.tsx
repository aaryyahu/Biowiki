import { cn } from '@/lib/utils'
import { CATEGORY_COLORS, CATEGORY_LABELS, type ArticleCategory } from '@/types'

interface CategoryBadgeProps {
  category: ArticleCategory
  className?: string
}

export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  return (
    <span className={cn('badge', CATEGORY_COLORS[category], className)}>
      {CATEGORY_LABELS[category]}
    </span>
  )
}
