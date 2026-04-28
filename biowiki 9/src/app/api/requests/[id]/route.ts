import { NextResponse }    from 'next/server'
import { createClient }    from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim())
  const isAdmin = adminEmails.includes(user.email ?? '') || user.app_metadata?.role === 'admin'
  if (!isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { status, notes } = await request.json() as { status?: string; notes?: string }
  const validStatuses = ['pending', 'approved', 'rejected', 'generated']
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ message: 'Invalid status' }, { status: 400 })
  }

  const update: Record<string, string> = {}
  if (status) update.status = status
  if (notes)  update.notes  = notes

  const admin = createAdminClient()
  const { error } = await admin
    .from('topic_requests')
    .update(update)
    .eq('id', params.id)

  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
