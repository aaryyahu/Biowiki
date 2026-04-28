'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Nav } from '@/components/layout/Nav'
import { cn } from '@/lib/utils'

interface Message {
  role:     'user' | 'assistant'
  content:  string
  sources?: { title: string; slug: string }[]
  loading?: boolean
}

const SUGGESTED = [
  'What nootropics have the strongest evidence for memory?',
  'What does research say about cold exposure and performance?',
  'What are the safest longevity compounds?',
  'How does intermittent fasting affect cognitive function?',
]

export default function AskPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text?: string) {
    const q = (text ?? input).trim()
    if (!q || loading) return

    setInput('')
    const userMsg: Message    = { role: 'user',      content: q }
    const assistantMsg: Message = { role: 'assistant', content: '', loading: true }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setLoading(true)

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: history }),
      })

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let sources: Message['sources'] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const lines = decoder.decode(value).split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break
          try {
            const parsed = JSON.parse(raw)
            if (parsed.text) {
              fullText += parsed.text
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: fullText,
                  loading: true,
                }
                return updated
              })
            }
            if (parsed.sources) sources = parsed.sources
          } catch { /* skip malformed */ }
        }
      }

      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role:    'assistant',
          content: fullText,
          sources,
          loading: false,
        }
        return updated
      })
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role:    'assistant',
          content: `Sorry, something went wrong. ${String(err)}`,
          loading: false,
        }
        return updated
      })
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />

      <main className="flex-1 flex flex-col mx-auto w-full max-w-3xl px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-bio-400 animate-pulse" />
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Powered by Claude + BioWiki knowledge base
            </span>
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
            Ask the wiki
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Questions answered from peer-reviewed research, with citations.
          </p>
        </div>

        {/* Suggestions (only when no messages) */}
        {messages.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            {SUGGESTED.map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                className="card text-left p-4 text-sm transition-all duration-150 hover:-translate-y-0.5"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 space-y-6 mb-6">
          {messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div
          className="rounded-xl border p-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
        >
          <textarea
            ref={inputRef}
            rows={2}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about biohacking, nootropics, longevity…"
            disabled={loading}
            className="w-full bg-transparent text-sm resize-none outline-none placeholder:text-[var(--color-text-muted)]"
            style={{ color: 'var(--color-text-primary)' }}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              ↵ to send · Shift+↵ for newline
            </span>
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="btn-primary text-xs px-4 py-1.5 disabled:opacity-40"
            >
              {loading ? 'Thinking…' : 'Ask'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: 'var(--color-text-muted)' }}>
          Not medical advice. Always consult a healthcare professional before changing your regimen.
        </p>
      </main>
    </div>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-3', isUser && 'justify-end')}>
      {!isUser && (
        <div
          className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center mt-0.5"
          style={{ background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border)' }}
        >
          <span className="h-2 w-2 rounded-full bg-bio-400" />
        </div>
      )}

      <div className={cn('max-w-[85%] space-y-3', isUser && 'items-end')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm leading-relaxed',
            isUser
              ? 'rounded-tr-sm bg-bio-400 text-white'
              : 'rounded-tl-sm'
          )}
          style={!isUser ? {
            background:  'var(--color-bg-card)',
            border:      '0.5px solid var(--color-border)',
            color:       'var(--color-text-secondary)',
          } : {}}
        >
          {message.loading && !message.content ? (
            <ThinkingDots />
          ) : (
            <FormattedContent content={message.content} />
          )}
        </div>

        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.sources.map(s => (
              <Link
                key={s.slug}
                href={`/articles/${s.slug}`}
                className="text-xs rounded-full border px-3 py-1 transition-colors hover:border-bio-400 hover:text-bio-400"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
              >
                {s.title} ↗
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="flex gap-1 items-center py-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-bio-400 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}

function FormattedContent({ content }: { content: string }) {
  // Simple markdown-like rendering for bold and line breaks
  const parts = content.split('\n').map((line, i) => {
    const formatted = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    return (
      <span key={i}>
        {i > 0 && <br />}
        <span dangerouslySetInnerHTML={{ __html: formatted }} />
      </span>
    )
  })
  return <>{parts}</>
}
