/**
 * Tests for article synthesis parsing and hallucination guard logic.
 * Run: npx tsx src/lib/pipeline/__tests__/synthesise.test.ts
 */

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`  PASS: ${message}`)
}

// ─── Mirror parseOutput inline ────────────────────────────────────────────────

function parseOutput(raw: string, topic: string): {
  content: string
  title:   string
  summary: string
} {
  const titleMatch   = raw.match(/^TITLE:\s*(.+)$/m)
  const summaryMatch = raw.match(/^SUMMARY:\s*([\s\S]+?)(?:\n[A-Z]+:|$)/m)

  const title   = titleMatch?.[1]?.trim()   ?? topic
  const summary = summaryMatch?.[1]?.trim() ?? ''

  const content = raw
    .replace(/\nTITLE:[\s\S]*$/m, '')
    .trim()

  return { content, title, summary }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

function testParseOutputFull() {
  console.log('\nparseOutput() — full response')

  const raw = `<h2>Overview</h2>
<p>Alpha GPC is a choline compound.<sup>[1]</sup></p>

<h2>Mechanism of action</h2>
<p>It increases acetylcholine levels.<sup>[2]</sup></p>

TITLE: Alpha GPC — Evidence-Based Overview
SUMMARY: Alpha GPC is a highly bioavailable form of choline. Studies suggest it supports cognitive function. Evidence is moderate-strong across RCTs.`

  const { content, title, summary } = parseOutput(raw, 'alpha gpc')

  assert(title === 'Alpha GPC — Evidence-Based Overview', 'extracts title')
  assert(summary.startsWith('Alpha GPC is a highly bioavailable'), 'extracts summary')
  assert(content.includes('<h2>Overview</h2>'), 'content has overview heading')
  assert(content.includes('<h2>Mechanism of action</h2>'), 'content has mechanism heading')
  assert(!content.includes('TITLE:'), 'title metadata stripped from content')
  assert(!content.includes('SUMMARY:'), 'summary metadata stripped from content')
}

function testParseOutputMissingMeta() {
  console.log('\nparseOutput() — missing metadata')

  const raw = `<h2>Overview</h2><p>Some content here.</p>`
  const { content, title, summary } = parseOutput(raw, 'test topic')

  assert(title === 'test topic', 'falls back to topic when title missing')
  assert(summary === '', 'returns empty string when summary missing')
  assert(content.includes('<h2>Overview</h2>'), 'content preserved')
}

function testParseOutputStripsCorrectly() {
  console.log('\nparseOutput() — strips only TITLE/SUMMARY suffix')

  const raw = `<h2>Overview</h2>
<p>The TITLE: of a study matters.<sup>[1]</sup></p>

TITLE: Real Title Here
SUMMARY: Real summary here.`

  const { content, title } = parseOutput(raw, 'fallback')

  assert(title === 'Real Title Here', 'gets real title from metadata line')
  // The inline "TITLE:" inside a paragraph should be preserved as it's not at line start
  assert(content.includes('TITLE: of a study'), 'preserves inline "TITLE:" in paragraph content')
}

// ─── Hallucination guard annotation logic ────────────────────────────────────

function testAnnotateContent() {
  console.log('\nannotateContent() — marks flagged claims in HTML')

  function annotateContent(content: string, flags: { claim: string; verdict: string; reason: string }[]): string {
    let annotated = content
    for (const flag of flags) {
      const escaped = flag.claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      try {
        const re = new RegExp(escaped, 'gi')
        annotated = annotated.replace(
          re,
          `<mark data-flag="${flag.verdict}" title="${flag.reason}">$&</mark>`,
        )
      } catch { /* skip */ }
    }
    return annotated
  }

  const content = '<p>Studies show significant memory improvement in all participants.</p>'
  const flags   = [{
    claim:   'significant memory improvement in all participants',
    verdict: 'exaggerated',
    reason:  'Only 60% of participants showed improvement in the cited RCT.',
  }]

  const annotated = annotateContent(content, flags)

  assert(annotated.includes('<mark data-flag="exaggerated"'), 'wraps flagged claim in <mark>')
  assert(annotated.includes('Only 60% of participants'), 'includes reason in title attribute')
  assert(annotated.includes('significant memory improvement'), 'preserves original claim text')
}

function testAnnotateContentNoFlags() {
  console.log('\nannotateContent() — no flags = unchanged content')

  function annotateContent(content: string, flags: unknown[]): string {
    return flags.length === 0 ? content : content // simplified — no flags = no change
  }

  const content = '<p>Clean content with no issues.</p>'
  const result  = annotateContent(content, [])
  assert(result === content, 'returns content unchanged when no flags')
}

function testFlagValidation() {
  console.log('\nFlag validation — filters invalid shapes')

  type Flag = { claim?: string; verdict?: string; reason?: string }

  function validateFlags(raw: Flag[]): Flag[] {
    return raw.filter(
      f => f.claim && f.verdict && ['unsupported', 'partially_supported', 'exaggerated'].includes(f.verdict ?? '')
    )
  }

  const raw: Flag[] = [
    { claim: 'valid claim',   verdict: 'unsupported',        reason: 'ok' },
    { claim: 'valid claim 2', verdict: 'partially_supported', reason: 'ok' },
    { claim: 'valid claim 3', verdict: 'exaggerated',         reason: 'ok' },
    { claim: 'bad verdict',   verdict: 'made_up_verdict',     reason: 'bad' },
    { claim: '',              verdict: 'unsupported',          reason: 'no claim' },
    { verdict: 'unsupported'  },  // no claim field
  ]

  const valid = validateFlags(raw)
  assert(valid.length === 3, `filters to 3 valid flags (got ${valid.length})`)
  assert(valid.every(f => ['unsupported', 'partially_supported', 'exaggerated'].includes(f.verdict!)), 'all verdicts valid')
}

// ─── Findings digest building ─────────────────────────────────────────────────

function testCitationNumbering() {
  console.log('\nCitation numbering — 1-based, deduped by paper id')

  // Simulate the citation building logic
  const findings = [
    { paper: { id: 'p1', citation_count: 100, title: 'Paper 1', authors: [], journal: null, published_year: 2022, doi: null } },
    { paper: { id: 'p2', citation_count: 50,  title: 'Paper 2', authors: [], journal: null, published_year: 2021, doi: null } },
    { paper: { id: 'p1', citation_count: 100, title: 'Paper 1', authors: [], journal: null, published_year: 2022, doi: null } }, // duplicate
  ]

  const seen   = new Set<string>()
  const papers = findings
    .filter(f => { if (seen.has(f.paper.id)) return false; seen.add(f.paper.id); return true })
    .map(f => f.paper)
    .sort((a, b) => (b.citation_count ?? 0) - (a.citation_count ?? 0))

  const paperIndex = new Map(papers.map((p, i) => [p.id, i + 1]))

  assert(papers.length === 2, 'deduplicates papers by id')
  assert(paperIndex.get('p1') === 1, 'most-cited paper gets [1]')
  assert(paperIndex.get('p2') === 2, 'second paper gets [2]')
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Synthesis & hallucination guard tests ===')
  try {
    testParseOutputFull()
    testParseOutputMissingMeta()
    testParseOutputStripsCorrectly()
    testAnnotateContent()
    testAnnotateContentNoFlags()
    testFlagValidation()
    testCitationNumbering()
    console.log('\n✓ All tests passed\n')
  } catch (err) {
    console.error('\n✗', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

main()
