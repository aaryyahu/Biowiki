import { NextResponse }                          from 'next/server'
import { createClient, createAdminClient }       from '@/lib/supabase/server'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map((e: string) => e.trim())
  const isAdmin = adminEmails.includes(user.email ?? '') || user.app_metadata?.role === 'admin'
  if (!isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const body = await request.json() as { status?: string; notes?: string }
  const { status, notes } = body

  const validStatuses = ['draft', 'published', 'archived']
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ message: 'Invalid status' }, { status: 400 })
  }

  const update: Record<string, string> = {}
  if (status) update.status = status
  if (notes)  update.notes  = notes

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { error } = await admin
    .from('articles')
    .update(update)
    .eq('id', params.id)

  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
