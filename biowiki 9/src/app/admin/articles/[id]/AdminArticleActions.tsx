'use client'

import { useState }  from 'react'
import { useRouter }  from 'next/navigation'
import type { Article } from '@/types'

interface Props { article: Article }

export default function AdminArticleActions({ article }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/articles/${article.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await res.text())
    router.refresh()
  }

  async function act(key: string, fn: () => Promise<void>) {
    setLoading(key)
    try { await fn() } catch (e) { alert(String(e)) }
    finally { setLoading(null) }
  }

  const isDraft     = article.status === 'draft'
  const isPublished = article.status === 'published'

  return (
    <div className="flex flex-col gap-2 shrink-0">
      {isDraft && (
        <button
          className="btn-primary text-sm px-4 py-2"
          disabled={loading !== null || !article.content}
          onClick={() => act('publish', () => patch({ status: 'published' }))}
        >
          {loading === 'publish' ? 'Publishing…' : 'Publish article'}
        </button>
      )}

      {isPublished && (
        <button
          className="btn-secondary text-sm px-4 py-2"
          disabled={loading !== null}
          onClick={() => act('draft', () => patch({ status: 'draft' }))}
        >
          {loading === 'draft' ? 'Reverting…' : 'Revert to draft'}
        </button>
      )}

      {isPublished && (
        <a
          href={`/articles/${article.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-sm px-4 py-2 text-center"
        >
          View live ↗
        </a>
      )}

      <button
        className="btn-ghost text-sm px-4 py-2"
        disabled={loading !== null}
        onClick={() => act('archive', () => patch({ status: 'archived' }))}
      >
        {loading === 'archive' ? 'Archiving…' : 'Archive'}
      </button>
    </div>
  )
}
