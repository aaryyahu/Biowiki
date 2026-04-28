/**
 * Pipeline orchestrator — full Phase 1 + 2
 *
 * Complete sequence for a topic:
 *   1. Search PubMed → fetch abstracts → upsert papers
 *   2. Enrich with Semantic Scholar citation counts
 *   3. Extract structured findings from each abstract (Claude Haiku)
 *   4. Store findings in Supabase
 *   5. Create draft article stub
 *   6. Score evidence per dimension (local weights + Claude Sonnet)
 *   7. Store evidence scores
 *   8. Synthesise full article content (Claude Sonnet)
 *   9. Hallucination guard — check claims vs findings (Claude Haiku)
 *  10. Store article content (auto-publish if guard passes)
 */

import { ingestTopic }                             from './pubmed'
import { enrichTopic }                             from './semantic-scholar'
import { extractTopicFindings }                    from './extract'
import { getUnprocessedPapers, storeFindingsBatch,
         getTopicFindings }                        from './findings'
import { scoreEvidence, storeEvidenceScores }      from './score'
import { getOrCreateArticleStub }                  from './article-stub'
import { synthesiseArticle }                       from './synthesise'
import { runHallucinationGuard }                   from './hallucination-guard'
import { storeArticleContent }                     from './article-store'
import { embedArticle }                            from './embed'
import { PipelineLogger }                          from './logger'
import type { ArticleCategory }                    from '@/types'

export interface PipelineOptions {
  maxPapers?:     number
  skipEnrich?:    boolean
  skipExtract?:   boolean
  skipScore?:     boolean
  skipSynthesis?: boolean
  autoPublish?:   boolean   // publish immediately if hallucination check passes
  version?:       string
}

export interface PipelineResult {
  runId:             string
  topic:             string
  articleId:         string | null
  status:            'completed' | 'failed'
  papersFound:       number
  papersInserted:    number
  papersSkipped:     number
  enriched:          number
  findingsExtracted: number
  findingsStored:    number
  dimensionsScored:  number
  articleSynthesised: boolean
  hallucinationPassed: boolean | null
  published:         boolean
  errors:            string[]
  durationMs:        number
}

export async function runIngestionPipeline(
  topic:    string,
  category: ArticleCategory,
  options:  PipelineOptions = {},
): Promise<PipelineResult> {
  const {
    maxPapers     = 25,
    skipEnrich    = false,
    skipExtract   = false,
    skipScore     = false,
    skipSynthesis = false,
    autoPublish   = false,
    version       = '1.0.0',
  } = options

  const started = Date.now()
  const logger  = await PipelineLogger.start(topic, version)
  const errors: string[] = []

  const result: PipelineResult = {
    runId:               logger.id,
    topic,
    articleId:           null,
    status:              'failed',
    papersFound:         0,
    papersInserted:      0,
    papersSkipped:       0,
    enriched:            0,
    findingsExtracted:   0,
    findingsStored:      0,
    dimensionsScored:    0,
    articleSynthesised:  false,
    hallucinationPassed: null,
    published:           false,
    errors,
    durationMs:          0,
  }

  try {
    // ── 1. PubMed ingestion ────────────────────────────────────────────────
    console.log(`[pipeline] Ingesting "${topic}" from PubMed…`)
    const ingestResult = await ingestTopic(topic, maxPapers)
    result.papersFound    = ingestResult.searched
    result.papersInserted = ingestResult.inserted
    result.papersSkipped  = ingestResult.skipped
    errors.push(...ingestResult.errors)
    await logger.update({ papers_found: ingestResult.inserted })

    if (ingestResult.inserted === 0) {
      await logger.fail('No papers with abstracts found')
      result.errors.push('No papers with abstracts found for this topic')
      result.durationMs = Date.now() - started
      return result
    }

    // ── 2. Semantic Scholar enrichment ────────────────────────────────────
    if (!skipEnrich) {
      console.log(`[pipeline] Enriching with Semantic Scholar…`)
      const enrichResult = await enrichTopic(topic)
      result.enriched = enrichResult.enriched
      errors.push(...enrichResult.errors)
    }

    // ── 3 & 4. Claude extraction + store ──────────────────────────────────
    if (!skipExtract) {
      const unprocessed = await getUnprocessedPapers(topic)
      console.log(`[pipeline] Extracting findings from ${unprocessed.length} papers…`)
      if (unprocessed.length > 0) {
        const { findings, result: er } = await extractTopicFindings(unprocessed, topic)
        errors.push(...er.errors)
        result.findingsExtracted = er.extracted
        if (findings.length > 0) {
          const { stored, errors: se } = await storeFindingsBatch(findings)
          result.findingsStored = stored
          errors.push(...se)
          await logger.update({ findings_extracted: stored })
        }
      }
    }

    // ── 5. Create/update article stub ─────────────────────────────────────
    let articleId: string
    try {
      articleId = await getOrCreateArticleStub(topic, category, result.papersInserted)
      result.articleId = articleId
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`Article stub failed: ${msg}`)
      await logger.fail(msg)
      result.durationMs = Date.now() - started
      return result
    }

    // Fetch all findings with paper join (needed for scoring & synthesis)
    const allFindings = await getTopicFindings(topic) as any[]

    // ── 6 & 7. Evidence scoring ───────────────────────────────────────────
    let evidenceScores: { dimension: string; score: number; reasoning: string }[] = []
    if (!skipScore && allFindings.length > 0) {
      console.log(`[pipeline] Scoring evidence…`)
      const { scores, result: sr } = await scoreEvidence(allFindings, articleId, topic)
      errors.push(...sr.errors)
      if (scores.length > 0) {
        const { stored, errors: se } = await storeEvidenceScores(scores, articleId)
        result.dimensionsScored = stored
        errors.push(...se)
        evidenceScores = scores.map(s => ({
          dimension: s.dimension,
          score:     s.score,
          reasoning: s.reasoning,
        }))
      }
    }

    // ── 8. Article synthesis ──────────────────────────────────────────────
    if (!skipSynthesis && allFindings.length > 0) {
      console.log(`[pipeline] Synthesising article…`)
      const { output, result: synResult } = await synthesiseArticle({
        topic,
        findings:       allFindings,
        evidenceScores,
      })
      errors.push(...synResult.errors)

      if (synResult.success && output.content) {
        result.articleSynthesised = true

        // ── 9. Hallucination guard ───────────────────────────────────────
        console.log(`[pipeline] Running hallucination guard…`)
        let guardResult = { passed: null as boolean | null, cleaned: output.content }
        try {
          const gr = await runHallucinationGuard(output.content, allFindings)
          guardResult = { passed: gr.passed, cleaned: gr.cleaned }
          result.hallucinationPassed = gr.passed

          if (gr.flags.length > 0) {
            console.warn(`[pipeline] Hallucination guard flagged ${gr.flags.length} claim(s)`)
            gr.flags.forEach(f => errors.push(`[guard] ${f.verdict}: "${f.claim}" — ${f.reason}`))
          }
        } catch (err) {
          console.warn('[pipeline] Hallucination guard failed (non-fatal):', err)
          guardResult.passed = null
        }

        // ── 10. Store article content ────────────────────────────────────
        console.log(`[pipeline] Storing article content…`)
        const shouldPublish = autoPublish && guardResult.passed !== false
        const storeResult = await storeArticleContent(
          articleId,
          { ...output, content: guardResult.cleaned },
          guardResult.passed,
          shouldPublish,
        )
        result.published = storeResult.published
        errors.push(...storeResult.errors)

        console.log(`[pipeline] Article ${shouldPublish ? 'published' : 'saved as draft'}`)

        // ── 11. Generate embeddings ──────────────────────────────────────
        console.log(`[pipeline] Generating embeddings…`)
        try {
          const embedResult = await embedArticle(
            articleId,
            guardResult.cleaned,
            output.title,
            output.summary,
          )
          console.log(`[pipeline] Created ${embedResult.chunksCreated} embedding chunks`)
          errors.push(...embedResult.errors)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[pipeline] Embedding failed (non-fatal): ${msg}`)
          errors.push(`Embedding: ${msg}`)
        }
      }
    }

    // ── Done ──────────────────────────────────────────────────────────────
    await logger.complete(result.papersInserted, result.findingsStored)
    result.status = 'completed'

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[pipeline] Fatal error: ${msg}`)
    errors.push(`Fatal: ${msg}`)
    await logger.fail(msg)
  }

  result.durationMs = Date.now() - started
  console.log(`[pipeline] Done in ${result.durationMs}ms — status: ${result.status}`)
  return result
}
