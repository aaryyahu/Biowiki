import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Script from 'next/script'
import { Nav } from '@/components/layout/Nav'
import { CategoryBadge } from '@/components/ui/CategoryBadge'
import { EvidenceScores } from '@/components/article/EvidenceScores'
import { TransparencyPanel } from '@/components/article/TransparencyPanel'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'

interface PageProps {
  params: { slug: string }
}

async function getArticle(slug: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()
  return data
}

async function getEvidenceScores(articleId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('evidence_scores')
    .select('*')
    .eq('article_id', articleId)
    .order('score', { ascending: false })
  return data ?? []
}

async function getPapers(topic: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('papers')
    .select('id, title, authors, journal, published_year, doi')
    .eq('topic', topic)
    .order('citation_count', { ascending: false })
    .limit(20)
  return data ?? []
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const article = await getArticle(params.slug)
  if (!article) return { title: 'Not found' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://biowiki.app'

  return {
    title:       article.title,
    description: article.summary,
    openGraph: {
      title:       article.title,
      description: article.summary,
      url:         `${appUrl}/articles/${article.slug}`,
      type:        'article',
      publishedTime: article.created_at,
      modifiedTime:  article.updated_at,
    },
    alternates: {
      canonical: `${appUrl}/articles/${article.slug}`,
    },
  }
}

export default async function ArticlePage({ params }: PageProps) {
  const article = await getArticle(params.slug)
  if (!article) notFound()

  const [scores, papers] = await Promise.all([
    getEvidenceScores(article.id),
    getPapers(article.topic),
  ])

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://biowiki.app'

  // JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type':    'MedicalWebPage',
    name:       article.title,
    description: article.summary,
    url:         `${appUrl}/articles/${article.slug}`,
    datePublished: article.created_at,
    dateModified:  article.updated_at,
    publisher: {
      '@type': 'Organization',
      name:    'BioWiki',
      url:     appUrl,
    },
    citation: papers.slice(0, 5).map(p => ({
      '@type':  'ScholarlyArticle',
      name:     p.title,
      author:   p.authors?.slice(0, 3).map(a => ({ '@type': 'Person', name: a })),
      isPartOf: p.journal ? { '@type': 'Periodical', name: p.journal } : undefined,
      datePublished: p.published_year ? String(p.published_year) : undefined,
      identifier:    p.doi ? `https://doi.org/${p.doi}` : undefined,
    })),
    about: {
      '@type': 'MedicalCondition',
      name:    article.topic,
    },
    reviewedBy: {
      '@type': 'SoftwareApplication',
      name:    'Claude AI',
      url:     'https://anthropic.com',
    },
  }

  return (
    <div className="min-h-screen">
      <Script
        id="article-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-10">

          {/* Article body */}
          <article>
            <header className="mb-8">
              <CategoryBadge category={article.category} className="mb-4" />
              <h1 className="text-3xl font-bold tracking-tight mb-3" style={{ color: 'var(--color-text-primary)' }}>
                {article.title}
              </h1>
              <p className="text-lg leading-relaxed mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                {article.summary}
              </p>
              <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                <span>Updated {formatDate(article.updated_at)}</span>
                <span>·</span>
                <span>{article.papers_count} source papers</span>
                <span>·</span>
                <span>AI-generated</span>
              </div>
            </header>

            <div
              className="article-content"
              dangerouslySetInnerHTML={{ __html: article.content }}
            />

            {/* References */}
            {papers.length > 0 && (
              <section className="mt-12 pt-8 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
                  References
                </h2>
                <ol className="space-y-3">
                  {papers.map((paper, i) => (
                    <li key={paper.id} className="flex gap-3 text-sm">
                      <span className="shrink-0 font-mono text-bio-400 text-xs mt-0.5">[{i + 1}]</span>
                      <div>
                        <span style={{ color: 'var(--color-text-secondary)' }}>{paper.title}.</span>
                        {paper.authors?.length > 0 && (
                          <span style={{ color: 'var(--color-text-muted)' }}>
                            {' '}{paper.authors.slice(0, 3).join(', ')}{paper.authors.length > 3 ? ' et al.' : ''}.
                          </span>
                        )}
                        {paper.journal && (
                          <span style={{ color: 'var(--color-text-muted)' }}> {paper.journal}.</span>
                        )}
                        {paper.published_year && (
                          <span style={{ color: 'var(--color-text-muted)' }}> {paper.published_year}.</span>
                        )}
                        {paper.doi && (
                          <a
                            href={`https://doi.org/${paper.doi}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 text-bio-400 hover:text-bio-300 text-xs"
                          >
                            DOI ↗
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </article>

          {/* Sidebar */}
          <aside className="space-y-6">
            <TransparencyPanel article={article} />
            {scores.length > 0 && (
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
                  Evidence strength
                </h3>
                <EvidenceScores scores={scores} />
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  )
}

export default async function ArticlePage({ params }: PageProps) {
  const article = await getArticle(params.slug)
  if (!article) notFound()
