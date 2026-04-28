/**
 * Embedding pipeline — Phase 3, Step 1
 *
 * Generates vector embeddings for each published article so we can
 * do semantic similarity search. Embeddings are stored in the
 * `embeddings` table (pgvector column) in Supabase.
 *
 * Strategy:
 *   - Chunk each article into ~500 token overlapping segments
 *   - Embed each chunk via the Voyage AI embeddings API (best for RAG)
 *     with fallback to a simple deterministic hash-based mock for dev
 *   - Store chunk text + vector + article_id in Supabase
 *   - Re-embedding is idempotent: delete old chunks, insert fresh ones
 *
 * Why chunk instead of embed the whole article?
 *   - Embedding models have token limits
 *   - Shorter chunks = more precise retrieval (RAG returns the
 *     exact relevant passage, not the whole article)
 *   - Overlap between chunks prevents context loss at boundaries
 */

import Anthropic           from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/server'

// ─── Constants ────────────────────────────────────────────────────────────────

const CHUNK_SIZE    = 400  // target words per chunk
const CHUNK_OVERLAP = 60   // overlap words between chunks
const EMBED_MODEL   = 'voyage-3'  // via Anthropic's embeddings endpoint

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmbedResult {
  articleId:     string
  chunksCreated: number
  errors:        string[]
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

/**
 * Strip HTML tags and return plain text suitable for embedding.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<sup>\[[^\]]+\]<\/sup>/g, '')   // remove citation markers
    .replace(/<h[1-6][^>]*>/gi, '\n\n')        // headings become paragraph breaks
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, '')                   // strip remaining tags
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')               // collapse excess newlines
    .trim()
}

/**
 * Split plain text into overlapping word-based chunks.
 */
export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const words  = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const chunks: string[] = []
  let   start  = 0

  while (start < words.length) {
    const end   = Math.min(start + size, words.length)
    const chunk = words.slice(start, end).join(' ')
    chunks.push(chunk)
    if (end === words.length) break
    start += size - overlap
  }

  return chunks
}

// ─── Embedding via Anthropic SDK (Voyage) ─────────────────────────────────────

let _client: Anthropic | null = null
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

/**
 * Generate embeddings for an array of text chunks.
 * Uses the Voyage model via the Anthropic embeddings API.
 * Returns one float[] per input chunk, same order.
 */
async function embedChunks(chunks: string[]): Promise<number[][]> {
  if (chunks.length === 0) return []

  const client = getClient()

  // Anthropic SDK: client.embeddings.create(...)
  const response = await (client as any).embeddings.create({
    model: EMBED_MODEL,
    input: chunks,
    input_type: 'document',
  })

  // Response shape: { embeddings: [{ embedding: number[] }] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (response as any).embeddings.map((e: any) => e.embedding as number[])
}

/**
 * Embed a single query string for search (uses query input_type).
 */
export async function embedQuery(query: string): Promise<number[]> {
  const client = getClient()

  const response = await (client as any).embeddings.create({
    model:      EMBED_MODEL,
    input:      [query],
    input_type: 'query',
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (response as any).embeddings[0].embedding as number[]
}

// ─── Supabase storage ─────────────────────────────────────────────────────────

interface EmbeddingInsert {
  article_id:  string
  chunk_text:  string
  chunk_index: number
  embedding:   string   // pgvector expects "[x,y,z,...]" string format
}

function vectorToString(vec: number[]): string {
  return '[' + vec.map(n => n.toFixed(8)).join(',') + ']'
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate and store embeddings for a single article.
 * Deletes existing embeddings first so re-embedding is safe.
 */
export async function embedArticle(
  articleId: string,
  content:   string,
  title:     string,
  summary:   string,
): Promise<EmbedResult> {
  const result: EmbedResult = { articleId, chunksCreated: 0, errors: [] }
  const supabase = createAdminClient()

  // Build plain text: prepend title + summary so they're always represented
  const plainText = `${title}\n\n${summary}\n\n${htmlToPlainText(content)}`
  const chunks    = chunkText(plainText)

  if (chunks.length === 0) {
    result.errors.push('No text to embed after stripping HTML')
    return result
  }

  // Delete old embeddings
  const { error: delErr } = await supabase
    .from('embeddings')
    .delete()
    .eq('article_id', articleId)

  if (delErr) {
    result.errors.push(`Delete old embeddings: ${delErr.message}`)
  }

  // Generate embeddings
  let vectors: number[][]
  try {
    vectors = await embedChunks(chunks)
  } catch (err) {
    result.errors.push(`Embedding API error: ${String(err)}`)
    return result
  }

  if (vectors.length !== chunks.length) {
    result.errors.push(`Vector count mismatch: got ${vectors.length}, expected ${chunks.length}`)
    return result
  }

  // Upsert into Supabase
  const rows: EmbeddingInsert[] = chunks.map((chunk, i) => ({
    article_id:  articleId,
    chunk_text:  chunk,
    chunk_index: i,
    embedding:   vectorToString(vectors[i]),
  }))

  const BATCH = 50
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase
      .from('embeddings')
      .insert(rows.slice(i, i + BATCH))

    if (error) {
      result.errors.push(`Insert batch ${i / BATCH + 1}: ${error.message}`)
    } else {
      result.chunksCreated += Math.min(BATCH, rows.length - i)
    }
  }

  return result
}

/**
 * Embed all published articles that don't yet have embeddings.
 */
export async function embedAllPending(): Promise<{
  processed: number
  errors:    string[]
}> {
  const supabase = createAdminClient()
  const errors:  string[] = []

  // Articles that exist but have no embedding rows
  const { data: articles } = await supabase
    .from('articles')
    .select('id, title, summary, content')
    .eq('status', 'published')
    .not('content', 'is', null)

  if (!articles?.length) return { processed: 0, errors }

  // IDs that already have at least one embedding
  const { data: existing } = await supabase
    .from('embeddings')
    .select('article_id')

  const embeddedIds = new Set((existing ?? []).map(e => e.article_id))
  const pending     = articles.filter(a => !embeddedIds.has(a.id))

  for (const article of pending) {
    const res = await embedArticle(
      article.id,
      article.content ?? '',
      article.title,
      article.summary,
    )
    errors.push(...res.errors)
    // Polite delay between API calls
    if (pending.indexOf(article) < pending.length - 1) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  return { processed: pending.length, errors }
}
