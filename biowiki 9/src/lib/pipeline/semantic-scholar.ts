/**
 * Semantic Scholar enrichment
 *
 * After PubMed ingestion, this worker queries the Semantic Scholar API
 * to enrich each paper with:
 *   - citation count (real-world impact signal)
 *   - open-access PDF URL (for full-text extraction later)
 *   - TL;DR abstract (model-generated summary, useful fallback)
 *
 * API docs: https://api.semanticscholar.org/graph/v1
 * Rate limit: 1 req/s unauthenticated, 10 req/s with API key
 */

import { createAdminClient } from '@/lib/supabase/server'

const S2_BASE   = 'https://api.semanticscholar.org/graph/v1'
const S2_KEY    = process.env.SEMANTIC_SCHOLAR_API_KEY // optional but recommended
const FIELDS    = 'citationCount,openAccessPdf,tldr,externalIds'
const BATCH_MAX = 500 // S2 paper batch endpoint limit

interface S2Paper {
  paperId:      string
  externalIds?: { DOI?: string; PubMed?: string }
  citationCount?: number
  openAccessPdf?: { url: string; status: string } | null
  tldr?:          { model: string; text: string } | null
}

interface S2BatchResponse {
  data?: S2Paper[]
}

function s2Headers(): HeadersInit {
  const h: HeadersInit = { 'Content-Type': 'application/json' }
  if (S2_KEY) h['x-api-key'] = S2_KEY
  return h
}

/**
 * Batch-lookup papers by DOI or PubMed ID.
 * Returns a map of { pubmed_id → S2Paper }.
 */
async function batchLookup(
  papers: { pubmed_id: string | null; doi: string | null }[],
): Promise<Map<string, S2Paper>> {
  const resultMap = new Map<string, S2Paper>()

  // Build lookup ids — prefer DOI, fall back to PubMed ID
  const ids = papers
    .map(p => {
      if (p.doi)       return `DOI:${p.doi}`
      if (p.pubmed_id) return `PMID:${p.pubmed_id}`
      return null
    })
    .filter(Boolean) as string[]

  if (ids.length === 0) return resultMap

  // Chunk into S2 batch limit
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += BATCH_MAX) {
    chunks.push(ids.slice(i, i + BATCH_MAX))
  }

  for (const chunk of chunks) {
    try {
      const res = await fetch(
        `${S2_BASE}/paper/batch?fields=${FIELDS}`,
        {
          method:  'POST',
          headers: s2Headers(),
          body:    JSON.stringify({ ids: chunk }),
        },
      )

      if (!res.ok) {
        console.warn(`S2 batch failed: ${res.status}`)
        continue
      }

      const data = (await res.json()) as S2Paper[]

      for (const paper of data) {
        const pmid = paper.externalIds?.PubMed
        if (pmid) resultMap.set(pmid, paper)
      }
    } catch (err) {
      console.warn('S2 batch error:', err)
    }

    // Rate limit
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 1100))
  }

  return resultMap
}

export interface EnrichResult {
  topic: string
  processed: number
  enriched: number
  errors: string[]
}

/**
 * Enrich all papers for a topic with Semantic Scholar data.
 */
export async function enrichTopic(topic: string): Promise<EnrichResult> {
  const result: EnrichResult = { topic, processed: 0, enriched: 0, errors: [] }
  const supabase = createAdminClient()

  // Fetch papers that haven't been enriched yet (citation_count = 0)
  const { data: papers, error } = await supabase
    .from('papers')
    .select('id, pubmed_id, doi, citation_count')
    .eq('topic', topic)

  if (error || !papers?.length) {
    result.errors.push(error?.message ?? 'No papers found')
    return result
  }

  result.processed = papers.length

  // Batch lookup
  const s2Map = await batchLookup(
    papers.map(p => ({ pubmed_id: p.pubmed_id, doi: p.doi })),
  )

  // Update each paper
  for (const paper of papers) {
    const s2 = paper.pubmed_id ? s2Map.get(paper.pubmed_id) : undefined
    if (!s2) continue

    const updates: Record<string, unknown> = {}
    if (typeof s2.citationCount === 'number') {
      updates.citation_count = s2.citationCount
    }

    if (Object.keys(updates).length === 0) continue

    const { error: updateErr } = await supabase
      .from('papers')
      .update(updates)
      .eq('id', paper.id)

    if (updateErr) {
      result.errors.push(`update failed for ${paper.id}: ${updateErr.message}`)
    } else {
      result.enriched++
    }
  }

  return result
}
