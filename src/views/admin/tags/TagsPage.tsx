'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { Loader2, Plus, Pencil, Trash2, Check, X, Tag as TagIcon } from 'lucide-react'
import type { Database } from '@/types/database'

type TagRow = Database['public']['Tables']['tags']['Row']
type TagCategory = Database['public']['Enums']['tag_category']

const CATEGORY_META: { value: TagCategory; label: string; help: string }[] = [
  { value: 'industry', label: 'Industry', help: 'What a member does / their sector.' },
  { value: 'need', label: 'Looking for', help: 'What a member wants — pairs with another member’s industry.' },
  { value: 'interest', label: 'Interest', help: 'Shared passions — softer match signal.' },
  { value: 'service', label: 'Service', help: 'Other labels (not used by matchmaking).' },
]

const CATEGORY_CHIP: Record<string, string> = {
  industry: 'bg-gold-muted text-gold-dark border border-border-gold',
  need: 'bg-[rgba(111,143,122,0.1)] text-[#5C8A6B] border border-[rgba(111,143,122,0.3)]',
  interest: 'bg-[rgba(90,123,150,0.1)] text-[#5A7B96] border border-[rgba(90,123,150,0.25)]',
  service: 'bg-surface-2 text-text-muted border border-border',
}

export function TagsPage() {
  const confirm = useConfirm()
  const [tags, setTags] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState<TagCategory>('industry')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('tags').select('*').order('category').order('name')
    if (data) setTags(data)
    setLoading(false)
  }

  async function addTag() {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    const { error } = await supabase.from('tags').insert({ name, category: newCategory })
    setAdding(false)
    if (error) {
      toast({
        title: 'Could not add tag',
        description: error.message.includes('duplicate')
          ? 'That tag already exists in this category.'
          : error.message,
        variant: 'destructive',
      })
      return
    }
    setNewName('')
    toast({ title: 'Tag added' })
    load()
  }

  async function rename(tag: TagRow) {
    const name = editName.trim()
    if (!name || name === tag.name) {
      setEditingId(null)
      return
    }
    const { error } = await supabase.from('tags').update({ name }).eq('id', tag.id)
    if (error) {
      toast({ title: 'Could not rename', description: error.message, variant: 'destructive' })
      return
    }
    setEditingId(null)
    load()
  }

  async function remove(tag: TagRow) {
    const ok = await confirm({
      title: `Delete “${tag.name}”?`,
      description:
        'This tag will be removed from every member it’s assigned to. This cannot be undone.',
      confirmLabel: 'Delete tag',
      tone: 'danger',
    })
    if (!ok) return
    // Clear assignments first so the delete isn't blocked by the FK.
    await supabase.from('member_tags').delete().eq('tag_id', tag.id)
    const { error } = await supabase.from('tags').delete().eq('id', tag.id)
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' })
      return
    }
    setTags((t) => t.filter((x) => x.id !== tag.id))
  }

  const grouped = useMemo(() => {
    const map: Record<string, TagRow[]> = {}
    for (const t of tags) {
      ;(map[t.category] ??= []).push(t)
    }
    return map
  }, [tags])

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading tags…
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl">
      <AdminPageHeader
        title="Tags"
        description="The vocabulary that powers matchmaking. Members are tagged by Industry (what they do), Looking for (what they want) and Interest. The matcher pairs one member’s “Looking for” with another’s “Industry”."
        meta={<span className="text-xs text-text-dim">{tags.length} tags</span>}
      />

      {/* Add */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add a tag</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <Input
                label="Tag name"
                placeholder="e.g. Website Security"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
              />
            </div>
            <div className="sm:w-48">
              <Select
                label="Category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as TagCategory)}
                options={CATEGORY_META.map((c) => ({ value: c.value, label: c.label }))}
              />
            </div>
            <Button
              icon={adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              onClick={addTag}
              disabled={adding || !newName.trim()}
            >
              Add
            </Button>
          </div>
          <p className="mt-2 text-xs text-text-dim">
            Tip: for a match, a “Looking for” tag should mirror an “Industry” tag (same name) — e.g.
            <span className="text-text-muted"> Looking for “Website Security”</span> pairs with
            <span className="text-text-muted"> Industry “Website Security”.</span>
          </p>
        </CardContent>
      </Card>

      {/* Groups */}
      <div className="space-y-6">
        {CATEGORY_META.map((cat) => {
          const list = grouped[cat.value] ?? []
          return (
            <Card key={cat.value}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{cat.label}</CardTitle>
                  <span className="text-xs text-text-dim">{list.length}</span>
                </div>
                <p className="text-xs text-text-dim mt-1">{cat.help}</p>
              </CardHeader>
              <CardContent>
                {list.length === 0 ? (
                  <p className="text-sm text-text-dim italic">No tags in this category yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {list.map((tag) =>
                      editingId === tag.id ? (
                        <span
                          key={tag.id}
                          className="inline-flex items-center gap-1 rounded-full border border-gold bg-surface px-2 py-1"
                        >
                          <input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') rename(tag)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            className="bg-transparent text-sm text-text outline-none w-32"
                          />
                          <button onClick={() => rename(tag)} className="text-accent" title="Save">
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-text-dim"
                            title="Cancel"
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ) : (
                        <span
                          key={tag.id}
                          className={`group inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${CATEGORY_CHIP[tag.category] ?? CATEGORY_CHIP.service}`}
                        >
                          {tag.name}
                          <button
                            onClick={() => {
                              setEditingId(tag.id)
                              setEditName(tag.name)
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-text"
                            title="Rename"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => remove(tag)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-accent-warm"
                            title="Delete"
                          >
                            <Trash2 size={11} />
                          </button>
                        </span>
                      ),
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {tags.length === 0 && (
        <div className="mt-6 flex items-center gap-2 text-sm text-text-dim">
          <TagIcon size={15} /> No tags yet — add your first above.
        </div>
      )}
    </div>
  )
}
