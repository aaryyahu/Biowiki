/**
 * Findings persistence
 *
 * Handles storing extracted findings in Supabase and fetching
 * papers that haven't been processed yet.
 */

import { createAdminClient } from '@/lib/supabase/server'
import type { ExtractionInput, FindingInsert } from './extract'

/**
 * Fetch all papers for a topic that don't yet have any findings extracted.
 * This lets the extraction step be safely re-run — it only processes new papers.
 */
export async function getUnprocessedPapers(topic: string): Promise<ExtractionInput[]> {
  const supabase = createAdminClient()

  // Get all paper IDs that already have findings
  const { data: existingFindings } = await supabase
    .from('findings')
    .select('paper_id')
    .eq('topic', topic)

  const processedIds = new Set((existingFindings ?? []).map(f => f.paper_id))

  // Fetch papers for this topic that have abstracts
  const { data: papers, error } = await supabase
    .from('papers')
    .select('id, pubmed_id, title, abstract, authors, journal, published_year')
    .eq('topic', topic)
    .not('abstract', 'is', null)
    .order('citation_count', { ascending: false }) // process most-cited first

  if (error) throw new Error(`Failed to fetch papers: ${error.message}`)
  if (!papers?.length) return []

  return papers.filter(p => !processedIds.has(p.id)) as ExtractionInput[]
}

/**
 * Upsert a batch of findings into Supabase.
 * Conflict key: (paper_id, topic) — so re-runs update rather than duplicate.
 */
export async function storeFindingsBatch(findings: FindingInsert[]): Promise<{
  stored:  number
  errors:  string[]
}> {
  if (findings.length === 0) return { stored: 0, errors: [] }

  const supabase = createAdminClient()
  const errors:  string[] = []
  let   stored = 0

  // Upsert in chunks of 50 to avoid payload limits
  const CHUNK = 50
  for (let i = 0; i < findings.length; i += CHUNK) {
    const chunk = findings.slice(i, i + CHUNK)

    const { error } = await supabase
      .from('findings')
      .upsert(chunk, { onConflict: 'paper_id,topic', ignoreDuplicates: false })

    if (error) {
      errors.push(`Batch ${i / CHUNK + 1}: ${error.message}`)
    } else {
      stored += chunk.length
    }
  }

  return { stored, errors }
}

/**
 * Fetch all findings for a topic (for synthesis step).
 */
export async function getTopicFindings(topic: string) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('findings')
    .select(`
      *,
      paper:papers (
        id, title, authors, journal, published_year, doi, citation_count
      )
    `)
    .eq('topic', topic)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to fetch findings: ${error.message}`)
  return data ?? []
}
