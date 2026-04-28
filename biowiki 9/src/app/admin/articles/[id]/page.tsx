import { notFound }         from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { formatDate }        from '@/lib/utils'
import { CategoryBadge }     from '@/components/ui/CategoryBadge'
import { EvidenceScores }    from '@/components/article/EvidenceScores'
import AdminArticleActions   from './AdminArticleActions'

interface PageProps { params: { id: string } }

async function getArticle(id: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('articles')
    .select('*')
    .eq('id', id)
    .single()
  return data
}

async function getScores(articleId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('evidence_scores')
    .select('*')
    .eq('article_id', articleId)
    .order('score', { ascending: false })
  return data ?? []
}

async function getPapers(topic: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('papers')
    .select('id, title, authors, journal, published_year, doi, citation_count')
    .eq('topic', topic)
    .order('citation_count', { ascending: false })
    .limit(20)
  return data ?? []
}

export default async function AdminArticlePage({ params }: PageProps) {
  const article = await getArticle(params.id)
  if (!article) notFound()

  const [scores, papers] = await Promise.all([
    getScores(article.id),
    getPapers(article.topic),
  ])

  const statusColor = {
    draft:     'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    published: 'bg-bio-100 text-bio-800 dark:bg-bio-900/30 dark:text-bio-300',
    archived:  'bg-gray-100 text-gray-600',
  }[article.status]

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-6 mb-8">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <CategoryBadge category={article.category} />
            <span className={`badge ${statusColor}`}>{article.status}</span>
            {article.hallucination_check_passed === true  && (
              <span className="badge bg-bio-100 text-bio-800 dark:bg-bio-900/30 dark:text-bio-300">Guard passed</span>
            )}
            {article.hallucination_check_passed === false && (
              <span className="badge bg-amber-100 text-amber-800">Guard flagged</span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2" style={{ color: 'var(--color-text-primary)' }}>
            {article.title || <span style={{ color: 'var(--color-text-muted)' }}>Untitled draft</span>}
          </h1>
          {article.summary && (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {article.summary}
            </p>
          )}
          <div className="flex items-center gap-3 text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
            <span>Updated {formatDate(article.updated_at)}</span>
            <span>·</span>
            <span>{article.papers_count} papers</span>
            <span>·</span>
            <span>{article.generation_model}</span>
          </div>
        </div>

        {/* Actions */}
        <AdminArticleActions article={article} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-8">
        {/* Article content preview */}
        <div>
          {article.content ? (
            <div className="card p-6">
              <h2 className="text-sm font-medium mb-4" style={{ color: 'var(--color-text-muted)' }}>
                Article content preview
              </h2>
              <div
                className="article-content"
                dangerouslySetInnerHTML={{ __html: article.content }}
              />
            </div>
          ) : (
            <div className="card p-8 text-center">
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No content yet — run the pipeline with synthesis enabled.
              </p>
            </div>
          )}

          {/* References */}
          {papers.length > 0 && (
            <div className="card p-5 mt-4">
              <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-text-primary)' }}>
                Source papers ({papers.length})
              </h3>
              <ol className="space-y-2">
                {papers.map((p, i) => (
                  <li key={p.id} className="flex gap-3 text-xs">
                    <span className="shrink-0 font-mono text-bio-400 mt-0.5">[{i + 1}]</span>
                    <div>
                      <span style={{ color: 'var(--color-text-secondary)' }}>{p.title}.</span>
                      {p.authors?.length > 0 && (
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {' '}{p.authors.slice(0, 2).join(', ')}{p.authors.length > 2 ? ' et al.' : ''}.
                        </span>
                      )}
                      {p.journal && <span style={{ color: 'var(--color-text-muted)' }}> {p.journal}.</span>}
                      {p.published_year && <span style={{ color: 'var(--color-text-muted)' }}> {p.published_year}.</span>}
                      <span style={{ color: 'var(--color-text-muted)' }}> {p.citation_count} citations.</span>
                      {p.doi && (
                        <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noopener noreferrer"
                          className="ml-1 text-bio-400 hover:text-bio-300 text-xs">DOI ↗</a>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Meta */}
          <div className="card p-4">
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Article metadata
            </h3>
            <div className="space-y-2">
              {[
                { label: 'Topic',     value: article.topic },
                { label: 'Slug',      value: article.slug },
                { label: 'Model',     value: article.generation_model },
                { label: 'Version',   value: article.pipeline_version },
                { label: 'Papers',    value: String(article.papers_count) },
                { label: 'Created',   value: formatDate(article.created_at) },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-2 text-xs">
                  <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                  <span className="font-mono truncate max-w-[140px]" style={{ color: 'var(--color-text-secondary)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Evidence scores */}
          {scores.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-text-primary)' }}>
                Evidence scores
              </h3>
              <EvidenceScores scores={scores} />
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
