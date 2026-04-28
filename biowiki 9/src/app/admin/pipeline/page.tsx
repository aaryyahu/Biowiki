'use client'

import { useState } from 'react'
import { CATEGORY_LABELS, type ArticleCategory } from '@/types'

interface RunResult {
  status:               'completed' | 'failed'
  runId:                string
  articleId:            string | null
  papersFound:          number
  papersInserted:       number
  papersSkipped:        number
  enriched:             number
  findingsExtracted:    number
  findingsStored:       number
  dimensionsScored:     number
  articleSynthesised:   boolean
  hallucinationPassed:  boolean | null
  published:            boolean
  errors:               string[]
  durationMs:           number
  message:              string
}

const STATS = [
  { key: 'papersFound',       label: 'Papers found' },
  { key: 'papersInserted',    label: 'Papers stored' },
  { key: 'enriched',          label: 'S2 enriched' },
  { key: 'findingsExtracted', label: 'Findings extracted' },
  { key: 'dimensionsScored',  label: 'Dimensions scored' },
] as const

export default function PipelinePage() {
  const [topic,        setTopic]        = useState('')
  const [category,     setCategory]     = useState<ArticleCategory>('nootropics')
  const [maxPapers,    setMaxPapers]    = useState(25)
  const [autoPublish,  setAutoPublish]  = useState(false)
  const [skipEnrich,   setSkipEnrich]   = useState(false)
  const [skipExtract,  setSkipExtract]  = useState(false)
  const [skipScore,    setSkipScore]    = useState(false)
  const [skipSynthesis,setSkipSynthesis]= useState(false)
  const [loading,      setLoading]      = useState(false)
  const [result,       setResult]       = useState<RunResult | null>(null)

  async function run() {
    if (!topic.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/pipeline', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          topic: topic.trim(), category, maxPapers,
          autoPublish, skipEnrich, skipExtract, skipScore, skipSynthesis,
        }),
      })
      setResult(await res.json() as RunResult)
    } catch {
      setResult({
        status: 'failed', runId: '', articleId: null,
        papersFound: 0, papersInserted: 0, papersSkipped: 0, enriched: 0,
        findingsExtracted: 0, findingsStored: 0, dimensionsScored: 0,
        articleSynthesised: false, hallucinationPassed: null, published: false,
        errors: ['Network error'], durationMs: 0, message: 'Network error',
      })
    } finally {
      setLoading(false)
    }
  }

  const ok = result?.status === 'completed'

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
        Run pipeline
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--color-text-muted)' }}>
        Full pipeline: ingest → enrich → extract → score → synthesise → guard.
      </p>

      <div className="space-y-4 mb-6">
        {/* Topic */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Topic *</label>
          <input
            className="input"
            placeholder="e.g. Alpha GPC, rapamycin, cold exposure"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && run()}
          />
        </div>

        {/* Category + max papers */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Category</label>
            <select className="input" value={category} onChange={e => setCategory(e.target.value as ArticleCategory)}>
              {(Object.entries(CATEGORY_LABELS) as [ArticleCategory, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Max papers</label>
            <select className="input" value={maxPapers} onChange={e => setMaxPapers(Number(e.target.value))}>
              {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* Options */}
        <div className="rounded-lg border p-3 space-y-2.5" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Options</p>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={autoPublish} onChange={e => setAutoPublish(e.target.checked)} className="h-4 w-4 rounded accent-bio-400" />
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Auto-publish if hallucination check passes
            </span>
          </label>
          <p className="text-xs pt-1 border-t" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}>Skip steps</p>
          {[
            { val: skipEnrich,    set: setSkipEnrich,    label: 'Skip S2 enrichment' },
            { val: skipExtract,   set: setSkipExtract,   label: 'Skip Claude extraction' },
            { val: skipScore,     set: setSkipScore,     label: 'Skip evidence scoring' },
            { val: skipSynthesis, set: setSkipSynthesis, label: 'Skip article synthesis' },
          ].map(({ val, set, label }, i) => (
            <label key={i} className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} className="h-4 w-4 rounded accent-bio-400" />
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
            </label>
          ))}
        </div>

        <button
          className="btn-primary w-full py-2.5"
          onClick={run}
          disabled={loading || !topic.trim()}
        >
          {loading
            ? <span className="flex items-center justify-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Running pipeline…
              </span>
            : 'Run full pipeline'}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="rounded-xl border p-5 space-y-4" style={{
          borderColor: ok ? 'rgba(29,158,117,0.3)' : 'rgba(239,68,68,0.3)',
          background:  ok ? 'rgba(29,158,117,0.05)' : 'rgba(239,68,68,0.05)',
        }}>
          {/* Header */}
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${ok ? 'bg-bio-400' : 'bg-red-400'}`} />
            <span className="text-sm font-medium" style={{ color: ok ? 'var(--color-primary)' : '#f87171' }}>
              {ok ? 'Completed' : 'Failed'}
            </span>
            <span className="ml-auto text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {(result.durationMs / 1000).toFixed(1)}s
            </span>
          </div>

          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{result.message}</p>

          {ok && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                {STATS.map(({ key, label }) => (
                  <div key={key} className="rounded-lg p-3 text-center" style={{ background: 'var(--color-bg-elevated)' }}>
                    <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
                    <div className="text-xl font-bold text-bio-400">{result[key]}</div>
                  </div>
                ))}
              </div>

              {/* Article status */}
              {result.articleSynthesised && (
                <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Article synthesised</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-bio-400" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Hallucination check</span>
                    <span className={`text-xs font-medium ${
                      result.hallucinationPassed === true  ? 'text-bio-400' :
                      result.hallucinationPassed === false ? 'text-amber-400' : 'text-[var(--color-text-muted)]'
                    }`}>
                      {result.hallucinationPassed === true  ? 'Passed' :
                       result.hallucinationPassed === false ? 'Flagged' : 'Skipped'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Status</span>
                    <span className={`text-xs font-medium ${result.published ? 'text-bio-400' : 'text-amber-400'}`}>
                      {result.published ? 'Published' : 'Draft — review before publishing'}
                    </span>
                  </div>
                  {result.articleId && (
                    <div className="flex gap-3 pt-1">
                      <a
                        href={`/admin/articles/${result.articleId}`}
                        className="text-xs text-bio-400 hover:text-bio-300 transition-colors"
                      >
                        Preview in admin →
                      </a>
                      {result.published && (
                        <a
                          href={`/articles/${result.articleId}`}
                          className="text-xs text-bio-400 hover:text-bio-300 transition-colors"
                        >
                          View live →
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Warnings */}
          {result.errors.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
                {result.errors.length} warning{result.errors.length !== 1 ? 's' : ''}
              </summary>
              <ul className="mt-2 space-y-1 pl-3">
                {result.errors.map((e, i) => <li key={i} style={{ color: '#f87171' }}>{e}</li>)}
              </ul>
            </details>
          )}

          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Run ID: <code className="font-mono">{result.runId}</code>
          </p>
        </div>
      )}
    </div>
  )
}
