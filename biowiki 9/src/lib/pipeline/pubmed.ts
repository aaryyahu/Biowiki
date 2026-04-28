/**
 * PubMed ingestion worker
 *
 * Uses the NCBI E-utilities API (free, no key required for low volume).
 * Docs: https://www.ncbi.nlm.nih.gov/books/NBK25501/
 *
 * Flow:
 *   esearch  → get list of PubMed IDs for a topic
 *   efetch   → fetch full records (title, abstract, authors, journal, year)
 *   parse    → normalise into our Paper type
 *   upsert   → insert into Supabase, skip duplicates
 */

import type { Paper } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const TOOL     = 'biowiki'
const EMAIL    = process.env.PUBMED_EMAIL ?? 'biowiki@example.com' // polite API usage
const MAX_IDS  = 25   // IDs per esearch
const BATCH    = 10   // IDs per efetch call (avoids large payloads)

// ─── Raw API shapes ───────────────────────────────────────────────────────────

interface ESearchResult {
  esearchresult: {
    idlist: string[]
    count: string
    retmax: string
  }
}

interface EFetchAuthor {
  name: string
  authtype: string
}

interface EFetchArticle {
  uid: string
  title: string
  sorttitle?: string
  fulljournalname?: string
  source?: string
  pubdate?: string
  epubdate?: string
  authors?: EFetchAuthor[]
  abstracttext?: string
  elocationid?: string   // DOI lives here sometimes
  articleids?: { idtype: string; value: string }[]
  volume?: string
  issue?: string
  pages?: string
}

interface EFetchResult {
  result: {
    uids: string[]
    [uid: string]: EFetchArticle | string[]
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUrl(endpoint: string, params: Record<string, string>): string {
  const p = new URLSearchParams({
    ...params,
    tool:   TOOL,
    email:  EMAIL,
    retmode: 'json',
  })
  return `${BASE_URL}/${endpoint}?${p.toString()}`
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 0 }, // always fresh in Next.js
  })
  if (!res.ok) throw new Error(`PubMed API error ${res.status}: ${url}`)
  return res.json() as Promise<T>
}

/** Extract DOI from articleids array */
function extractDoi(article: EFetchArticle): string | null {
  const doiEntry = article.articleids?.find(a => a.idtype === 'doi')
  if (doiEntry?.value) return doiEntry.value
  // fallback: elocationid sometimes has "doi: 10.xxxx/..."
  if (article.elocationid?.startsWith('10.')) return article.elocationid
  return null
}

/** Parse "2023 Jan 15" → 2023 */
function parseYear(pubdate?: string): number | null {
  if (!pubdate) return null
  const match = pubdate.match(/\b(19|20)\d{2}\b/)
  return match ? parseInt(match[0], 10) : null
}

/** Chunk array into groups of size n */
function chunk<T>(arr: T[], n: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n))
  return result
}

// ─── Step 1: esearch ─────────────────────────────────────────────────────────

/**
 * Search PubMed for a topic and return up to MAX_IDS PubMed IDs,
 * sorted by relevance (best match).
 */
export async function searchPubMed(topic: string, maxIds = MAX_IDS): Promise<string[]> {
  // Build a query that targets abstracts and titles for better precision
  const query = `${topic}[Title/Abstract] AND hasabstract[text]`

  const url = buildUrl('esearch.fcgi', {
    db:      'pubmed',
    term:    query,
    retmax:  String(maxIds),
    sort:    'relevance',
  })

  const data = await fetchJson<ESearchResult>(url)
  return data.esearchresult.idlist
}

// ─── Step 2: efetch ───────────────────────────────────────────────────────────

/**
 * Fetch full article records for a list of PubMed IDs.
 * Batches requests to stay within API limits.
 */
export async function fetchPubMedRecords(pmids: string[]): Promise<EFetchArticle[]> {
  if (pmids.length === 0) return []

  const batches = chunk(pmids, BATCH)
  const articles: EFetchArticle[] = []

  for (const batch of batches) {
    const url = buildUrl('esummary.fcgi', {
      db:  'pubmed',
      id:  batch.join(','),
    })

    const data = await fetchJson<EFetchResult>(url)
    const uids = data.result.uids ?? []

    for (const uid of uids) {
      const article = data.result[uid] as EFetchArticle
      if (article && typeof article === 'object') {
        articles.push({ ...article, uid })
      }
    }

    // Be polite — 3 requests/second max without API key
    if (batches.length > 1) await new Promise(r => setTimeout(r, 340))
  }

  return articles
}

// ─── Step 3: parse ────────────────────────────────────────────────────────────

/**
 * Normalise a raw EFetch article into our Paper insert shape.
 */
export function parseArticle(
  article: EFetchArticle,
  topic: string,
): Omit<Paper, 'id' | 'created_at'> {
  const authors = (article.authors ?? [])
    .filter(a => a.authtype === 'Author')
    .map(a => a.name)

  return {
    pubmed_id:     article.uid,
    doi:           extractDoi(article),
    title:         article.title?.replace(/\.$/, '') ?? 'Untitled',
    abstract:      article.abstracttext ?? null,
    authors,
    journal:       article.fulljournalname ?? article.source ?? null,
    published_year: parseYear(article.pubdate ?? article.epubdate),
    source:        'pubmed',
    citation_count: 0,   // enriched later by Semantic Scholar
    fetched_at:    new Date().toISOString(),
    topic,
  }
}

// ─── Step 4: upsert ───────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/server'

export interface IngestResult {
  topic: string
  searched: number
  fetched: number
  inserted: number
  skipped: number
  errors: string[]
}

/**
 * Full ingestion pipeline for one topic:
 *   search → fetch → parse → upsert into Supabase
 */
export async function ingestTopic(
  topic: string,
  maxPapers = MAX_IDS,
): Promise<IngestResult> {
  const result: IngestResult = {
    topic,
    searched: 0,
    fetched: 0,
    inserted: 0,
    skipped: 0,
    errors: [],
  }

  // 1. Search
  let pmids: string[]
  try {
    pmids = await searchPubMed(topic, maxPapers)
    result.searched = pmids.length
  } catch (err) {
    result.errors.push(`esearch failed: ${String(err)}`)
    return result
  }

  if (pmids.length === 0) return result

  // 2. Fetch records
  let articles: EFetchArticle[]
  try {
    articles = await fetchPubMedRecords(pmids)
    result.fetched = articles.length
  } catch (err) {
    result.errors.push(`efetch failed: ${String(err)}`)
    return result
  }

  // 3. Parse + upsert
  const supabase = createAdminClient()

  for (const article of articles) {
    try {
      const paper = parseArticle(article, topic)

      // Skip if no abstract (not useful for AI extraction)
      if (!paper.abstract) {
        result.skipped++
        continue
      }

      // Upsert — conflict on pubmed_id so re-runs are safe
      const { error } = await supabase
        .from('papers')
        .upsert(paper, {
          onConflict: 'pubmed_id',
          ignoreDuplicates: false, // update fetched_at on repeat
        })

      if (error) {
        result.errors.push(`upsert failed for ${article.uid}: ${error.message}`)
      } else {
        result.inserted++
      }
    } catch (err) {
      result.errors.push(`parse error for ${article.uid}: ${String(err)}`)
    }
  }

  return result
}
