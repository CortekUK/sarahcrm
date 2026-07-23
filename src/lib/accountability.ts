// Shared constants + helpers for the Accountability module (admin + staff).

import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/types/database'

export type AccTaskRow = Database['public']['Tables']['accountability_tasks']['Row']
export type AccCommentRow =
  Database['public']['Tables']['accountability_task_comments']['Row']
export type AccAttachmentRow =
  Database['public']['Tables']['accountability_task_attachments']['Row']
export type AccActivityRow =
  Database['public']['Tables']['accountability_task_activity']['Row']

export const ACC_BUCKET = 'accountability-files'

export type AccStatus = 'not_started' | 'in_progress' | 'blocked' | 'done'

export const ACC_STATUS_META: Record<
  string,
  { label: string; variant: 'active' | 'upcoming' | 'draft' | 'urgent' | 'info' }
> = {
  not_started: { label: 'Not started', variant: 'draft' },
  in_progress: { label: 'In progress', variant: 'info' },
  blocked: { label: 'Blocked', variant: 'urgent' },
  done: { label: 'Done', variant: 'active' },
}

export const ACC_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]

export interface PersonLite {
  id: string
  first_name: string | null
  last_name: string | null
}

export function personName(p: PersonLite | undefined | null): string {
  if (!p) return 'Someone'
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed'
}

export function isAccOverdue(t: AccTaskRow): boolean {
  if (!t.deadline || t.status === 'done') return false
  return new Date(t.deadline).getTime() < Date.now()
}

// Human-readable one-liner for an activity event.
export function describeActivity(
  a: AccActivityRow,
  peopleById: Record<string, PersonLite>,
): string {
  const detail = (a.detail ?? {}) as Record<string, unknown>
  const statusLabel = (s: unknown) =>
    ACC_STATUS_META[String(s)]?.label ?? String(s ?? '')
  switch (a.event_type) {
    case 'created':
      return 'created the task'
    case 'status_changed':
      return `changed status from “${statusLabel(detail.from)}” to “${statusLabel(detail.to)}”`
    case 'reassigned': {
      const to = detail.to ? personName(peopleById[String(detail.to)]) : 'unassigned'
      return `reassigned the task to ${to}`
    }
    case 'outcome_recorded':
      return 'recorded an outcome'
    case 'comment_added':
      return 'added a comment'
    case 'attachment_added':
      return `attached a file${detail.file_name ? ` (${String(detail.file_name)})` : ''}`
    default:
      return a.event_type
  }
}

// Uploads a file to the private accountability bucket under "<taskId>/..." and
// inserts the attachments row. RLS enforces that the caller owns the task (or
// is an admin). Returns the inserted row or an error message.
export async function uploadAccAttachment(
  taskId: string,
  file: File,
  uploadedBy: string | null,
): Promise<{ row?: AccAttachmentRow; error?: string }> {
  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  const path = `${taskId}/${crypto.randomUUID()}-${safeName}`
  const up = await supabase.storage.from(ACC_BUCKET).upload(path, file, {
    upsert: false,
  })
  if (up.error) return { error: up.error.message }
  const { data, error } = await supabase
    .from('accountability_task_attachments')
    .insert({
      task_id: taskId,
      uploaded_by: uploadedBy,
      file_path: path,
      file_name: file.name,
    })
    .select('*')
    .single()
  if (error) {
    // Best-effort cleanup of the orphaned object.
    await supabase.storage.from(ACC_BUCKET).remove([path])
    return { error: error.message }
  }
  return { row: data }
}

// Short-lived signed URL for downloading a private attachment.
export async function accSignedUrl(filePath: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(ACC_BUCKET)
    .createSignedUrl(filePath, 60 * 10)
  return data?.signedUrl ?? null
}
