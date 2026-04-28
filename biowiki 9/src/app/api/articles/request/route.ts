import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ArticleCategory } from '@/types'

export async function POST(request: Request) {
  const { topic, category, requester_email } = await request.json() as {
    topic: string
    category: ArticleCategory
    requester_email: string | null
  }

  if (!topic?.trim()) {
    return NextResponse.json({ message: 'Topic is required' }, { status: 400 })
  }

  const supabase = createClient()
  const { error } = await supabase.from('topic_requests').insert({
    topic: topic.trim(),
    category,
    requester_email: requester_email || null,
    status: 'pending',
  })

  if (error) {
    return NextResponse.json({ message: 'Failed to save request' }, { status: 500 })
  }

  return NextResponse.json({ message: 'Request submitted' })
}
