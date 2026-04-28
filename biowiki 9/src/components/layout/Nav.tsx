'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { SearchBar } from '@/components/ui/SearchBar'

const NAV_LINKS = [
  { href: '/',          label: 'Explore' },
  { href: '/articles',  label: 'Articles' },
  { href: '/ask',       label: 'Ask AI' },
  { href: '/request',   label: 'Request topic' },
]

export function Nav() {
  const pathname = usePathname()
  const router   = useRouter()

  return (
    <header className="sticky top-0 z-50 border-b" style={{ borderColor: 'var(--color-border)', background: 'rgba(10,9,9,0.85)', backdropFilter: 'blur(16px)' }}>
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-bio-400/10 border border-bio-400/20">
            <span className="h-2.5 w-2.5 rounded-full bg-bio-400" />
          </span>
          <span className="text-sm font-semibold tracking-tight hidden sm:block" style={{ color: 'var(--color-text-primary)' }}>
            Bio<span className="text-bio-400">Wiki</span>
          </span>
        </Link>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-1 shrink-0">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors duration-150',
                  active
                    ? 'text-bio-400 bg-bio-400/10'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/5'
                )}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Search bar */}
        <div className="flex-1 max-w-sm">
          <SearchBar
            placeholder="Search articles…"
            onSelect={result => router.push(`/articles/${result.slug}`)}
          />
        </div>

        {/* Right */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden lg:flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-bio-400 animate-pulse" />
            AI-generated
          </span>
          <Link href="/admin" className="btn-ghost rounded-md px-3 py-1.5 text-sm">
            Admin
          </Link>
        </div>
      </div>
    </header>
  )
}
