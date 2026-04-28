/**
 * Semantic search
 *
 * Given a natural language query, finds the most relevant article chunks
 * using pgvector cosine similarity.
 *
 * Used by:
 *   - The search bar (returns articles, not chunks)
 *   - The RAG chat (returns chunks as context for Claude)
 */

import { createClient }      from '@/lib/supabase/client'
import { createAdminClient } from '@/lib/supabase/server'
import { embedQuery }        from '@/lib/pipeline/embed'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SearchResult {
  article_id: string
  slug:       string
  title:      string
  summary:    string
  category:   string
  chunk_text: string
  similarity: number
}

export interface ArticleSearchResult {
  article_id: string
  slug:       string
  title:      string
  summary:    string
  category:   string
  similarity: number   // best chunk similarity score
}

// ─── Vector search (server-side) ─────────────────────────────────────────────

/**
 * Search for similar article chunks using pgvector.
 * Called server-side only (uses admin client for RLS bypass on embeddings).
 *
 * Returns raw chunk-level results — deduplicate to article level
 * using dedupeToArticles() for the search UI.
 */
export async function searchChunks(
  query:          string,
  matchCount:     number = 10,
  matchThreshold: number = 0.5,
): Promise<SearchResult[]> {
  const queryVector = await embedQuery(query)
  const supabase    = createAdminClient()

  // Call the pgvector match function defined in the migration
  const { data, error } = await supabase.rpc('match_embeddings', {
    query_embedding: `[${queryVector.join(',')}]`,
    match_count:     matchCount,
    match_threshold: matchThreshold,
  })

  if (error) throw new Error(`Vector search failed: ${error.message}`)
  if (!data?.length) return []

  // Join with article metadata
  const articleIds = [...new Set(data.map((r: { article_id: string }) => r.article_id))]

  const { data: articles } = await supabase
    .from('articles')
    .select('id, slug, title, summary, category')
    .in('id', articleIds)
    .eq('status', 'published')

  const articleMap = new Map((articles ?? []).map(a => [a.id, a]))

  return data
    .map((row: { article_id: string; chunk_text: string; similarity: number }) => {
      const article = articleMap.get(row.article_id)
      if (!article) return null
      return {
        article_id: row.article_id,
        slug:       article.slug,
        title:      article.title,
        summary:    article.summary,
        category:   article.category,
        chunk_text: row.chunk_text,
        similarity: row.similarity,
      }
    })
    .filter(Boolean) as SearchResult[]
}

/**
 * Deduplicate chunk-level results to article-level,
 * keeping the best (highest) similarity score per article.
 */
export function dedupeToArticles(chunks: SearchResult[]): ArticleSearchResult[] {
  const best = new Map<string, SearchResult>()

  for (const chunk of chunks) {
    const existing = best.get(chunk.article_id)
    if (!existing || chunk.similarity > existing.similarity) {
      best.set(chunk.article_id, chunk)
    }
  }

  return Array.from(best.values())
    .sort((a, b) => b.similarity - a.similarity)
    .map(({ article_id, slug, title, summary, category, similarity }) => ({
      article_id, slug, title, summary, category, similarity,
    }))
}

// ─── Search API (browser-friendly wrapper) ────────────────────────────────────

/**
 * Full-text fallback search using Postgres text search.
 * Used when no embeddings exist yet for a topic.
 */
export async function textSearch(query: string, limit = 8): Promise<ArticleSearchResult[]> {
  const supabase = createClient()

  const { data } = await supabase
    .from('articles')
    .select('id, slug, title, summary, category')
    .eq('status', 'published')
    .or(`title.ilike.%${query}%,summary.ilike.%${query}%`)
    .limit(limit)

  return (data ?? []).map(a => ({
    article_id: a.id,
    slug:       a.slug,
    title:      a.title,
    summary:    a.summary,
    category:   a.category,
    similarity: 0.5,  // placeholder — text match doesn't have a similarity score
  }))
}
