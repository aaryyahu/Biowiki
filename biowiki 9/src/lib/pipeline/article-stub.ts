/**
 * Article stub creator
 *
 * Before scoring and synthesis we need an article record in Supabase
 * so evidence_scores can reference it via article_id.
 *
 * This creates a minimal draft article — the full content is filled in
 * by the synthesis step (Phase 2, Step 3).
 *
 * If an article for this topic already exists, returns its existing ID
 * so re-runs update rather than create duplicates.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { slugify }           from '@/lib/utils'
import type { ArticleCategory, Article } from '@/types'

export async function getOrCreateArticleStub(
  topic:    string,
  category: ArticleCategory,
  papersCount: number,
): Promise<string> {
  const supabase = createAdminClient()
  const slug     = slugify(topic)

  // Check if article already exists for this topic
  const { data: existing } = await supabase
    .from('articles')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (existing?.id) {
    // Update papers_count to reflect latest ingestion
    await supabase
      .from('articles')
      .update({ papers_count: papersCount, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    return existing.id
  }

  // Create new draft article stub
  const { data, error } = await supabase
    .from('articles')
    .insert({
      topic,
      slug,
      title:            topic,          // overwritten by synthesis step
      content:          '',             // overwritten by synthesis step
      summary:          '',             // overwritten by synthesis step
      category,
      status:           'draft',
      papers_count:     papersCount,
      pipeline_version: '1.0.0',
      generation_model: 'claude-sonnet-4-6',
      hallucination_check_passed: null,
    } satisfies Omit<Article, 'id' | 'created_at' | 'updated_at'>)
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create article stub: ${error?.message}`)
  }

  return data.id
}
