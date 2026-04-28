import Link                from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { formatRelativeDate } from '@/lib/utils'
import type { Metadata }   from 'next'

export const metadata: Metadata = { title: 'Dashboard' }
export const revalidate = 60

async function getAdminStats() {
  const supabase = createAdminClient()
  const [
    articlesRes, papersRes, findingsRes,
    embeddingsRes, runsRes, requestsRes,
  ] = await Promise.all([
    supabase.from('articles').select('id, status'),
    supabase.from('papers').select('id', { count: 'exact', head: true }),
    supabase.from('findings').select('id', { count: 'exact', head: true }),
    supabase.from('embeddings').select('article_id'),
    supabase.from('pipeline_runs').select('*').order('created_at', { ascending: false }).limit(10),
    supabase.from('topic_requests').select('id, status').eq('status', 'pending'),
  ])

  const articles    = articlesRes.data ?? []
  const embeddings  = embeddingsRes.data ?? []
  const embeddedIds = new Set(embeddings.map((e: { article_id: string }) => e.article_id))
  const published   = articles.filter((a: { status: string }) => a.status === 'published')

  return {
    articleTotal:     articles.length,
    articlePublished: published.length,
    articleDraft:     articles.filter((a: { status: string }) => a.status === 'draft').length,
    paperCount:       papersRes.count ?? 0,
    findingCount:     findingsRes.count ?? 0,
    embeddedCount:    embeddedIds.size,
    pendingRequests:  requestsRes.data?.length ?? 0,
    recentRuns:       runsRes.data ?? [],
  }
}

const STATUS_PILL: Record<string, string> = {
  completed: 'text-bio-400 bg-bio-400/10',
  running:   'text-amber-400 bg-amber-400/10',
  failed:    'text-red-400 bg-red-400/10',
  pending:   'text-[var(--color-text-muted)] bg-white/5',
}

export default async function AdminDashboard() {
  const stats = await getAdminStats()

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>System overview and pipeline status</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          { label: 'Published articles', value: stats.articlePublished, href: '/admin/articles' },
          { label: 'Draft articles',     value: stats.articleDraft,     href: '/admin/articles' },
          { label: 'Papers indexed',     value: stats.paperCount.toLocaleString(), href: null },
          { label: 'Findings extracted', value: stats.findingCount.toLocaleString(), href: null },
          { label: 'Articles embedded',  value: stats.embeddedCount,    href: null },
          { label: 'Embed coverage',     value: stats.articlePublished > 0 ? Math.round((stats.embeddedCount / stats.articlePublished) * 100) + '%' : '—', href: null },
          { label: 'Pending requests',   value: stats.pendingRequests,  href: '/admin/requests', accent: stats.pendingRequests > 0 },
          { label: 'Total articles',     value: stats.articleTotal,     href: '/admin/articles' },
        ] as { label: string; value: string | number; href: string | null; accent?: boolean }[]).map(({ label, value, href, accent }) => {
          const card = (
            <div className={`card p-4 ${href ? 'hover:border-bio-400/30 cursor-pointer' : ''} transition-colors`}>
              <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
              <div className={`text-2xl font-bold ${accent ? 'text-amber-400' : 'text-bio-400'}`}>{value}</div>
            </div>
          )
          return href ? <Link key={label} href={href}>{card}</Link> : <div key={label}>{card}</div>
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/admin/pipeline" className="btn-primary text-sm px-4 py-2">Run pipeline</Link>
        <Link href="/admin/requests" className="btn-secondary text-sm px-4 py-2">
          Review requests {stats.pendingRequests > 0 && `(${stats.pendingRequests})`}
        </Link>
        <Link href="/admin/articles" className="btn-secondary text-sm px-4 py-2">Browse articles</Link>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>Recent pipeline runs</h2>
        <div className="card overflow-hidden">
          {stats.recentRuns.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
              No pipeline runs yet.
            </div>
          ) : (
            <div className="divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
              {stats.recentRuns.map((run: {
                id: string; status: string; topic: string; papers_found: number;
                findings_extracted: number; error_message: string | null;
                started_at: string | null; completed_at: string | null; created_at: string;
              }) => {
                const duration = run.completed_at && run.started_at
                  ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
                  : null
                return (
                  <div key={run.id} className="flex items-center gap-4 px-5 py-3.5" style={{ borderColor: 'var(--color-border)' }}>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_PILL[run.status] ?? STATUS_PILL.pending}`}>
                      {run.status}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{run.topic}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        {run.papers_found} papers · {run.findings_extracted} findings
                        {run.error_message && <span className="text-red-400 ml-2">{run.error_message.slice(0, 60)}</span>}
                      </div>
                    </div>
                    {duration !== null && <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>{duration}s</span>}
                    <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>{formatRelativeDate(run.created_at)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
