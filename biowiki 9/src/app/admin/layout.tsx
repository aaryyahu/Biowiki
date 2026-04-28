import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin' }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login?redirect=/admin')

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim())
  const isAdmin = adminEmails.includes(user.email || '') || user.app_metadata?.role === 'admin'
  if (!isAdmin) redirect('/')

  const NAV = [
    { href: '/admin',           label: 'Dashboard' },
    { href: '/admin/pipeline',  label: 'Pipeline' },
    { href: '/admin/articles',  label: 'Articles' },
    { href: '/admin/requests',  label: 'Requests' },
  ]

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-48 shrink-0 border-r flex flex-col"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <Link href="/" className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-bio-400" />
            <span className="text-sm font-semibold">Bio<span className="text-bio-400">Wiki</span></span>
          </Link>
          <div className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>Admin panel</div>
        </div>
        <nav className="p-3 flex flex-col gap-1 flex-1">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-md px-3 py-2 text-sm transition-colors hover:bg-white/5"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
            {user.email}
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
