import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import type { ArticleCategory } from '@/types'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    topic?: string
    category?: string
    requester_email?: string
  } | null

  const topic = body?.topic?.trim()
  const category = body?.category as ArticleCategory | undefined
  const requester_email = body?.requester_email?.trim() || null

  if (!topic || topic.length < 3) {
    return NextResponse.json({ message: 'Topic must be at least 3 characters' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const { error } = await admin
    .from('topic_requests')
    .insert({
      topic,
      category: category ?? 'protocols',
      requester_email,
      status: 'pending',
    })

  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
