import Link            from 'next/link'
import { Nav }         from '@/components/layout/Nav'
import { ArticleCard } from '@/components/article/ArticleCard'
import { createClient } from '@/lib/supabase/server'
import { CATEGORY_LABELS, type ArticleCategory } from '@/types'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title:       'BioWiki — AI-powered biohacking research',
  description: 'Evidence-based articles on biohacking, longevity, and performance, synthesized from peer-reviewed research.',
}

export const revalidate = 3600

export default async function HomePage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any

  const { data: featuredArticles } = await supabase
    .from('articles')
    .select('*')
    .eq('status', 'published')
    .order('updated_at', { ascending: false })
    .limit(6)

  const articles = (featuredArticles ?? []) as Array<{
    id: string; title: string; slug: string; summary: string
    category: string; papers_count: number; updated_at: string
  }>

  const categories = Object.keys(CATEGORY_LABELS) as ArticleCategory[]

  return (
    <div className="min-h-screen">
      <Nav />
      <main>
        {/* Hero */}
        <section className="mx-auto max-w-4xl px-4 py-20 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6"
            style={{ color: 'var(--color-text-primary)' }}>
            Science-backed biohacking,<br />
            <span className="text-bio-400">synthesized by AI</span>
          </h1>
          <p className="text-lg max-w-2xl mx-auto mb-8"
            style={{ color: 'var(--color-text-secondary)' }}>
            Every article is generated from peer-reviewed research and updated weekly.
            No bro-science. No anecdotes. Just evidence.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/articles" className="btn-primary px-6 py-2.5">
              Browse articles
            </Link>
            <Link href="/ask" className="btn-secondary px-6 py-2.5">
              Ask anything
            </Link>
          </div>
        </section>

        {/* Categories */}
        <section className="mx-auto max-w-6xl px-4 pb-10">
          <div className="flex gap-2 flex-wrap justify-center">
            {categories.map(cat => (
              <Link key={cat} href={`/articles?category=${cat}`}
                className="badge text-xs px-3 py-1.5 rounded-full border transition-colors
                  border-[var(--color-border)] text-[var(--color-text-secondary)]
                  hover:border-bio-400 hover:text-bio-400">
                {CATEGORY_LABELS[cat]}
              </Link>
            ))}
          </div>
        </section>

        {/* Featured articles */}
        {articles.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 pb-20">
            <h2 className="text-lg font-semibold mb-6"
              style={{ color: 'var(--color-text-primary)' }}>
              Latest articles
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {articles.map(article => (
                <ArticleCard key={article.id} article={article as any} />
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link href="/articles" className="btn-secondary px-6 py-2.5">
                View all articles →
              </Link>
            </div>
          </section>
        )}

        {articles.length === 0 && (
          <section className="mx-auto max-w-6xl px-4 pb-20 text-center">
            <div className="card p-16">
              <div className="text-4xl mb-4">🔬</div>
              <p className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>
                No articles published yet.
              </p>
              <Link href="/request" className="btn-primary text-sm px-4 py-2 mt-4 inline-block">
                Request the first topic
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
