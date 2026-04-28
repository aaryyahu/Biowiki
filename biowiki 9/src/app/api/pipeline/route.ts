import { NextResponse }             from 'next/server'
import { createClient }             from '@/lib/supabase/server'
import { runIngestionPipeline }     from '@/lib/pipeline/orchestrator'
import type { ArticleCategory }     from '@/types'

export const maxDuration = 300 // Vercel Pro max — synthesis takes time

export async function POST(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim())
  const isAdmin = adminEmails.includes(user.email ?? '') || user.app_metadata?.role === 'admin'
  if (!isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  // ── Body ─────────────────────────────────────────────────────────────────
  const body = await request.json().catch(() => ({})) as {
    topic?:        string
    category?:     ArticleCategory
    maxPapers?:    number
    autoPublish?:  boolean
    skipEnrich?:   boolean
    skipExtract?:  boolean
    skipScore?:    boolean
    skipSynthesis?: boolean
  }

  const {
    topic,
    category      = 'nootropics',
    maxPapers     = 25,
    autoPublish   = false,
    skipEnrich    = false,
    skipExtract   = false,
    skipScore     = false,
    skipSynthesis = false,
  } = body

  if (!topic?.trim()) return NextResponse.json({ message: 'topic is required' }, { status: 400 })

  // ── Run ──────────────────────────────────────────────────────────────────
  try {
    const result = await runIngestionPipeline(topic.trim(), category, {
      maxPapers,
      autoPublish,
      skipEnrich,
      skipExtract,
      skipScore,
      skipSynthesis,
    })

    const ok  = result.status === 'completed'
    const msg = ok
      ? `Pipeline complete for "${topic}" — ${result.papersInserted} papers, ${result.findingsStored} findings, ${result.dimensionsScored} dimensions scored${result.articleSynthesised ? ', article synthesised' : ''}`
      : `Pipeline failed: ${result.errors[0] ?? 'unknown error'}`

    return NextResponse.json({ message: msg, ...result }, { status: ok ? 200 : 500 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ message: `Server error: ${msg}` }, { status: 500 })
  }
}
