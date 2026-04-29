import { NextResponse }         from 'next/server'
import { createAdminClient }    from '@/lib/supabase/server'
import { runIngestionPipeline } from '@/lib/pipeline/orchestrator'
import type { ArticleCategory } from '@/types'

export const maxDuration = 300

interface StaleArticle {
  id: string
  topic: string
  category: string
  slug: string
  title: string
}

export async function GET(request: Request) {
  const CRON_SECRET = process.env.CRON_SECRET
  const authHeader  = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const REFRESH_DAYS = 7
  const MAX_PER_RUN  = 5

  const supabase   = createAdminClient()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - REFRESH_DAYS)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: staleArticles, error } = await (supabase as any)
    .from('articles')
    .select('id, topic, category, slug, title')
    .eq('status', 'published')
    .lt('updated_at', cutoffDate.toISOString())
    .order('updated_at', { ascending: true })
    .limit(MAX_PER_RUN) as { data: StaleArticle[] | null; error: unknown }

  if (error) {
    console.error('[cron] Failed to fetch stale articles')
    return NextResponse.json({ error: 'Failed to fetch articles' }, { status: 500 })
  }

  if (!staleArticles?.length) {
    return NextResponse.json({ message: 'No stale articles', refreshed: 0 })
  }

  console.log(`[cron] Refreshing ${staleArticles.length} articles`)

  const results: { topic: string; status: string; durationMs: number }[] = []

  for (const article of staleArticles) {
    const start = Date.now()
    try {
      const result = await runIngestionPipeline(
        article.topic,
        article.category as ArticleCategory,
        { maxPapers: 25, autoPublish: true, version: '1.0.0' },
      )
      results.push({ topic: article.topic, status: result.status, durationMs: result.durationMs })
    } catch (err) {
      results.push({ topic: article.topic, status: 'failed', durationMs: Date.now() - start })
      console.error(`[cron] ${article.topic} failed:`, err)
    }

    if (staleArticles.indexOf(article) < staleArticles.length - 1) {
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  const succeeded = results.filter(r => r.status === 'completed').length
  const failed    = results.filter(r => r.status === 'failed').length

  return NextResponse.json({
    message:   `Refreshed ${succeeded}/${results.length} articles (${failed} failed)`,
    refreshed: succeeded,
    failed,
    results,
  })
}
