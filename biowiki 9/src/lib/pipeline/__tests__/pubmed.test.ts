/**
 * Tests for the PubMed ingestion worker.
 *
 * Run with: npx tsx src/lib/pipeline/__tests__/pubmed.test.ts
 * (No test framework needed — pure assertion checks)
 */

import { parseArticle } from '../pubmed'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`  PASS: ${message}`)
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_ARTICLE = {
  uid: '12345678',
  title: 'Alpha-GPC supplementation improves cognitive performance in healthy volunteers.',
  abstracttext: 'Background: Alpha-GPC is a choline compound... Methods: 40 subjects received 400mg daily... Results: Significant improvement in memory scores (p<0.05).',
  authors: [
    { name: 'Smith J', authtype: 'Author' },
    { name: 'Jones A', authtype: 'Author' },
    { name: 'NLM',     authtype: 'Corporate' }, // should be excluded
  ],
  fulljournalname: 'Journal of Nutritional Biochemistry',
  pubdate: '2023 Mar 15',
  articleids: [
    { idtype: 'doi',    value: '10.1016/j.jnutbio.2023.01.001' },
    { idtype: 'pubmed', value: '12345678' },
  ],
}

// ─── Tests ────────────────────────────────────────────────────────────────────

function testParseArticle() {
  console.log('\nparseArticle()')

  const result = parseArticle(SAMPLE_ARTICLE as any, 'alpha gpc')

  assert(result.pubmed_id === '12345678', 'preserves pubmed_id')
  assert(result.doi === '10.1016/j.jnutbio.2023.01.001', 'extracts DOI from articleids')
  assert(result.title === 'Alpha-GPC supplementation improves cognitive performance in healthy volunteers', 'strips trailing period from title')
  assert(result.abstract !== null && result.abstract.includes('Alpha-GPC'), 'copies abstract')
  assert(result.authors.length === 2, 'filters out corporate authors')
  assert(result.authors[0] === 'Smith J', 'preserves first author name')
  assert(result.journal === 'Journal of Nutritional Biochemistry', 'copies journal name')
  assert(result.published_year === 2023, 'parses year from pubdate string')
  assert(result.source === 'pubmed', 'sets source to pubmed')
  assert(result.topic === 'alpha gpc', 'preserves topic')
  assert(result.citation_count === 0, 'starts with zero citations')
}

function testParseArticleNoDoi() {
  console.log('\nparseArticle() — no DOI')

  const article = { ...SAMPLE_ARTICLE, articleids: [{ idtype: 'pubmed', value: '99' }] }
  const result  = parseArticle(article as any, 'test')

  assert(result.doi === null, 'returns null doi when not present')
}

function testParseArticleEdgeCases() {
  console.log('\nparseArticle() — edge cases')

  const minimal = {
    uid: '000',
    title: 'Minimal.',
    pubdate: 'Not a date',
    authors: [],
    articleids: [],
  }
  const result = parseArticle(minimal as any, 'test')

  assert(result.title === 'Minimal', 'strips trailing period')
  assert(result.published_year === null, 'returns null year for unparseable date')
  assert(result.abstract === null, 'returns null abstract when missing')
  assert(result.authors.length === 0, 'handles empty authors array')
}

function testYearParsing() {
  console.log('\nyear parsing variants')

  const cases: [string | undefined, number | null][] = [
    ['2023 Jan 15', 2023],
    ['2021',        2021],
    ['2019 Dec',    2019],
    ['1999/01/01',  1999],
    [undefined,     null],
    ['Not a year',  null],
  ]

  for (const [input, expected] of cases) {
    const article = { ...SAMPLE_ARTICLE, pubdate: input, articleids: [] }
    const result  = parseArticle(article as any, 'test')
    assert(
      result.published_year === expected,
      `pubdate "${input}" → ${expected}`
    )
  }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== PubMed parser tests ===')
  try {
    testParseArticle()
    testParseArticleNoDoi()
    testParseArticleEdgeCases()
    testYearParsing()
    console.log('\n✓ All tests passed\n')
  } catch (err) {
    console.error('\n✗', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

main()
