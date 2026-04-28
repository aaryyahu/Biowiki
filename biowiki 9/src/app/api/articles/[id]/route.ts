import { NextResponse }    from 'next/server'
import { createClient }    from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  // Auth
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim())
  const isAdmin     = adminEmails.includes(user.email ?? '') || user.app_metadata?.role === 'admin'
  if (!isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const body  = await request.json() as Record<string, unknown>
  const admin = createAdminClient()

  // Only allow safe fields to be patched
  const allowed = ['status', 'title', 'summary'] as const
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  const { error } = await admin
    .from('articles')
    .update(update)
    .eq('id', params.id)

  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
