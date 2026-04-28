/**
 * Tests for the Claude extraction module.
 * Run: npx tsx src/lib/pipeline/__tests__/extract.test.ts
 *
 * Tests the validation and parsing logic without calling Claude.
 */

// We test the internal validation by importing through a path alias shim
// In a real project you'd use Jest/Vitest — this is a standalone script.

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`  PASS: ${message}`)
}

// ─── Mirror the validation logic inline for standalone testing ─────────────

type StudyType  = 'RCT' | 'meta-analysis' | 'observational' | 'case_study' | 'review' | 'in_vitro'
type EffectSize = 'small' | 'moderate' | 'large' | 'unknown'

const VALID_STUDY_TYPES  = new Set(['RCT', 'meta-analysis', 'observational', 'case_study', 'review', 'in_vitro'])
const VALID_EFFECT_SIZES = new Set(['small', 'moderate', 'large', 'unknown'])

function validateStudyType(raw: string): StudyType {
  const cleaned = raw?.trim().toLowerCase()
  if (cleaned === 'rct' || cleaned === 'randomized controlled trial') return 'RCT'
  if (cleaned === 'meta-analysis' || cleaned === 'systematic review and meta-analysis') return 'meta-analysis'
  if (cleaned === 'in vitro' || cleaned === 'in_vitro') return 'in_vitro'
  if (cleaned === 'case_study' || cleaned === 'case study' || cleaned === 'case report') return 'case_study'
  const normalised = raw?.trim() as StudyType
  return VALID_STUDY_TYPES.has(normalised) ? normalised : 'observational'
}

function validateEffectSize(raw: string): EffectSize {
  const cleaned = raw?.trim().toLowerCase() as EffectSize
  return VALID_EFFECT_SIZES.has(cleaned) ? cleaned : 'unknown'
}

// ─── Study type normalisation ─────────────────────────────────────────────────

function testStudyTypeNormalisation() {
  console.log('\nStudy type normalisation')

  const cases: [string, StudyType][] = [
    ['RCT',                                    'RCT'],
    ['rct',                                    'RCT'],
    ['randomized controlled trial',            'RCT'],
    ['meta-analysis',                          'meta-analysis'],
    ['systematic review and meta-analysis',    'meta-analysis'],
    ['in vitro',                               'in_vitro'],
    ['in_vitro',                               'in_vitro'],
    ['case study',                             'case_study'],
    ['case report',                            'case_study'],
    ['observational',                          'observational'],
    ['review',                                 'review'],
    ['some unknown type',                      'observational'], // safe fallback
    ['',                                       'observational'],
  ]

  for (const [input, expected] of cases) {
    const got = validateStudyType(input)
    assert(got === expected, `"${input}" → ${expected} (got ${got})`)
  }
}

// ─── Effect size normalisation ────────────────────────────────────────────────

function testEffectSizeNormalisation() {
  console.log('\nEffect size normalisation')

  const cases: [string, EffectSize][] = [
    ['small',    'small'],
    ['SMALL',    'small'],
    ['moderate', 'moderate'],
    ['large',    'large'],
    ['unknown',  'unknown'],
    ['none',     'unknown'],   // safe fallback
    ['',         'unknown'],
    ['unclear',  'unknown'],
  ]

  for (const [input, expected] of cases) {
    const got = validateEffectSize(input)
    assert(got === expected, `"${input}" → ${expected} (got ${got})`)
  }
}

// ─── JSON parse edge cases ────────────────────────────────────────────────────

function testJsonParsing() {
  console.log('\nJSON cleaning (markdown fences)')

  function cleanJson(rawText: string): string {
    return rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/,            '')
      .trim()
  }

  const cases: [string, string][] = [
    ['{"a":1}',            '{"a":1}'],
    ['```json\n{"a":1}\n```', '{"a":1}'],
    ['```\n{"a":1}\n```',     '{"a":1}'],
    ['  {"a":1}  ',        '{"a":1}'],
  ]

  for (const [input, expected] of cases) {
    const got = cleanJson(input)
    assert(got === expected, `cleans "${input.slice(0, 30)}"`)
  }
}

// ─── Prompt sanity checks ─────────────────────────────────────────────────────

function testPromptBuilding() {
  console.log('\nPrompt building sanity')

  function buildUserPrompt(paper: {
    title?: string; abstract?: string; authors?: string[];
    journal?: string; published_year?: number
  }, topic: string): string {
    const meta = [
      paper.title && `Title: ${paper.title}`,
      paper.authors?.length && `Authors: ${paper.authors.slice(0, 3).join(', ')}${paper.authors.length > 3 ? ' et al.' : ''}`,
      paper.journal && `Journal: ${paper.journal}`,
      paper.published_year && `Year: ${paper.published_year}`,
    ].filter(Boolean).join('\n')

    return `Extract structured findings from this paper about "${topic}".\n\n${meta}\n\nAbstract:\n${paper.abstract}`
  }

  const prompt = buildUserPrompt({
    title:          'Alpha-GPC and memory',
    abstract:       'We studied 40 subjects...',
    authors:        ['Smith J', 'Jones A', 'Lee K', 'Brown M'],
    journal:        'J Nutr',
    published_year: 2023,
  }, 'alpha gpc')

  assert(prompt.includes('"alpha gpc"'),       'includes topic in prompt')
  assert(prompt.includes('Smith J'),           'includes first author')
  assert(prompt.includes('et al.'),            'truncates long author list')
  assert(!prompt.includes('Brown M'),          'omits 4th author')
  assert(prompt.includes('2023'),              'includes year')
  assert(prompt.includes('We studied 40'),     'includes abstract text')
  assert(prompt.includes('study_type'),        'includes field names in schema')
  assert(prompt.includes('key_findings'),      'includes key_findings field')
  assert(prompt.includes('outcome_dimensions'),'includes outcome_dimensions field')
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Extraction module tests ===')
  try {
    testStudyTypeNormalisation()
    testEffectSizeNormalisation()
    testJsonParsing()
    testPromptBuilding()
    console.log('\n✓ All tests passed\n')
  } catch (err) {
    console.error('\n✗', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

main()
