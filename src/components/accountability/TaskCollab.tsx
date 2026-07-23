'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/lib/hooks/use-toast'
import { formatDateTime } from '@/lib/utils'
import {
  MessageSquare,
  Paperclip,
  History,
  Loader2,
  Download,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  type AccCommentRow,
  type AccAttachmentRow,
  type AccActivityRow,
  type PersonLite,
  personName,
  describeActivity,
  uploadAccAttachment,
  accSignedUrl,
} from '@/lib/accountability'

interface TaskCollabProps {
  taskId: string
  currentUserId: string | null
  peopleById: Record<string, PersonLite>
  // Staff may delete only their own uploads; admins may delete any (RLS still
  // enforces this server-side).
  canDeleteAttachment?: (att: AccAttachmentRow) => boolean
}

// Comments + attachments + activity history for one accountability task.
// Shared by the admin task editor and the staff task view. All reads/writes go
// through the browser Supabase client, so RLS is the single source of truth for
// what the signed-in user may see or do.
export function TaskCollab({
  taskId,
  currentUserId,
  peopleById,
  canDeleteAttachment,
}: TaskCollabProps) {
  const [comments, setComments] = useState<AccCommentRow[]>([])
  const [attachments, setAttachments] = useState<AccAttachmentRow[]>([])
  const [activity, setActivity] = useState<AccActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [c, at, ac] = await Promise.all([
        supabase
          .from('accountability_task_comments')
          .select('*')
          .eq('task_id', taskId)
          .order('created_at', { ascending: true }),
        supabase
          .from('accountability_task_attachments')
          .select('*')
          .eq('task_id', taskId)
          .order('created_at', { ascending: true }),
        supabase
          .from('accountability_task_activity')
          .select('*')
          .eq('task_id', taskId)
          .order('created_at', { ascending: false }),
      ])
      if (cancelled) return
      if (c.data) setComments(c.data)
      if (at.data) setAttachments(at.data)
      if (ac.data) setActivity(ac.data)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [taskId])

  async function refreshActivity() {
    const { data } = await supabase
      .from('accountability_task_activity')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
    if (data) setActivity(data)
  }

  async function addComment() {
    const body = newComment.trim()
    if (!body) return
    setPosting(true)
    const { data, error } = await supabase
      .from('accountability_task_comments')
      .insert({ task_id: taskId, body, author_id: currentUserId })
      .select('*')
      .single()
    setPosting(false)
    if (error) {
      toast({ title: 'Could not add comment', description: error.message, variant: 'destructive' })
      return
    }
    if (data) setComments((c) => [...c, data])
    setNewComment('')
    refreshActivity()
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) e.target.value = '' // allow re-picking the same file
    if (!file) return
    setUploading(true)
    const res = await uploadAccAttachment(taskId, file, currentUserId)
    setUploading(false)
    if (res.error) {
      toast({ title: 'Upload failed', description: res.error, variant: 'destructive' })
      return
    }
    if (res.row) setAttachments((a) => [...a, res.row!])
    toast({ title: 'File attached' })
    refreshActivity()
  }

  async function download(att: AccAttachmentRow) {
    const url = await accSignedUrl(att.file_path)
    if (!url) {
      toast({ title: 'Could not open file', variant: 'destructive' })
      return
    }
    window.open(url, '_blank', 'noopener')
  }

  async function removeAttachment(att: AccAttachmentRow) {
    const { error } = await supabase
      .from('accountability_task_attachments')
      .delete()
      .eq('id', att.id)
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' })
      return
    }
    await supabase.storage.from('accountability-files').remove([att.file_path])
    setAttachments((a) => a.filter((x) => x.id !== att.id))
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-dim py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Attachments */}
      <div>
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-text-dim mb-3">
          <Paperclip size={13} /> Attachments
        </p>
        <div className="space-y-1.5 mb-3">
          {attachments.length === 0 ? (
            <p className="text-sm text-text-dim italic">No files attached.</p>
          ) : (
            attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 rounded-[var(--radius-md)] bg-surface-2 px-3 py-2"
              >
                <Paperclip size={13} className="text-text-dim shrink-0" />
                <span className="text-sm text-text truncate flex-1">{att.file_name}</span>
                <button
                  type="button"
                  onClick={() => download(att)}
                  className="text-text-dim hover:text-text transition-colors"
                  title="Download"
                >
                  <Download size={15} />
                </button>
                {canDeleteAttachment?.(att) && (
                  <button
                    type="button"
                    onClick={() => removeAttachment(att)}
                    className="text-text-dim hover:text-accent-warm transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        <input ref={fileRef} type="file" className="hidden" onChange={onFilePicked} />
        <Button
          variant="secondary"
          size="sm"
          icon={uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading…' : 'Upload file'}
        </Button>
      </div>

      {/* Comments */}
      <div className="pt-2 border-t border-border">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-text-dim mb-3">
          <MessageSquare size={13} /> Comments
        </p>
        <div className="space-y-2 mb-3 max-h-56 overflow-y-auto">
          {comments.length === 0 ? (
            <p className="text-sm text-text-dim italic">No comments yet.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="rounded-[var(--radius-md)] bg-surface-2 px-3 py-2">
                <p className="text-sm text-text whitespace-pre-wrap">{c.body}</p>
                <p className="text-[11px] text-text-dim mt-1">
                  {c.author_id ? personName(peopleById[c.author_id]) : 'Someone'} ·{' '}
                  {formatDateTime(c.created_at)}
                </p>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Add a comment…"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !posting && addComment()}
          />
          <Button variant="secondary" onClick={addComment} disabled={!newComment.trim() || posting}>
            Post
          </Button>
        </div>
      </div>

      {/* Activity history */}
      <div className="pt-2 border-t border-border">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-text-dim mb-3">
          <History size={13} /> Activity
        </p>
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {activity.length === 0 ? (
            <p className="text-sm text-text-dim italic">No activity yet.</p>
          ) : (
            activity.map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-[13px]">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gold shrink-0" />
                <p className="text-text-muted leading-snug">
                  <span className="text-text font-medium">
                    {a.actor_id ? personName(peopleById[a.actor_id]) : 'Someone'}
                  </span>{' '}
                  {describeActivity(a, peopleById)}
                  <span className="text-text-dim"> · {formatDateTime(a.created_at)}</span>
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
