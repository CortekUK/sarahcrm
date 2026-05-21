'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Sparkles, Search, Loader2, Mail, MoreVertical, Trash2, Copy, Edit, Send } from 'lucide-react'
import { SendTemplateModal } from '@/components/templates/SendTemplateModal'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button as SarahButton } from '@/components/ui/Button'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { Input } from '@/components/ui/Input'
import { useTemplates, useDeleteTemplate, useDuplicateTemplate } from '@/lib/hooks/useTemplates'
import { useTemplateStats } from '@/lib/hooks/useTemplateStats'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue'
import { toast } from '@/lib/hooks/use-toast'
import { formatDate } from '@/lib/utils'
import type { Template } from '@/lib/templates/types'

export function TemplatesListPage() {
  const router = useRouter()
  const { data: user } = useCurrentUser()
  const isAdmin = user?.role === 'admin'

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'all' | Template['category']>('all')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [sendTarget, setSendTarget] = useState<Template | null>(null)

  const { data: templates = [], isLoading } = useTemplates({
    search: debouncedSearch || undefined,
    category: category === 'all' ? undefined : category,
  })
  const { data: stats } = useTemplateStats()
  const deleteTemplate = useDeleteTemplate()
  const duplicateTemplate = useDuplicateTemplate()

  const counts = useMemo(
    () => ({
      total: stats?.totalTemplates ?? 0,
      campaign: stats?.campaignTemplates ?? 0,
      automation: stats?.automationTemplates ?? 0,
      draft: stats?.draftTemplates ?? 0,
    }),
    [stats],
  )

  const handleCreate = () => {
    router.push('/dashboard/communications/templates/editor')
  }

  const handleEdit = (template: Template) => {
    router.push(`/dashboard/communications/templates/editor?id=${template.id}`)
  }

  const handleDuplicate = async (template: Template) => {
    try {
      const next = await duplicateTemplate.mutateAsync(template)
      toast({ title: 'Template duplicated', description: `Created "${next.name}".` })
      router.push(`/dashboard/communications/templates/editor?id=${next.id}`)
    } catch (err) {
      toast({
        title: 'Failed to duplicate',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async (template: Template) => {
    if (!confirm(`Delete "${template.name}"? This cannot be undone.`)) return
    try {
      await deleteTemplate.mutateAsync(template.id)
      toast({ title: 'Template deleted', description: `"${template.name}" has been removed.` })
    } catch (err) {
      toast({
        title: 'Failed to delete',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  if (!user) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-sm text-text-muted">
              Email templates are admin-only.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
            Email Templates
          </h1>
          <p className="text-sm text-text-muted mt-1">
            AI-assisted email composition for member communications
          </p>
        </div>
        <SarahButton variant="primary" onClick={handleCreate}>
          <Sparkles size={16} />
          <Plus size={16} className="-ml-1" />
          New template
        </SarahButton>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatTile label="Total" value={counts.total} />
        <StatTile label="Campaign" value={counts.campaign} />
        <StatTile label="Automation" value={counts.automation} />
        <StatTile label="Drafts" value={counts.draft} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {(['all', 'campaign', 'automation', 'transactional'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors capitalize ${
                category === c
                  ? 'bg-gold text-white border-gold'
                  : 'bg-white text-text-muted border-border hover:border-border-hover'
              }`}
            >
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>{templates.length} {templates.length === 1 ? 'template' : 'templates'}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 className="h-5 w-5 animate-spin mx-auto text-text-dim" />
            </div>
          ) : templates.length === 0 ? (
            <div className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gold-muted mb-4">
                <Mail className="h-5 w-5 text-gold" />
              </div>
              <h3 className="font-medium text-text mb-1">No templates yet</h3>
              <p className="text-sm text-text-dim max-w-sm mx-auto mb-4">
                Use the AI builder to draft your first email template, or start from scratch.
              </p>
              <SarahButton variant="primary" onClick={handleCreate}>
                <Sparkles size={14} />
                Build with AI
              </SarahButton>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((tpl) => (
                  <TableRow
                    key={tpl.id}
                    className="cursor-pointer"
                    onClick={() => handleEdit(tpl)}
                  >
                    <TableCell className="font-medium text-text">{tpl.name}</TableCell>
                    <TableCell className="text-text-muted max-w-[280px] truncate">
                      {tpl.subject || <span className="text-text-dim italic">No subject</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="info" dot>
                        {tpl.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={tpl.is_draft ? 'draft' : 'active'} dot>
                        {tpl.is_draft ? 'Draft' : 'Active'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-text-muted">{formatDate(tpl.updated_at)}</TableCell>
                    <TableCell>
                      <RowMenu
                        onEdit={() => handleEdit(tpl)}
                        onSend={() => setSendTarget(tpl)}
                        onDuplicate={() => handleDuplicate(tpl)}
                        onDelete={() => handleDelete(tpl)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SendTemplateModal
        template={sendTarget}
        open={!!sendTarget}
        onClose={() => setSendTarget(null)}
      />
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">{label}</p>
        <p className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text mt-1">{value}</p>
      </CardContent>
    </Card>
  )
}

function RowMenu({
  onEdit,
  onSend,
  onDuplicate,
  onDelete,
}: {
  onEdit: () => void
  onSend: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded hover:bg-surface-2 text-text-muted"
        aria-label="More"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-md shadow-lg py-1 min-w-[160px] z-20">
            <button
              onClick={() => {
                setOpen(false)
                onSend()
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 flex items-center gap-2 text-gold font-medium"
            >
              <Send size={12} />
              Send to members…
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              onClick={() => {
                setOpen(false)
                onEdit()
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 flex items-center gap-2"
            >
              <Edit size={12} />
              Edit
            </button>
            <button
              onClick={() => {
                setOpen(false)
                onDuplicate()
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 flex items-center gap-2"
            >
              <Copy size={12} />
              Duplicate
            </button>
            <button
              onClick={() => {
                setOpen(false)
                onDelete()
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 flex items-center gap-2 text-accent-warm"
            >
              <Trash2 size={12} />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}
