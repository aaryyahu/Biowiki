/**
 * Claude extraction — Phase 2, Step 1
 *
 * Reads a paper abstract and extracts structured findings using Claude.
 *
 * For each paper we ask Claude to extract:
 *   - study_type       (RCT, meta-analysis, observational, case_study, review, in_vitro)
 *   - population_n     (sample size, null if unclear)
 *   - population_desc  (who the subjects were)
 *   - dosage           (amount + frequency + form, null if not mentioned)
 *   - duration         (length of intervention, null if not mentioned)
 *   - key_findings     (array of discrete, factual statements from the paper)
 *   - effect_size      (small / moderate / large / unknown)
 *   - safety_notes     (adverse events or safety signals, null if none)
 *   - outcome_dims     (which evidence dimensions this paper speaks to)
 *
 * Design decisions:
 *   - We extract per-paper, not per-topic, so findings stay traceable to sources
 *   - Output is strict JSON — no markdown, no preamble, validated before storing
 *   - We use claude-haiku-4-5 for cost efficiency (abstracts are short)
 *   - Batch processing with configurable concurrency to stay within rate limits
 */

import Anthropic from '@anthropic-ai/sdk'
import type { Finding, Paper } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Raw shape Claude returns — validated before use */
interface RawExtraction {
  study_type:             string
  population_n:           number | null
  population_description: string | null
  dosage:                 string | null
  duration:               string | null
  key_findings:           string[]
  effect_size:            string
  safety_notes:           string | null
  outcome_dimensions:     string[]
}

export type ExtractionInput = Pick<
  Paper,
  'id' | 'pubmed_id' | 'title' | 'abstract' | 'authors' | 'journal' | 'published_year'
>

export type FindingInsert = Omit<Finding, 'id' | 'created_at'>

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_STUDY_TYPES  = new Set(['RCT', 'meta-analysis', 'observational', 'case_study', 'review', 'in_vitro'])
const VALID_EFFECT_SIZES = new Set(['small', 'moderate', 'large', 'unknown'])

function validateStudyType(raw: string): Finding['study_type'] {
  const cleaned = raw?.trim().toLowerCase()
  if (cleaned === 'rct' || cleaned === 'randomized controlled trial') return 'RCT'
  if (cleaned === 'meta-analysis' || cleaned === 'systematic review and meta-analysis') return 'meta-analysis'
  if (cleaned === 'in vitro' || cleaned === 'in_vitro') return 'in_vitro'
  if (cleaned === 'case_study' || cleaned === 'case study' || cleaned === 'case report') return 'case_study'
  const normalised = raw?.trim() as Finding['study_type']
  return VALID_STUDY_TYPES.has(normalised) ? normalised : 'observational'
}

function validateEffectSize(raw: string): Finding['effect_size'] {
  const cleaned = raw?.trim().toLowerCase() as Finding['effect_size']
  return VALID_EFFECT_SIZES.has(cleaned) ? cleaned : 'unknown'
}

function validateExtraction(raw: unknown, paperId: string, topic: string): FindingInsert | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as RawExtraction

  if (!Array.isArray(r.key_findings) || r.key_findings.length === 0) return null

  return {
    paper_id:               paperId,
    topic,
    study_type:             validateStudyType(r.study_type ?? ''),
    population_n:           typeof r.population_n === 'number' ? r.population_n : null,
    population_description: r.population_description?.slice(0, 500) ?? null,
    dosage:                 r.dosage?.slice(0, 300) ?? null,
    duration:               r.duration?.slice(0, 200) ?? null,
    key_findings:           r.key_findings.slice(0, 10).map(f => String(f).slice(0, 400)),
    effect_size:            validateEffectSize(r.effect_size ?? ''),
    safety_notes:           r.safety_notes?.slice(0, 500) ?? null,
    outcome_dimensions:     Array.isArray(r.outcome_dimensions)
      ? r.outcome_dimensions.slice(0, 8).map(d => String(d).slice(0, 80))
      : [],
  }
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a scientific literature analyst specialising in biomedical research.
Your task is to extract structured information from scientific paper abstracts.

Rules:
- Return ONLY valid JSON. No markdown, no backticks, no preamble, no explanation.
- Be conservative: only state what the abstract directly supports.
- Do not infer or extrapolate beyond what is written.
- If a field has no data in the abstract, use null (not "not mentioned" or "N/A").
- key_findings must be discrete, factual sentences — one finding per item.
- outcome_dimensions must be short category labels (e.g. "cognitive function", "memory", "safety", "physical performance", "neuroprotection", "mood", "sleep", "longevity").`

function buildUserPrompt(paper: ExtractionInput, topic: string): string {
  const meta = [
    paper.title && `Title: ${paper.title}`,
    paper.authors?.length && `Authors: ${paper.authors.slice(0, 3).join(', ')}${paper.authors.length > 3 ? ' et al.' : ''}`,
    paper.journal && `Journal: ${paper.journal}`,
    paper.published_year && `Year: ${paper.published_year}`,
  ].filter(Boolean).join('\n')

  return `Extract structured findings from this paper about "${topic}".

${meta}

Abstract:
${paper.abstract}

Return a JSON object with EXACTLY these fields:
{
  "study_type": "RCT" | "meta-analysis" | "observational" | "case_study" | "review" | "in_vitro",
  "population_n": number | null,
  "population_description": string | null,
  "dosage": string | null,
  "duration": string | null,
  "key_findings": [string, ...],
  "effect_size": "small" | "moderate" | "large" | "unknown",
  "safety_notes": string | null,
  "outcome_dimensions": [string, ...]
}`
}

// ─── Claude call ──────────────────────────────────────────────────────────────

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

/**
 * Extract structured findings from a single paper abstract.
 * Uses claude-haiku-4-5 — fast and cheap for short extraction tasks.
 */
export async function extractFromPaper(
  paper: ExtractionInput,
  topic: string,
): Promise<FindingInsert | null> {
  if (!paper.abstract?.trim()) return null

  const client = getClient()

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system:     SYSTEM_PROMPT,
    messages:   [{
      role:    'user',
      content: buildUserPrompt(paper, topic),
    }],
  })

  const rawText = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('')
    .trim()

  // Strip any accidental markdown fences
  const jsonText = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/,            '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    console.warn(`[extract] JSON parse failed for paper ${paper.pubmed_id}:`, jsonText.slice(0, 200))
    return null
  }

  return validateExtraction(parsed, paper.id, topic)
}

// ─── Batch processor ──────────────────────────────────────────────────────────

export interface ExtractionResult {
  topic:        string
  processed:    number
  extracted:    number
  skipped:      number
  errors:       string[]
}

/**
 * Extract findings from all unprocessed papers for a topic.
 * Processes papers serially to respect Claude rate limits.
 */
export async function extractTopicFindings(
  papers:      ExtractionInput[],
  topic:       string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ findings: FindingInsert[]; result: ExtractionResult }> {
  const result: ExtractionResult = {
    topic,
    processed: 0,
    extracted: 0,
    skipped:   0,
    errors:    [],
  }

  const findings: FindingInsert[] = []

  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i]
    onProgress?.(i, papers.length)

    if (!paper.abstract) {
      result.skipped++
      continue
    }

    try {
      const finding = await extractFromPaper(paper, topic)
      result.processed++

      if (finding) {
        findings.push(finding)
        result.extracted++
      } else {
        result.skipped++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(`paper ${paper.pubmed_id ?? paper.id}: ${msg}`)
      result.skipped++
    }

    // Polite delay between Claude calls (~3 req/s for Haiku)
    if (i < papers.length - 1) {
      await new Promise(r => setTimeout(r, 350))
    }
  }

  onProgress?.(papers.length, papers.length)
  return { findings, result }
}
