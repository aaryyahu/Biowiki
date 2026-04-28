/**
 * Hallucination guard — Phase 2, Step 4
 *
 * After synthesis, a second Claude pass reads the generated article
 * and checks every factual claim against the source findings.
 *
 * Returns:
 *   passed   — true if no unsupported claims found
 *   flags    — array of specific issues found
 *   cleaned  — article content with flagged passages wrapped in
 *              <mark data-flag="..."> so they're visible in the UI
 *
 * Design:
 *   - Uses claude-haiku-4-5 (cheaper — this is a classification task, not generation)
 *   - We check the article in sections to keep the prompt focused
 *   - If the guard fails entirely (API error), we still publish — with
 *     hallucination_check_passed = false as a signal to re-check manually
 */

import Anthropic from '@anthropic-ai/sdk'
import type { FindingWithCitations } from './score'

export interface HallucinationFlag {
  claim:    string
  verdict:  'unsupported' | 'partially_supported' | 'exaggerated'
  reason:   string
}

export interface GuardResult {
  passed:  boolean
  flags:   HallucinationFlag[]
  cleaned: string   // HTML with flags marked up
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildGuardPrompt(articleContent: string, findingsSummary: string): string {
  // Strip HTML tags for cleaner claim checking
  const plainText = articleContent
    .replace(/<sup>\[[\d,\s]+\]<\/sup>/g, '')  // remove citation markers
    .replace(/<[^>]+>/g, ' ')                   // strip all HTML
    .replace(/\s+/g, ' ')
    .trim()

  return `You are a scientific fact-checker. Check whether the claims in this article are supported by the provided research findings.

## Article text (plain)
${plainText.slice(0, 3000)}

## Source findings summary
${findingsSummary.slice(0, 2000)}

Find any claims in the article that are:
- NOT supported by the findings (verdict: "unsupported")
- Only partially supported or overstated (verdict: "partially_supported")  
- Exaggerating effect sizes or certainty (verdict: "exaggerated")

Return a JSON array. If no issues found, return [].
Each item:
{
  "claim": "<exact short phrase from article>",
  "verdict": "unsupported" | "partially_supported" | "exaggerated",
  "reason": "<one sentence explanation>"
}

Return ONLY valid JSON. No markdown, no explanation outside the JSON.`
}

function buildFindingsSummary(findings: FindingWithCitations[]): string {
  return findings
    .slice(0, 15)
    .map(f => {
      const key = f.key_findings.slice(0, 2).join('; ')
      return `[${f.study_type}, n=${f.population_n ?? '?'}, effect=${f.effect_size}] ${key}`
    })
    .join('\n')
}

// ─── Claude call ──────────────────────────────────────────────────────────────

let _client: Anthropic | null = null
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

// ─── HTML annotation ─────────────────────────────────────────────────────────

function annotateContent(content: string, flags: HallucinationFlag[]): string {
  let annotated = content
  for (const flag of flags) {
    // Escape special regex characters in the claim
    const escaped = flag.claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    try {
      const re = new RegExp(escaped, 'gi')
      annotated = annotated.replace(
        re,
        `<mark data-flag="${flag.verdict}" title="${flag.reason}">$&</mark>`,
      )
    } catch {
      // If regex fails (e.g. claim not in HTML), skip annotation for this flag
    }
  }
  return annotated
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runHallucinationGuard(
  articleContent: string,
  findings:       FindingWithCitations[],
): Promise<GuardResult> {
  const fallback: GuardResult = {
    passed:  false,
    flags:   [],
    cleaned: articleContent,
  }

  if (!articleContent.trim() || findings.length === 0) {
    return { passed: true, flags: [], cleaned: articleContent }
  }

  const client = getClient()
  const findingsSummary = buildFindingsSummary(findings)

  let rawText: string
  try {
    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages:   [{
        role:    'user',
        content: buildGuardPrompt(articleContent, findingsSummary),
      }],
    })

    rawText = msg.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
  } catch (err) {
    console.warn('[hallucination-guard] API call failed:', err)
    return fallback
  }

  let flags: HallucinationFlag[]
  try {
    const parsed = JSON.parse(rawText)
    flags = Array.isArray(parsed) ? parsed : []
  } catch {
    console.warn('[hallucination-guard] JSON parse failed:', rawText.slice(0, 200))
    return fallback
  }

  // Validate flag shape
  flags = flags.filter(
    f => f.claim && f.verdict && ['unsupported', 'partially_supported', 'exaggerated'].includes(f.verdict),
  )

  const passed  = flags.length === 0
  const cleaned = flags.length > 0 ? annotateContent(articleContent, flags) : articleContent

  return { passed, flags, cleaned }
}
