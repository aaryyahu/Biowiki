'use client'

import { useState }   from 'react'
import { useRouter }  from 'next/navigation'
import type { TopicRequest } from '@/types'

interface Props { request: TopicRequest }

export default function RequestActions({ request }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()

  async function patch(status: string) {
    setLoading(status)
    await fetch(`/api/requests/${request.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status }),
    })
    router.refresh()
    setLoading(null)
  }

  async function generate() {
    setLoading('generate')
    try {
      const res = await fetch('/api/pipeline', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          topic:    request.topic,
          category: request.category,
          autoPublish: false,
        }),
      })
      if (res.ok) {
        // Mark as generated
        await fetch(`/api/requests/${request.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ status: 'generated' }),
        })
        router.refresh()
      }
    } finally {
      setLoading(null)
    }
  }

  const isPending   = request.status === 'pending'
  const isApproved  = request.status === 'approved'
  const isGenerated = request.status === 'generated'
  const isRejected  = request.status === 'rejected'
  const busy        = loading !== null

  if (isGenerated || isRejected) {
    return (
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {isGenerated ? 'Done' : 'Rejected'}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {isPending && (
        <>
          <button
            onClick={() => patch('approved')}
            disabled={busy}
            className="text-xs px-2.5 py-1 rounded-md border transition-colors hover:border-bio-400 hover:text-bio-400 disabled:opacity-40"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {loading === 'approved' ? '…' : 'Approve'}
          </button>
          <button
            onClick={() => patch('rejected')}
            disabled={busy}
            className="text-xs px-2.5 py-1 rounded-md border transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-40"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {loading === 'rejected' ? '…' : 'Reject'}
          </button>
        </>
      )}

      {isApproved && (
        <button
          onClick={generate}
          disabled={busy}
          className="text-xs px-2.5 py-1 rounded-md bg-bio-400 text-white hover:bg-bio-500 disabled:opacity-40 transition-colors"
        >
          {loading === 'generate' ? (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Generating…
            </span>
          ) : 'Generate article'}
        </button>
      )}
    </div>
  )
}
