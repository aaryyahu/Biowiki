/**
 * Vercel cron job — weekly article refresh
 *
 * Triggered every Monday at 06:00 UTC by vercel.json.
 * Finds articles older than REFRESH_DAYS and re-runs the ingestion
 * pipeline for each to pick up newly published research.
 *
 * Steps per article:
 *   1. Re-ingest PubMed (may find new papers)
 *   2. Extract findings from any new papers
 *   3. Re-score evidence (updated with new findings)
 *   4. Re-synthesise article content
 *   5. Re-embed (so search reflects new content)
 *
 * Safety:
 *   - CRON_SECRET env var protects the endpoint from public access
 *   - Only published articles are refreshed (drafts are left alone)
 *   - Runs sequentially to stay within Vercel function timeout
 *   - Logs each refresh attempt to pipeline_runs
 */

import { NextResponse }         from 'next/server'
import { createAdminClient }    from '@/lib/supabase/server'
import { runIngestionPipeline } from '@/lib/pipeline/orchestrator'
import type { ArticleCategory } from '@/types'

const REFRESH_DAYS    = 7     // refresh articles older than this
const MAX_PER_RUN     = 5     // max articles to refresh per cron invocation
const CRON_SECRET     = process.env.CRON_SECRET

export const maxDuration = 300

export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this in the Authorization header)
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const supabase  = createAdminClient()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - REFRESH_DAYS)

  // Find published articles that haven't been updated recently
  const { data: staleArticles, error } = await supabase
    .from('articles')
    .select('id, topic, category, slug, title')
    .eq('status', 'published')
    .lt('updated_at', cutoffDate.toISOString())
    .order('updated_at', { ascending: true })  // oldest first
    .limit(MAX_PER_RUN)

  if (error) {
    console.error('[cron] Failed to fetch stale articles:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!staleArticles?.length) {
    console.log('[cron] No stale articles to refresh')
    return NextResponse.json({ message: 'No stale articles', refreshed: 0 })
  }

  console.log(`[cron] Refreshing ${staleArticles.length} articles`)

  const results: {
    topic:   string
    status:  string
    durationMs: number
  }[] = []

  for (const article of staleArticles) {
    console.log(`[cron] Refreshing: ${article.topic}`)
    const start = Date.now()

    try {
      const result = await runIngestionPipeline(
        article.topic,
        article.category as ArticleCategory,
        {
          maxPapers:    25,
          autoPublish:  true,   // keep published status
          skipEnrich:   false,
          skipExtract:  false,
          skipScore:    false,
          skipSynthesis: false,
          version:      '1.0.0',
        },
      )

      results.push({
        topic:      article.topic,
        status:     result.status,
        durationMs: result.durationMs,
      })

      console.log(`[cron] ${article.topic}: ${result.status} in ${result.durationMs}ms`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cron] ${article.topic} failed: ${msg}`)
      results.push({ topic: article.topic, status: 'failed', durationMs: Date.now() - start })
    }

    // Pause between articles to stay within rate limits
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
