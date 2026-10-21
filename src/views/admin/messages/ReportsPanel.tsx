'use client'

// Reports queue for the owner + overseers: what was reported, by whom, and a
// jump into the conversation (opens it in "All chats"). Mark reviewed or
// dismiss (PATCH /reports/:id). Member Feed reports (posts / comments) show
// the reported text and open the post on the admin Feed page instead.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Flag, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { relativeTime } from '@/components/ui/chat'
import { useReports, useUpdateReport } from '@/lib/chat/hooks'
import type { ReportStatus } from '@/lib/chat/types'
import { getApiErrorMessage } from '@/lib/http/chat-client'
import { toast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'

const FILTERS: { value: ReportStatus | 'all'; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
]

export function ReportsPanel({ onOpenConversation }: { onOpenConversation: (id: string) => void }) {
  const [status, setStatus] = useState<ReportStatus | 'all'>('open')
  const reports = useReports(status)
  const update = useUpdateReport()
  const router = useRouter()

  function set(id: string, next: ReportStatus) {
    update.mutate(
      { id, status: next },
      {
        onSuccess: () => toast({ title: next === 'reviewed' ? 'Marked reviewed' : 'Dismissed' }),
        onError: (e) => toast({ title: 'Couldn’t update report', description: getApiErrorMessage(e), variant: 'destructive' }),
      },
    )
  }

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatus(f.value)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
              status === f.value ? 'border-gold bg-gold-muted text-text' : 'border-border text-text-muted hover:text-text',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {reports.isLoading ? (
        <div className="flex justify-center py-16 text-text-dim">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : reports.isError ? (
        <p className="py-12 text-center text-sm text-text-muted">{getApiErrorMessage(reports.error, 'Reports couldn’t be loaded.')}</p>
      ) : (reports.data ?? []).length === 0 ? (
        <AdminEmptyState icon={Flag} title="Nothing reported" description="When a member reports a message or conversation it appears here for review." />
      ) : (
        <div className="space-y-3">
          {reports.data!.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <Badge variant={r.status === 'open' ? 'urgent' : r.status === 'reviewed' ? 'active' : 'draft'} dot>
                      {r.status}
                    </Badge>
                    <span className="text-xs text-text-dim">
                      {r.commentId ? 'Feed comment' : r.postId ? 'Feed post' : r.messageId ? 'Message' : 'Conversation'}
                      {r.postId
                        ? r.feedGroupId
                          ? ` · ${r.conversationTitle} posts`
                          : ' · Club feed'
                        : r.conversationTitle
                          ? ` · ${r.conversationTitle}`
                          : ''}{' '}
                      · {relativeTime(r.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-text">{r.reason}</p>
                  {r.feedBody && (
                    <blockquote className="mt-2 border-l-2 border-gold/40 pl-3 text-sm italic text-text-muted [overflow-wrap:anywhere]">
                      {r.feedBody}
                    </blockquote>
                  )}
                  {r.message?.body && (
                    <blockquote className="mt-2 border-l-2 border-gold/40 pl-3 text-sm italic text-text-muted">
                      {r.message.body}
                    </blockquote>
                  )}
                  <p className="mt-2 text-xs text-text-dim">Reported by {r.reporter?.name ?? 'a participant'}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {r.postId ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<ExternalLink size={13} />}
                      onClick={() => router.push(`/dashboard/feed?${r.feedGroupId ? `group=${r.feedGroupId}&` : ''}post=${r.postId}`)}
                    >
                      Open post
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" icon={<ExternalLink size={13} />} onClick={() => onOpenConversation(r.conversationId)}>
                      Open chat
                    </Button>
                  )}
                  {r.status === 'open' && (
                    <>
                      <Button size="sm" disabled={update.isPending} onClick={() => set(r.id, 'reviewed')}>
                        Reviewed
                      </Button>
                      <Button variant="ghost" size="sm" disabled={update.isPending} onClick={() => set(r.id, 'dismissed')}>
                        Dismiss
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
