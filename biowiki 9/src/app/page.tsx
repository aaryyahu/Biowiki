import Link from 'next/link'
import { Nav } from '@/components/layout/Nav'
import { ArticleCard } from '@/components/article/ArticleCard'
import { createClient } from '@/lib/supabase/server'
import { CATEGORY_LABELS, type ArticleCategory } from '@/types'

const CATEGORIES: { key: ArticleCategory; emoji: string; desc: string }[] = [
  { key: 'nootropics',      emoji: '🧠', desc: 'Cognitive enhancers & smart drugs' },
  { key: 'longevity',       emoji: '⏳', desc: 'Lifespan & healthspan extension' },
  { key: 'protocols',       emoji: '📋', desc: 'Evidence-based health protocols' },
  { key: 'quantified-self', emoji: '📈', desc: 'Tracking, wearables & data' },
  { key: 'microbiome',      emoji: '🦠', desc: 'Gut health & microbiota' },
  { key: 'genetics',        emoji: '🧬', desc: 'Genetic optimization & testing' },
]

async function getStats() {
  const supabase = createClient()
  const [articles, papers, runs] = await Promise.all([
    supabase.from('articles').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('papers').select('id', { count: 'exact', head: true }),
    supabase.from('pipeline_runs').select('completed_at').eq('status', 'completed').order('completed_at', { ascending: false }).limit(1),
  ])
  return {
    articleCount: articles.count ?? 0,
    paperCount: papers.count ?? 0,
    lastRun: runs.data?.[0]?.completed_at ?? null,
  }
}

async function getRecentArticles() {
  const supabase = createClient()
  const { data } = await supabase
    .from('articles')
    .select('*')
    .eq('status', 'published')
    .order('updated_at', { ascending: false })
    .limit(6)
  return data ?? []
}

export default async function HomePage() {
  const [stats, recentArticles] = await Promise.all([getStats(), getRecentArticles()])

  return (
    <div className="min-h-screen">
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="absolute inset-0 grid-bg opacity-60" />
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% -10%, rgba(29,158,117,0.12), transparent)'
        }} />
        <div className="relative mx-auto max-w-6xl px-4 py-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs mb-6"
            style={{ borderColor: 'rgba(29,158,117,0.3)', color: 'var(--color-text-secondary)', background: 'rgba(29,158,117,0.05)' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-bio-400 animate-pulse" />
            Updated continuously from peer-reviewed research
          </div>

          <h1 className="text-5xl font-bold tracking-tight mb-4" style={{ color: 'var(--color-text-primary)' }}>
            The AI-powered<br />
            <span className="text-bio-400">biohacking</span> knowledge base
          </h1>

          <p className="mx-auto max-w-xl text-lg leading-relaxed mb-8" style={{ color: 'var(--color-text-secondary)' }}>
            Every article synthesized from peer-reviewed papers by Claude AI.
            Evidence-graded, citation-backed, and continuously refreshed as new research is published.
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/articles" className="btn-primary px-6 py-2.5 text-sm">
              Browse articles
            </Link>
            <Link href="/ask" className="btn-secondary px-6 py-2.5 text-sm">
              Ask the wiki
            </Link>
          </div>

          {/* Stats */}
          <div className="mt-14 flex items-center justify-center gap-8 flex-wrap">
            {[
              { value: stats.articleCount.toLocaleString(), label: 'Articles generated' },
              { value: stats.paperCount.toLocaleString(),   label: 'Papers indexed' },
              { value: 'Claude',                            label: 'Synthesis model' },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="text-2xl font-bold text-bio-400">{value}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-lg font-semibold mb-6" style={{ color: 'var(--color-text-primary)' }}>
          Browse by category
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {CATEGORIES.map(({ key, emoji, desc }) => (
            <Link
              key={key}
              href={`/articles?category=${key}`}
              className="card group flex items-start gap-3 p-4 transition-all duration-200 hover:-translate-y-0.5"
            >
              <span className="text-xl shrink-0">{emoji}</span>
              <div>
                <div className="text-sm font-medium group-hover:text-bio-400 transition-colors"
                  style={{ color: 'var(--color-text-primary)' }}>
                  {CATEGORY_LABELS[key]}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent articles */}
      {recentArticles.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Recently generated
            </h2>
            <Link href="/articles" className="text-sm text-bio-400 hover:text-bio-300 transition-colors">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentArticles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t py-8 text-center text-xs" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
        BioWiki · AI-generated from peer-reviewed research · Not medical advice
      </footer>
    </div>
  )
}
