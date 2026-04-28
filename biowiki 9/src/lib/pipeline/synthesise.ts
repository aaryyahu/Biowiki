/**
 * Article synthesis — Phase 2, Step 3
 *
 * Takes all extracted findings + evidence scores for a topic and produces
 * a complete, publication-ready wiki article using Claude Sonnet.
 *
 * Output shape:
 *   title    — precise, descriptive (not clickbait)
 *   summary  — 2–3 sentence abstract for cards and meta tags
 *   content  — full HTML article with inline citation superscripts
 *
 * Article structure:
 *   ## Overview
 *   ## Mechanism of action
 *   ## What the evidence shows  (grounded strictly in findings)
 *   ## Dosage & timing
 *   ## Safety & contraindications
 *   ## Bottom line
 *
 * Design decisions:
 *   - We pass findings as a compact structured digest, not raw abstracts,
 *     so Claude focuses on synthesis rather than re-reading prose.
 *   - Inline citations use [N] superscripts referencing the papers array.
 *   - We use claude-sonnet-4-6 — this is the creative/long-form step.
 *   - Content is HTML so the article page can render it with dangerouslySetInnerHTML.
 *   - We keep tone neutral and scientific ("studies suggest" not "proven to").
 */

import Anthropic from '@anthropic-ai/sdk'
import type { FindingWithCitations } from './score'
import type { EvidenceScore }        from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SynthesisInput {
  topic:          string
  findings:       FindingWithCitations[]
  evidenceScores: Pick<EvidenceScore, 'dimension' | 'score' | 'reasoning'>[]
}

export interface SynthesisOutput {
  title:   string
  summary: string
  content: string           // HTML
  refMap:  RefMap           // paper index used for citations
}

/** Maps citation index (1-based) → paper metadata */
export type RefMap = Map<number, {
  paperId:  string
  title:    string
  authors:  string[]
  journal:  string | null
  year:     number | null
  doi:      string | null
}>

export interface SynthesisResult {
  topic:   string
  success: boolean
  errors:  string[]
}

// ─── Prompt construction ──────────────────────────────────────────────────────

/**
 * Build a compact findings digest for the prompt.
 * We deduplicate papers and assign citation numbers here,
 * then pass the numbered list to Claude so it can cite correctly.
 */
function buildFindingsDigest(findings: FindingWithCitations[]): {
  digest: string
  refMap: RefMap
} {
  // Deduplicate papers, ordered by citation count descending
  const seen    = new Set<string>()
  const papers: FindingWithCitations['paper'][] = []

  for (const f of findings) {
    if (!seen.has(f.paper.id)) {
      seen.add(f.paper.id)
      papers.push(f.paper)
    }
  }

  papers.sort((a, b) => (b.citation_count ?? 0) - (a.citation_count ?? 0))

  // Build citation index
  const refMap: RefMap = new Map()
  const paperIndex = new Map<string, number>()
  papers.forEach((p, i) => {
    const num = i + 1
    paperIndex.set(p.id, num)
    refMap.set(num, {
      paperId: p.id,
      title:   p.title,
      authors: p.authors ?? [],
      journal: p.journal,
      year:    p.published_year,
      doi:     p.doi,
    })
  })

  // Build digest sections grouped by outcome dimension
  const byDim = new Map<string, typeof findings>()
  for (const f of findings) {
    for (const dim of f.outcome_dimensions) {
      const key = dim.toLowerCase()
      if (!byDim.has(key)) byDim.set(key, [])
      byDim.get(key)!.push(f)
    }
  }

  const dimSections = Array.from(byDim.entries())
    .map(([dim, fs]) => {
      const lines = fs
        .sort((a, b) => (b.paper.citation_count ?? 0) - (a.paper.citation_count ?? 0))
        .slice(0, 6)
        .map(f => {
          const ref = paperIndex.get(f.paper.id) ?? '?'
          const pop = f.population_n ? `n=${f.population_n}` : 'n=?'
          const dose = f.dosage ? `, dose: ${f.dosage}` : ''
          const dur  = f.duration ? `, duration: ${f.duration}` : ''
          const findings = f.key_findings.slice(0, 3).join('; ')
          return `  [${ref}] ${f.study_type} (${pop}${dose}${dur}): ${findings}` +
                 ` [effect: ${f.effect_size}]`
        })
        .join('\n')
      return `### ${dim}\n${lines}`
    })
    .join('\n\n')

  // Reference list
  const refs = Array.from(refMap.entries())
    .map(([num, p]) => {
      const authors = p.authors.slice(0, 3).join(', ') + (p.authors.length > 3 ? ' et al.' : '')
      return `[${num}] ${p.title}. ${authors}. ${p.journal ?? ''} ${p.year ?? ''}.`
    })
    .join('\n')

  const digest = `## Findings by outcome dimension\n\n${dimSections}\n\n## Citation index\n${refs}`

  return { digest, refMap }
}

function buildSynthesisPrompt(input: SynthesisInput, digest: string): string {
  const scoresSummary = input.evidenceScores
    .sort((a, b) => b.score - a.score)
    .map(s => `  ${s.dimension}: ${s.score.toFixed(1)}/10 — ${s.reasoning}`)
    .join('\n')

  return `Write a comprehensive, evidence-based wiki article about: "${input.topic}"

## Evidence scores (pre-computed)
${scoresSummary}

## Research findings digest
${digest}

## Instructions

Write a complete wiki article in HTML. Use ONLY information from the findings digest above.
Cite using superscript notation: <sup>[N]</sup> immediately after the claim it supports.
Multiple citations: <sup>[1,3]</sup>

Tone: neutral, scientific, accessible to an educated non-specialist.
Never use: "groundbreaking", "revolutionary", "proven", "cure", "miracle".
Use hedging language: "studies suggest", "evidence indicates", "may", "appears to".

HTML structure (use these exact heading tags):
<h2>Overview</h2>
<p>2–3 sentences introducing what this is and its primary uses.</p>

<h2>Mechanism of action</h2>
<p>How it works biologically. If in_vitro findings only, note this limitation.</p>

<h2>What the evidence shows</h2>
<p>Discuss findings per outcome dimension. Cite inline. Note study quality and limitations.</p>

<h2>Dosage & timing</h2>
<p>Ranges from studies. Note if evidence is limited. Never prescribe — report what studies used.</p>

<h2>Safety & contraindications</h2>
<p>Adverse events, drug interactions, populations to avoid. If no safety signals found, say so.</p>

<h2>Bottom line</h2>
<p>2–3 sentence honest summary of current evidence state.</p>

After the article, on a new line, output exactly:
TITLE: <the article title>
SUMMARY: <2-3 sentence summary for meta description>`
}

// ─── Claude call ──────────────────────────────────────────────────────────────

let _client: Anthropic | null = null
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

async function callClaude(prompt: string): Promise<string> {
  const client = getClient()
  const msg    = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 4096,
    system: `You are a scientific writer for a biohacking knowledge base.
You write clear, evidence-based articles grounded strictly in provided research findings.
You never fabricate claims, never exaggerate effect sizes, and always acknowledge uncertainty.
Output valid HTML for article body content only — no <html>, <head>, or <body> tags.`,
    messages: [{ role: 'user', content: prompt }],
  })

  return msg.content
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('')
    .trim()
}

// ─── Output parsing ───────────────────────────────────────────────────────────

function parseOutput(raw: string, topic: string): {
  content: string
  title:   string
  summary: string
} {
  // Split off TITLE/SUMMARY metadata from HTML content
  const titleMatch   = raw.match(/^TITLE:\s*(.+)$/m)
  const summaryMatch = raw.match(/^SUMMARY:\s*([\s\S]+?)(?:\n[A-Z]+:|$)/m)

  const title   = titleMatch?.[1]?.trim()   ?? topic
  const summary = summaryMatch?.[1]?.trim() ?? ''

  // Strip the metadata lines from the bottom
  const content = raw
    .replace(/\nTITLE:[\s\S]*$/m, '')
    .trim()

  return { content, title, summary }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Synthesise a full article from findings and evidence scores.
 */
export async function synthesiseArticle(
  input: SynthesisInput,
): Promise<{ output: SynthesisOutput; result: SynthesisResult }> {
  const result: SynthesisResult = { topic: input.topic, success: false, errors: [] }

  if (input.findings.length === 0) {
    result.errors.push('No findings available for synthesis')
    return {
      output: { title: input.topic, summary: '', content: '', refMap: new Map() },
      result,
    }
  }

  // Build structured digest
  const { digest, refMap } = buildFindingsDigest(input.findings)

  // Call Claude
  let raw: string
  try {
    raw = await callClaude(buildSynthesisPrompt(input, digest))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.errors.push(`Claude call failed: ${msg}`)
    return {
      output: { title: input.topic, summary: '', content: '', refMap },
      result,
    }
  }

  // Parse output
  const { content, title, summary } = parseOutput(raw, input.topic)

  if (!content.includes('<h2>') && !content.includes('<p>')) {
    result.errors.push('Claude output does not appear to be valid HTML')
  }

  result.success = true
  return {
    output: { title, summary, content, refMap },
    result,
  }
}
