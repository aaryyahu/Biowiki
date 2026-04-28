import { NextResponse } from 'next/server'
import { searchChunks, dedupeToArticles, textSearch } from '@/lib/search'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim()
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '6', 10), 20)

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] })
  }

  try {
    // Try semantic search first
    const chunks  = await searchChunks(query, limit * 2, 0.45)
    const results = dedupeToArticles(chunks).slice(0, limit)

    // Fall back to text search if no semantic results
    if (results.length === 0) {
      const fallback = await textSearch(query, limit)
      return NextResponse.json({ results: fallback, source: 'text' })
    }

    return NextResponse.json({ results, source: 'semantic' })
  } catch (err) {
    // If embeddings aren't set up yet, fall back to text search
    console.warn('[search] Semantic search failed, falling back to text:', String(err))
    try {
      const fallback = await textSearch(query, limit)
      return NextResponse.json({ results: fallback, source: 'text-fallback' })
    } catch {
      return NextResponse.json({ results: [], error: 'Search unavailable' }, { status: 500 })
    }
  }
}
