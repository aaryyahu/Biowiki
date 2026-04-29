import Link              from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { formatRelativeDate } from '@/lib/utils'
import { CategoryBadge }  from '@/components/ui/CategoryBadge'
import type { Metadata }  from 'next'

export const metadata: Metadata = { title: 'Articles' }
export const revalidate = 0

interface ArticleRow {
  id: string
  slug: string
  title: string
  category: string
  status: string
  papers_count: number
  hallucination_check_passed: boolean | null
  updated_at: string
  created_at: string
}

async function getArticles(): Promise<ArticleRow[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('articles')
    .select('id, slug, title, category, status, papers_count, hallucination_check_passed, updated_at, created_at')
    .order('updated_at', { ascending: false })
  return (data ?? []) as ArticleRow[]
}

const STATUS_STYLES: Record<string, string> = {
  draft:     'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  published: 'bg-bio-100 text-bio-800 dark:bg-bio-900/30 dark:text-bio-300',
  archived:  'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

export default async function AdminArticlesPage() {
  const articles = await getArticles()
  const counts = {
    total:     articles.length,
    published: articles.filter((a: ArticleRow) => a.status === 'published').length,
    draft:     articles.filter((a: ArticleRow) => a.status === 'draft').length,
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Articles</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {counts.published} published · {counts.draft} draft · {counts.total} total
          </p>
        </div>
        <Link href="/admin/pipeline" className="btn-primary text-sm px-4 py-2">
          + Generate new
        </Link>
      </div>

      {articles.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
            No articles yet. Run the pipeline to generate your first one.
          </p>
          <Link href="/admin/pipeline" className="btn-primary text-sm px-4 py-2">
            Run pipeline
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '35%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '17%' }} />
            </colgroup>
            <thead>
              <tr className="border-b text-xs" style={{ borderColor: 'var(--color-border)' }}>
                {['Title', 'Category', 'Status', 'Papers', 'Guard', 'Updated'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--color-text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {articles.map((article: ArticleRow) => (
                <tr
                  key={article.id}
                  className="border-b transition-colors hover:bg-white/3"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/articles/${article.id}`}
                      className="font-medium hover:text-bio-400 transition-colors line-clamp-1 block"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {article.title || <span style={{ color: 'var(--color-text-muted)' }}>Untitled draft</span>}
                    </Link>
                    <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                      {article.slug}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <CategoryBadge category={article.category as any} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge text-xs ${STATUS_STYLES[article.status] ?? ''}`}>
                      {article.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                    {article.papers_count}
                  </td>
                  <td className="px-4 py-3">
                    {article.hallucination_check_passed === true  && <span className="text-xs text-bio-400">✓ passed</span>}
                    {article.hallucination_check_passed === false && <span className="text-xs text-amber-400">⚠ flagged</span>}
                    {article.hallucination_check_passed === null  && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {formatRelativeDate(article.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
