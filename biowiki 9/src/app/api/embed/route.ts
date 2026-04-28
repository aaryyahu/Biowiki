import { NextResponse }    from 'next/server'
import { createClient }    from '@/lib/supabase/server'
import { embedArticle, embedAllPending } from '@/lib/pipeline/embed'

export const maxDuration = 120

export async function POST(request: Request) {
  // Auth
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim())
  const isAdmin = adminEmails.includes(user.email ?? '') || user.app_metadata?.role === 'admin'
  if (!isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as {
    articleId?: string   // embed one specific article
    all?:       boolean  // embed all pending articles
  }

  if (body.articleId) {
    // Embed a single article
    const { data: article } = await supabase
      .from('articles')
      .select('id, title, summary, content')
      .eq('id', body.articleId)
      .single()

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
