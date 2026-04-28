import { Nav } from '@/components/layout/Nav'
import { ArticleCard } from '@/components/article/ArticleCard'
import { createClient } from '@/lib/supabase/server'
import { CATEGORY_LABELS, type ArticleCategory } from '@/types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Articles' }

interface PageProps {
  searchParams: { category?: string; q?: string }
}

export default async function ArticlesPage({ searchParams }: PageProps) {
  const supabase = createClient()
  const category = searchParams.category as ArticleCategory | undefined

  let query = supabase
    .from('articles')
    .select('*')
    .eq('status', 'published')
    .order('updated_at', { ascending: false })

  if (category) {
    query = query.eq('category', category)
  }

  const { data: articles } = await query

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
            {category ? CATEGORY_LABELS[category] : 'All articles'}
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {articles?.length ?? 0} articles synthesized from peer-reviewed research
          </p>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 flex-wrap mb-8">
          <a
            href="/articles"
            className={`badge text-xs px-3 py-1.5 rounded-full border transition-colors ${
              !category
                ? 'bg-bio-400 text-white border-bio-400'
                : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)]'
            }`}
          >
            All
          </a>
          {(Object.keys(CATEGORY_LABELS) as ArticleCategory[]).map((cat) => (
            <a
              key={cat}
              href={`/articles?category=${cat}`}
              className={`badge text-xs px-3 py-1.5 rounded-full border transition-colors ${
                category === cat
                  ? 'bg-bio-400 text-white border-bio-400'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)]'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </a>
          ))}
        </div>

        {articles && articles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-4xl mb-4">🔬</div>
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
              No articles yet{category ? ` in ${CATEGORY_LABELS[category]}` : ''}.
            </p>
            <a href="/request" className="btn-primary text-sm px-4 py-2">
              Request a topic
            </a>
          </div>
        )}
      </main>
    </div>
  )
}
