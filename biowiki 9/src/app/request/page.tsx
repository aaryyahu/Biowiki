'use client'

import { useState } from 'react'
import { Nav } from '@/components/layout/Nav'
import { CATEGORY_LABELS, type ArticleCategory } from '@/types'

export default function RequestPage() {
  const [topic, setTopic]     = useState('')
  const [category, setCategory] = useState<ArticleCategory>('nootropics')
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)

  async function submit() {
    if (!topic.trim()) return
    setLoading(true)
    try {
      await fetch('/api/articles/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), category, requester_email: email || null }),
      })
      setDone(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Request a topic
        </h1>
        <p className="text-sm mb-8 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          Suggest a compound, protocol, or technology you'd like us to research. We'll run the
          AI pipeline and publish a full evidence-based article.
        </p>

        {done ? (
          <div className="rounded-xl border p-6 text-center" style={{ borderColor: 'rgba(29,158,117,0.3)', background: 'rgba(29,158,117,0.05)' }}>
            <div className="text-2xl mb-3">✓</div>
            <p className="text-sm font-medium text-bio-400">Request submitted!</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              We'll notify you when the article is published.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                Topic *
              </label>
              <input
                className="input"
                placeholder="e.g. Berberine, cold plunge protocol, BDNF"
                value={topic}
                onChange={e => setTopic(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                Category
              </label>
              <select className="input" value={category} onChange={e => setCategory(e.target.value as ArticleCategory)}>
                {(Object.entries(CATEGORY_LABELS) as [ArticleCategory, string][]).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                Email (optional — to notify you)
              </label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <button
              className="btn-primary w-full py-2.5"
              onClick={submit}
              disabled={loading || !topic.trim()}
            >
              {loading ? 'Submitting…' : 'Submit request'}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
