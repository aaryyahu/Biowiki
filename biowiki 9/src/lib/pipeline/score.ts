/**
 * Evidence scorer — Phase 2, Step 2
 *
 * Takes all extracted findings for a topic and produces a scored
 * evidence summary per outcome dimension (e.g. "cognitive function",
 * "safety", "physical performance").
 *
 * Two-stage process:
 *   1. LOCAL WEIGHTING  — deterministic score per finding based on
 *      study type, sample size, recency, and citation count.
 *      This gives a defensible baseline without AI.
 *
 *   2. CLAUDE SYNTHESIS — sends the weighted findings to Claude Sonnet
 *      which produces a final 1–10 score per dimension with a one-sentence
 *      reasoning string that explains the rating to readers.
 *
 * Design decisions:
 *   - We separate local weighting from Claude synthesis so:
 *       a) the score is auditable (you can see the maths)
 *       b) Claude's job is reasoning, not arithmetic — it does that well
 *   - We use claude-sonnet-4-6 for scoring (needs cross-paper reasoning)
 *   - Output is strictly typed and validated before storing
 *   - Scores are upserted so re-scoring a topic always overwrites stale data
 */

import Anthropic from '@anthropic-ai/sdk'
import { STUDY_TYPE_WEIGHT } from '@/types'
import type { Finding, EvidenceScore }  from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

/** A finding joined with its paper's citation count */
export interface FindingWithCitations extends Finding {
  paper: {
    id:             string
    title:          string
    authors:        string[]
    journal:        string | null
    published_year: number | null
    doi:            string | null
    citation_count: number
  }
}

/** Intermediate: a finding with its computed local weight */
interface WeightedFinding {
  finding:      FindingWithCitations
  localScore:   number   // 0–10 from deterministic weighting
  breakdown:    string   // human-readable explanation of the score
}

/** What Claude returns for each dimension */
interface RawDimensionScore {
  dimension:         string
  score:             number
  reasoning:         string
  papers_supporting: number
}

export type EvidenceScoreInsert = Omit<EvidenceScore, 'id' | 'created_at'>

// ─── Step 1: Local weighting ──────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()

/**
 * Compute a deterministic local weight for a single finding.
 *
 * Formula (all components 0–10, averaged):
 *   study_type_score  = STUDY_TYPE_WEIGHT[study_type]
 *   sample_size_score = log10(n) / log10(10000) * 10   (capped at 10)
 *   recency_score     = max(0, 10 - (currentYear - publishedYear) * 0.5)
 *   citation_score    = log10(citations + 1) / log10(1000) * 10  (capped at 10)
 *   effect_score      = { large:10, moderate:6, small:3, unknown:2 }
 *
 * Final = weighted average:
 *   study_type × 0.35 + effect × 0.25 + sample × 0.20 + recency × 0.12 + citations × 0.08
 */
function computeLocalWeight(finding: FindingWithCitations): WeightedFinding {
  const studyScore  = STUDY_TYPE_WEIGHT[finding.study_type] ?? 3

  const effectMap   = { large: 10, moderate: 6, small: 3, unknown: 2 }
  const effectScore = effectMap[finding.effect_size] ?? 2

  const n           = finding.population_n ?? 1
  const sampleScore = Math.min(10, (Math.log10(Math.max(n, 1)) / Math.log10(10000)) * 10)

  const year        = finding.paper.published_year ?? (CURRENT_YEAR - 5)
  const age         = Math.max(0, CURRENT_YEAR - year)
  const recencyScore = Math.max(0, 10 - age * 0.5)

  const cites        = finding.paper.citation_count ?? 0
  const citationScore = Math.min(10, (Math.log10(cites + 1) / Math.log10(1000)) * 10)

  const localScore =
    studyScore   * 0.35 +
    effectScore  * 0.25 +
    sampleScore  * 0.20 +
    recencyScore * 0.12 +
    citationScore * 0.08

  const breakdown = [
    `study(${finding.study_type})=${studyScore.toFixed(1)}`,
    `effect(${finding.effect_size})=${effectScore.toFixed(1)}`,
    `n=${n}→${sampleScore.toFixed(1)}`,
    `year=${year}→${recencyScore.toFixed(1)}`,
    `cites=${cites}→${citationScore.toFixed(1)}`,
    `total=${localScore.toFixed(2)}`,
  ].join(' | ')

  return { finding, localScore, breakdown }
}

/**
 * Group weighted findings by outcome dimension and compute
 * a preliminary aggregate score per dimension.
 */
function groupByDimension(weighted: WeightedFinding[]): Map<string, {
  findings: WeightedFinding[]
  aggregateScore: number
}> {
  const groups = new Map<string, WeightedFinding[]>()

  for (const wf of weighted) {
    for (const dim of wf.finding.outcome_dimensions) {
      const key = dim.toLowerCase().trim()
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(wf)
    }
  }

  // Aggregate: weighted average of local scores, boosted by finding count
  const result = new Map<string, { findings: WeightedFinding[]; aggregateScore: number }>()

  for (const [dim, findings] of groups) {
    const avg   = findings.reduce((s, f) => s + f.localScore, 0) / findings.length
    const boost = Math.min(1, Math.log10(findings.length + 1) / Math.log10(10)) * 0.5
    const aggregateScore = Math.min(10, avg * (1 + boost))
    result.set(dim, { findings, aggregateScore })
  }

  return result
}

// ─── Step 2: Claude synthesis ─────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a scientific evidence analyst for a biohacking knowledge base.
Your job is to assess the strength of evidence for specific health outcomes.

Rules:
- Return ONLY valid JSON — no markdown, no backticks, no explanation.
- Scores must be 1–10 where: 1-3 = weak/preliminary, 4-6 = moderate, 7-8 = good, 9-10 = strong consensus.
- reasoning must be exactly ONE sentence (max 150 chars) that a non-scientist can understand.
- Be conservative: strong scores (8+) require multiple high-quality RCTs or a meta-analysis.
- papers_supporting must be a count of findings that address this dimension.`

function buildScoringPrompt(
  topic: string,
  groups: Map<string, { findings: WeightedFinding[]; aggregateScore: number }>,
): string {
  const dimensionSummaries = Array.from(groups.entries())
    .sort((a, b) => b[1].aggregateScore - a[1].aggregateScore)
    .map(([dim, { findings, aggregateScore }]) => {
      const topFindings = findings
        .sort((a, b) => b.localScore - a.localScore)
        .slice(0, 5)
        .map(wf => {
          const f = wf.finding
          const p = f.paper
          return `  - [${f.study_type}, n=${f.population_n ?? '?'}, ${p.published_year ?? '?'}] ` +
                 `${f.key_findings.slice(0, 2).join('; ')} ` +
                 `(effect: ${f.effect_size}, citations: ${p.citation_count})`
        })
        .join('\n')

      return `Dimension: "${dim}" (preliminary score: ${aggregateScore.toFixed(1)}/10, ${findings.length} finding(s))\n${topFindings}`
    })
    .join('\n\n')

  return `Score the evidence strength for the topic: "${topic}"

For each dimension below, assign a final evidence score (1–10) with a one-sentence reasoning.

${dimensionSummaries}

Return a JSON array:
[
  {
    "dimension": "...",
    "score": <number 1-10>,
    "reasoning": "...",
    "papers_supporting": <count>
  }
]`
}

let _client: Anthropic | null = null
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

async function scoreWithClaude(
  topic: string,
  groups: Map<string, { findings: WeightedFinding[]; aggregateScore: number }>,
): Promise<RawDimensionScore[]> {
  const client  = getClient()
  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2048,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: buildScoringPrompt(topic, groups) }],
  })

  const rawText = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  return JSON.parse(rawText) as RawDimensionScore[]
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateScores(
  raw: RawDimensionScore[],
  articleId: string,
): EvidenceScoreInsert[] {
  return raw
    .filter(r => r.dimension && typeof r.score === 'number')
    .map(r => ({
      article_id:        articleId,
      dimension:         String(r.dimension).slice(0, 80).trim(),
      score:             Math.min(10, Math.max(0, Number(r.score.toFixed(1)))),
      reasoning:         String(r.reasoning ?? '').slice(0, 300).trim(),
      papers_supporting: Math.max(0, Math.round(r.papers_supporting ?? 0)),
    }))
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ScoringResult {
  topic:       string
  articleId:   string
  dimensions:  number
  errors:      string[]
}

/**
 * Score evidence for a topic and produce EvidenceScore rows.
 *
 * @param findings  All findings for this topic (with paper join)
 * @param articleId The article these scores belong to
 * @param topic     Topic string for the prompt
 */
export async function scoreEvidence(
  findings:  FindingWithCitations[],
  articleId: string,
  topic:     string,
): Promise<{ scores: EvidenceScoreInsert[]; result: ScoringResult }> {
  const result: ScoringResult = { topic, articleId, dimensions: 0, errors: [] }

  if (findings.length === 0) {
    result.errors.push('No findings to score')
    return { scores: [], result }
  }

  // Step 1: local weights
  const weighted = findings.map(computeLocalWeight)

  // Step 2: group by dimension
  const groups = groupByDimension(weighted)

  if (groups.size === 0) {
    result.errors.push('No outcome dimensions found in findings')
    return { scores: [], result }
  }

  // Step 3: Claude synthesis
  let raw: RawDimensionScore[]
  try {
    raw = await scoreWithClaude(topic, groups)
  } catch (err) {
    // Fallback: use local scores with a generic reasoning string
    console.warn('[score] Claude call failed, using local fallback:', err)
    raw = Array.from(groups.entries()).map(([dim, { findings: fs, aggregateScore }]) => ({
      dimension:         dim,
      score:             Math.round(aggregateScore * 10) / 10,
      reasoning:         `Based on ${fs.length} study finding(s) for this outcome.`,
      papers_supporting: fs.length,
    }))
  }

  // Step 4: validate
  const scores = validateScores(raw, articleId)
  result.dimensions = scores.length

  return { scores, result }
}

// ─── Persistence ──────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/server'

/**
 * Upsert evidence scores for an article.
 * Deletes existing scores first so re-scoring always gives a clean slate.
 */
export async function storeEvidenceScores(
  scores:    EvidenceScoreInsert[],
  articleId: string,
): Promise<{ stored: number; errors: string[] }> {
  if (scores.length === 0) return { stored: 0, errors: [] }

  const supabase = createAdminClient()
  const errors:  string[] = []

  // Delete old scores for this article
  const { error: delError } = await supabase
    .from('evidence_scores')
    .delete()
    .eq('article_id', articleId)

  if (delError) errors.push(`Delete existing scores: ${delError.message}`)

  // Insert fresh scores
  const { error: insError } = await supabase
    .from('evidence_scores')
    .insert(scores)

  if (insError) {
    errors.push(`Insert scores: ${insError.message}`)
    return { stored: 0, errors }
  }

  return { stored: scores.length, errors }
}
