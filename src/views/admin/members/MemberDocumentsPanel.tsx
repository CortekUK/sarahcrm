'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { formatDate } from '@/lib/utils'
import { FileText, Upload, Eye, Trash2, Loader2 } from 'lucide-react'
import type { Database } from '@/types/database'

type DocRow = Database['public']['Tables']['member_documents']['Row']

const BUCKET = 'member-documents'
const MAX_MB = 25
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg'

const DOC_TYPES = [
  { value: 'onboarding', label: 'Onboarding form' },
  { value: 'nda', label: 'NDA' },
  { value: 'introducer_agreement', label: 'Introducer / commission agreement' },
  { value: 'membership_agreement', label: 'Membership agreement' },
  { value: 'contract', label: 'Contract' },
  { value: 'other', label: 'Other' },
]
const DOC_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  DOC_TYPES.map((d) => [d.value, d.label]),
)

// Storage-safe object path: <memberId>/<timestamp>-<rand>-<slug>.<ext>
function buildPath(memberId: string, fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : 'bin'
  const base = (dot >= 0 ? fileName.slice(0, dot) : fileName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'file'
  const stamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  return `${memberId}/${stamp}-${rand}-${base}.${ext}`
}

function prettySize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function MemberDocumentsPanel({ memberId }: { memberId: string }) {
  const confirm = useConfirm()
  const { profile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [docs, setDocs] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [docType, setDocType] = useState('onboarding')
  const [openingId, setOpeningId] = useState<string | null>(null)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('member_documents')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
    if (data) setDocs(data)
    setLoading(false)
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // reset the input so choosing the same file again re-triggers change
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    if (file.size > MAX_MB * 1024 * 1024) {
      toast({ title: 'File too large', description: `Max ${MAX_MB} MB.`, variant: 'destructive' })
      return
    }

    setUploading(true)
    const path = buildPath(memberId, file.name)
    const up = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    })
    if (up.error) {
      setUploading(false)
      toast({ title: 'Upload failed', description: up.error.message, variant: 'destructive' })
      return
    }

    const { error } = await supabase.from('member_documents').insert({
      member_id: memberId,
      doc_type: docType,
      file_name: file.name,
      file_path: path,
      content_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: profile?.id ?? null,
    })
    setUploading(false)
    if (error) {
      // roll back the orphaned object so storage and the table stay in sync
      await supabase.storage.from(BUCKET).remove([path])
      toast({ title: 'Could not save document', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: 'Document uploaded' })
    load()
  }

  async function viewDoc(doc: DocRow) {
    setOpeningId(doc.id)
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path, 60)
    setOpeningId(null)
    if (error || !data?.signedUrl) {
      toast({ title: 'Could not open', description: error?.message, variant: 'destructive' })
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function removeDoc(doc: DocRow) {
    const ok = await confirm({
      title: 'Delete this document?',
      description: `“${doc.file_name}” is permanently removed from the vault. This cannot be undone.`,
      confirmLabel: 'Delete document',
      tone: 'danger',
    })
    if (!ok) return
    await supabase.storage.from(BUCKET).remove([doc.file_path])
    const { error } = await supabase.from('member_documents').delete().eq('id', doc.id)
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' })
      return
    }
    setDocs((d) => d.filter((x) => x.id !== doc.id))
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle>Documents</CardTitle>
            <p className="text-sm text-text-muted mt-1">
              Onboarding forms, agreements and NDAs. Stored privately — opened via secure,
              time-limited links.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-52">
              <Select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                options={DOC_TYPES}
              />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={onFileChosen}
            />
            <Button
              icon={uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              Upload
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
          </div>
        ) : docs.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-text-dim py-4">
            <FileText size={15} /> No documents yet — upload onboarding forms, agreements or NDAs
            above.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 py-3">
                <div className="w-9 h-9 rounded-[var(--radius-md)] bg-gold-muted flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-gold" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text truncate">{doc.file_name}</p>
                  <p className="text-xs text-text-dim">
                    {DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}
                    {doc.size_bytes ? ` · ${prettySize(doc.size_bytes)}` : ''} ·{' '}
                    {formatDate(doc.created_at)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={
                    openingId === doc.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Eye size={14} />
                    )
                  }
                  onClick={() => viewDoc(doc)}
                >
                  View
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-accent-warm"
                  icon={<Trash2 size={14} />}
                  onClick={() => removeDoc(doc)}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
