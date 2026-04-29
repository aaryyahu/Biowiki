import { createAdminClient } from '@/lib/supabase/server'
import { formatRelativeDate } from '@/lib/utils'
import { CATEGORY_LABELS }    from '@/types'
import RequestActions          from './RequestActions'
import type { Metadata }       from 'next'

export const metadata: Metadata = { title: 'Topic requests' }
export const revalidate = 0

interface RequestRow {
  id: string
  topic: string
  category: string
  requester_email: string | null
  status: string
  created_at: string
  notes: string | null
}

async function getRequests(): Promise<RequestRow[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('topic_requests')
    .select('*')
    .order('created_at', { ascending: false })
  return (data ?? []) as RequestRow[]
}

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  approved:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  rejected:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  generated: 'bg-bio-100 text-bio-800 dark:bg-bio-900/30 dark:text-bio-300',
}

export default async function RequestsPage() {
  const requests = await getRequests()
  const pending  = requests.filter((r: RequestRow) => r.status === 'pending').length

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Topic requests
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {pending > 0 ? `${pending} pending` : 'No pending requests'}
          </p>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            No topic requests yet. They appear here when visitors submit the request form.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs" style={{ borderColor: 'var(--color-border)' }}>
                {['Topic', 'Category', 'Requester', 'Status', 'Submitted', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left font-medium" style={{ color: 'var(--color-text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((req: RequestRow) => (
                <tr key={req.id} className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="px-5 py-3.5 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {req.topic}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="badge bg-bio-100/50 text-bio-700 dark:bg-bio-900/20 dark:text-bio-400 text-xs">
                      {CATEGORY_LABELS[req.category as keyof typeof CATEGORY_LABELS] ?? req.category}
                    </span>
                  </td>
                  <td className="px-5 py-3.5" style={{ color: 'var(--color-text-muted)' }}>
                    {req.requester_email ?? '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`badge text-xs ${STATUS_STYLES[req.status] ?? ''}`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5" style={{ color: 'var(--color-text-muted)' }}>
                    {formatRelativeDate(req.created_at)}
                  </td>
                  <td className="px-5 py-3.5">
                    <RequestActions request={req as any} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
