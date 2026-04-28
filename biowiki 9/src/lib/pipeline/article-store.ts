/**
 * Article persistence
 *
 * Stores the synthesised article content, title, and summary back
 * into the articles table, and converts the RefMap into the papers
 * citation list already stored from ingestion (no new rows needed).
 */

import { createAdminClient } from '@/lib/supabase/server'
import type { SynthesisOutput } from './synthesise'

export interface ArticleStoreResult {
  articleId: string
  published: boolean
  errors:    string[]
}

/**
 * Update an existing draft article stub with synthesised content.
 * Optionally publishes it immediately.
 */
export async function storeArticleContent(
  articleId:               string,
  output:                  SynthesisOutput,
  hallucinationCheckPassed: boolean | null,
  autoPublish:             boolean = false,
): Promise<ArticleStoreResult> {
  const supabase = createAdminClient()
  const errors:  string[] = []

  const { error } = await supabase
    .from('articles')
    .update({
      title:                     output.title,
      summary:                   output.summary,
      content:                   output.content,
      status:                    autoPublish ? 'published' : 'draft',
      hallucination_check_passed: hallucinationCheckPassed,
      updated_at:                new Date().toISOString(),
    })
    .eq('id', articleId)

  if (error) {
    errors.push(`Failed to store article content: ${error.message}`)
    return { articleId, published: false, errors }
  }

  return {
    articleId,
    published: autoPublish,
    errors,
  }
}

/**
 * Publish a draft article (set status = 'published').
 */
export async function publishArticle(articleId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('articles')
    .update({ status: 'published', updated_at: new Date().toISOString() })
    .eq('id', articleId)
}
