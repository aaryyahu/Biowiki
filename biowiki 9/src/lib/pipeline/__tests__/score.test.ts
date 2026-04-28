/**
 * Tests for the evidence scorer's local weighting logic.
 * Run: npx tsx src/lib/pipeline/__tests__/score.test.ts
 */

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`  PASS: ${message}`)
}

function approx(a: number, b: number, tol = 0.5): boolean {
  return Math.abs(a - b) <= tol
}

// ─── Mirror weighting logic inline ───────────────────────────────────────────

const STUDY_WEIGHT: Record<string, number> = {
  'meta-analysis': 10, 'RCT': 8, 'observational': 5,
  'review': 4, 'case_study': 2, 'in_vitro': 1,
}

const CURRENT_YEAR = new Date().getFullYear()

function localScore(opts: {
  study_type:     string
  effect_size:    string
  population_n:   number | null
  published_year: number | null
  citation_count: number
}): number {
  const studyScore   = STUDY_WEIGHT[opts.study_type] ?? 3
  const effectMap    = { large: 10, moderate: 6, small: 3, unknown: 2 }
  const effectScore  = (effectMap as Record<string, number>)[opts.effect_size] ?? 2
  const n            = opts.population_n ?? 1
  const sampleScore  = Math.min(10, (Math.log10(Math.max(n, 1)) / Math.log10(10000)) * 10)
  const age          = Math.max(0, CURRENT_YEAR - (opts.published_year ?? CURRENT_YEAR - 5))
  const recencyScore = Math.max(0, 10 - age * 0.5)
  const cites        = opts.citation_count ?? 0
  const citationScore = Math.min(10, (Math.log10(cites + 1) / Math.log10(1000)) * 10)
  return (
    studyScore    * 0.35 +
    effectScore   * 0.25 +
    sampleScore   * 0.20 +
    recencyScore  * 0.12 +
    citationScore * 0.08
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

function testRankOrdering() {
  console.log('\nStudy type rank ordering')

  const rct = localScore({ study_type: 'RCT', effect_size: 'large', population_n: 100, published_year: 2022, citation_count: 50 })
  const obs = localScore({ study_type: 'observational', effect_size: 'large', population_n: 100, published_year: 2022, citation_count: 50 })
  const inv = localScore({ study_type: 'in_vitro', effect_size: 'large', population_n: null, published_year: 2022, citation_count: 50 })
  const met = localScore({ study_type: 'meta-analysis', effect_size: 'large', population_n: 500, published_year: 2022, citation_count: 200 })

  assert(met > rct,  `meta-analysis (${met.toFixed(2)}) > RCT (${rct.toFixed(2)})`)
  assert(rct > obs,  `RCT (${rct.toFixed(2)}) > observational (${obs.toFixed(2)})`)
  assert(obs > inv,  `observational (${obs.toFixed(2)}) > in_vitro (${inv.toFixed(2)})`)
}

function testEffectSizeImpact() {
  console.log('\nEffect size impact')

  const base = { study_type: 'RCT', population_n: 100, published_year: 2022, citation_count: 50 }
  const large    = localScore({ ...base, effect_size: 'large' })
  const moderate = localScore({ ...base, effect_size: 'moderate' })
  const small    = localScore({ ...base, effect_size: 'small' })
  const unknown  = localScore({ ...base, effect_size: 'unknown' })

  assert(large > moderate, `large (${large.toFixed(2)}) > moderate (${moderate.toFixed(2)})`)
  assert(moderate > small, `moderate (${moderate.toFixed(2)}) > small (${small.toFixed(2)})`)
  assert(small > unknown,  `small (${small.toFixed(2)}) > unknown (${unknown.toFixed(2)})`)
}

function testSampleSizeImpact() {
  console.log('\nSample size impact')

  const base = { study_type: 'RCT', effect_size: 'moderate', published_year: 2022, citation_count: 50 }
  const n10   = localScore({ ...base, population_n: 10 })
  const n100  = localScore({ ...base, population_n: 100 })
  const n1000 = localScore({ ...base, population_n: 1000 })

  assert(n1000 > n100, `n=1000 (${n1000.toFixed(2)}) > n=100 (${n100.toFixed(2)})`)
  assert(n100  > n10,  `n=100 (${n100.toFixed(2)}) > n=10 (${n10.toFixed(2)})`)
}

function testRecencyImpact() {
  console.log('\nRecency impact')

  const base = { study_type: 'RCT', effect_size: 'moderate', population_n: 100, citation_count: 50 }
  const recent = localScore({ ...base, published_year: CURRENT_YEAR })
  const old    = localScore({ ...base, published_year: CURRENT_YEAR - 10 })

  assert(recent > old, `recent (${recent.toFixed(2)}) > old (${old.toFixed(2)})`)
}

function testScoreBounds() {
  console.log('\nScore bounds (always 0–10)')

  const cases = [
    // best possible
    { study_type: 'meta-analysis', effect_size: 'large', population_n: 10000, published_year: CURRENT_YEAR, citation_count: 9999 },
    // worst possible
    { study_type: 'in_vitro', effect_size: 'unknown', population_n: 1, published_year: 1990, citation_count: 0 },
    // null population
    { study_type: 'case_study', effect_size: 'small', population_n: null, published_year: null, citation_count: 0 },
  ]

  for (const c of cases) {
    const s = localScore(c)
    assert(s >= 0 && s <= 10, `score ${s.toFixed(2)} in [0, 10]`)
  }
}

function testWeightedAverageConsistency() {
  console.log('\nWeighted average consistency')

  // Two identical findings should produce same local score
  const a = localScore({ study_type: 'RCT', effect_size: 'moderate', population_n: 200, published_year: 2021, citation_count: 100 })
  const b = localScore({ study_type: 'RCT', effect_size: 'moderate', population_n: 200, published_year: 2021, citation_count: 100 })
  assert(a === b, `identical inputs produce identical score (${a.toFixed(4)})`)
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Evidence scorer tests ===')
  try {
    testRankOrdering()
    testEffectSizeImpact()
    testSampleSizeImpact()
    testRecencyImpact()
    testScoreBounds()
    testWeightedAverageConsistency()
    console.log('\n✓ All tests passed\n')
  } catch (err) {
    console.error('\n✗', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

main()
