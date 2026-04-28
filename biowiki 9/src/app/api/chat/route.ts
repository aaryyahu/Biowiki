import { NextResponse }          from 'next/server'
import Anthropic                  from '@anthropic-ai/sdk'
import { searchChunks }           from '@/lib/search'
import { embedQuery }             from '@/lib/pipeline/embed'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `You are BioWiki's AI assistant — a knowledgeable, scientifically rigorous guide to biohacking, nootropics, and evidence-based health optimisation.

You answer questions ONLY using the provided article context below. If the context doesn't contain enough information to answer, say so clearly and suggest the user browse the relevant category.

Rules:
- Cite your sources inline using [Article Title] format
- Use hedging language: "studies suggest", "evidence indicates", "may", "appears to"
- Never give medical advice or recommend specific doses for the user personally — only report what studies used
- Be concise and direct. No waffle.
- If asked about something not in the context, say: "I don't have information on that in our knowledge base yet. You can request it at /request."`

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    messages: { role: 'user' | 'assistant'; content: string }[]
  } | null

  if (!body?.messages?.length) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 })
  }

  const lastUserMessage = [...body.messages].reverse().find(m => m.role === 'user')
  if (!lastUserMessage) {
    return NextResponse.json({ error: 'No user message found' }, { status: 400 })
  }

  // ── Retrieve relevant chunks ───────────────────────────────────────────────
  let context = ''
  let sources: { title: string; slug: string }[] = []

  try {
    const chunks = await searchChunks(lastUserMessage.content, 6, 0.45)

    if (chunks.length > 0) {
      // Group by article, keep top 2 chunks per article
      const byArticle = new Map<string, typeof chunks>()
      for (const chunk of chunks) {
        const arr = byArticle.get(chunk.article_id) ?? []
        if (arr.length < 2) {
          arr.push(chunk)
          byArticle.set(chunk.article_id, arr)
        }
      }

      const contextSections: string[] = []
      for (const [, articleChunks] of byArticle) {
        const { title, slug } = articleChunks[0]
        sources.push({ title, slug })
        const text = articleChunks.map(c => c.chunk_text).join('\n\n')
        contextSections.push(`## ${title}\n${text}`)
      }

      context = contextSections.join('\n\n---\n\n')
    }
  } catch (err) {
    console.warn('[chat] RAG retrieval failed:', String(err))
    // Continue without context — Claude will say it doesn't have info
  }

  // ── Build messages for Claude ─────────────────────────────────────────────
  const systemWithContext = context
    ? `${SYSTEM}\n\n---\n## Retrieved context\n\n${context}\n---`
    : SYSTEM

  // Convert history, inject sources reminder into last user message
  const messages = body.messages.map((m, i) => {
    if (i === body.messages.length - 1 && m.role === 'user' && context) {
      return {
        role:    m.role as 'user',
        content: `${m.content}\n\n(Answer using the provided context. Cite article titles inline.)`,
      }
    }
    return { role: m.role as 'user' | 'assistant', content: m.content }
  })

  // ── Stream Claude response ────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = await client.messages.stream({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system:     systemWithContext,
          messages,
        })

        for await (const chunk of claudeStream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
            )
          }
        }

        // Send sources at end
        if (sources.length > 0) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ sources })}\n\n`)
          )
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (err) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
