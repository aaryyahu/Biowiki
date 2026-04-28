'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { CATEGORY_LABELS, type ArticleCategory } from '@/types'

interface SearchResult {
  article_id: string
  slug:        string
  title:       string
  summary:     string
  category:    string
  similarity:  number
}

interface SearchBarProps {
  className?:   string
  placeholder?: string
  autoFocus?:   boolean
  onSelect?:    (result: SearchResult) => void
  /** If true, show results inline (for /ask page) instead of navigating */
  inline?:      boolean
}

export function SearchBar({
  className,
  placeholder = 'Search articles…',
  autoFocus   = false,
  onSelect,
  inline      = false,
}: SearchBarProps) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
  const [focused, setFocused] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)
  const timerRef     = useRef<ReturnType<typeof setTimeout>>()

  // ── Debounced search ──────────────────────────────────────────────────────
  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=6`)
      const data = await res.json() as { results: SearchResult[] }
      setResults(data.results ?? [])
      setOpen(true)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    clearTimeout(timerRef.current)
    if (query.length < 2) { setResults([]); setOpen(false); return }
    timerRef.current = setTimeout(() => search(query), 300)
    return () => clearTimeout(timerRef.current)
  }, [query, search])

  // ── Click-outside to close ────────────────────────────────────────────────
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Keyboard nav ──────────────────────────────────────────────────────────
  const [selectedIdx, setSelectedIdx] = useState(-1)

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, -1)) }
    if (e.key === 'Escape')    { setOpen(false); setSelectedIdx(-1) }
    if (e.key === 'Enter' && selectedIdx >= 0) {
      const r = results[selectedIdx]
      if (r) handleSelect(r)
    }
  }

  function handleSelect(result: SearchResult) {
    setOpen(false)
    setQuery('')
    onSelect?.(result)
    if (!inline && !onSelect) {
      window.location.href = `/articles/${result.slug}`
    }
  }

  const showDropdown = open && results.length > 0

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      {/* Input */}
      <div
        className="flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all duration-150"
        style={{
          borderColor: focused ? 'var(--color-primary)' : 'var(--color-border)',
          background:  'var(--color-bg-elevated)',
          boxShadow:   focused ? '0 0 0 3px rgba(29,158,117,0.12)' : 'none',
        }}
      >
        {/* Search icon */}
        <svg width="15" height="15" fill="none" viewBox="0 0 16 16" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>

        <input
          ref={inputRef}
          type="search"
          autoFocus={autoFocus}
          value={query}
          onChange={e => { setQuery(e.target.value); setSelectedIdx(-1) }}
          onFocus={() => { setFocused(true); if (results.length > 0) setOpen(true) }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-text-muted)]"
          style={{ color: 'var(--color-text-primary)' }}
        />

        {/* Spinner */}
        {loading && (
          <span className="h-3.5 w-3.5 rounded-full border-2 border-transparent border-t-bio-400 animate-spin shrink-0" />
        )}

        {/* Clear */}
        {query && !loading && (
          <button
            onClick={() => { setQuery(''); setResults([]); setOpen(false); inputRef.current?.focus() }}
            className="shrink-0 rounded p-0.5 hover:bg-white/10 transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full mt-2 z-50 rounded-xl border overflow-hidden"
          style={{
            borderColor: 'var(--color-border)',
            background:  'var(--color-bg-card)',
            boxShadow:   '0 8px 32px rgba(0,0,0,0.3)',
          }}
        >
          {results.map((result, i) => (
            <ResultRow
              key={result.article_id}
              result={result}
              selected={i === selectedIdx}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setSelectedIdx(i)}
            />
          ))}

          <div
            className="px-4 py-2 text-xs border-t"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            Semantic search · {results.length} result{results.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Result row ───────────────────────────────────────────────────────────────

function ResultRow({
  result,
  selected,
  onClick,
  onMouseEnter,
}: {
  result:       SearchResult
  selected:     boolean
  onClick:      () => void
  onMouseEnter: () => void
}) {
  const categoryLabel = CATEGORY_LABELS[result.category as ArticleCategory] ?? result.category
  const pct           = Math.round(result.similarity * 100)

  return (
    <button
      className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors"
      style={{ background: selected ? 'var(--color-bg-elevated)' : 'transparent' }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      {/* Similarity bar */}
      <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
        <div
          className="h-8 w-1 rounded-full overflow-hidden"
          style={{ background: 'var(--color-border)' }}
        >
          <div
            className="w-full rounded-full bg-bio-400 transition-all"
            style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
          />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
            {result.title}
          </span>
          <span
            className="shrink-0 text-xs px-1.5 py-0.5 rounded-full"
            style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-text-muted)' }}
          >
            {categoryLabel}
          </span>
        </div>
        <p className="text-xs line-clamp-1" style={{ color: 'var(--color-text-muted)' }}>
          {result.summary}
        </p>
      </div>
    </button>
  )
}
