import { NextResponse }    from 'next/server'
import { createClient }    from '@/lib/supabase/server'
import { embedArticle, embedAllPending } from '@/lib/pipeline/embed'

export const maxDuration = 120

interface ArticleRow {
  id: string
  title: string
  summary: string
  content: string | null
}

export async function POST(request: Request) {
  // Auth
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map((e: string) => e.trim())
  const isAdmin = adminEmails.includes(user.email ?? '') || user.app_metadata?.role === 'admin'
  if (!isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as {
    articleId?: string
    all?:       boolean
  }

  if (body.articleId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: article } = await (supabase as any)
      .from('articles')
      .select('id, title, summary, content')
      .eq('id', body.articleId)
      .single() as { data: ArticleRow | null }

    if (!article) return NextResponse.json({ message: 'Article not found' }, { status: 404 })

    const result = await embedArticle(
      article.id,
      article.content ?? '',
      article.title,
      article.summary,
    )

    return NextResponse.json({
      message: `Embedded ${result.chunksCreated} chunks for article`,
      ...result,
    })
  }

  if (body.all) {
    const result = await embedAllPending()
    return NextResponse.json({
      message: `Embedded ${result.processed} articles`,
      ...result,
    })
  }

  return NextResponse.json({ message: 'Provide articleId or all:true' }, { status: 400 })
}
