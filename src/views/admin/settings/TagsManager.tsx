'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/hooks/use-toast'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Check, Pencil, Plus, Tag as TagIcon, Trash2, X } from 'lucide-react'
import type { Database } from '@/types/database'

type TagRow = Database['public']['Tables']['tags']['Row']
type TagCategory = Database['public']['Enums']['tag_category']

// All four categories — Service is surfaced here even though the member-facing
// UI historically showed only three.
const CATEGORIES: { value: TagCategory; label: string }[] = [
  { value: 'industry', label: 'Industry' },
  { value: 'interest', label: 'Interest' },
  { value: 'need', label: 'Looking For' },
  { value: 'service', label: 'Service' },
]
const CATEGORY_LABEL: Record<TagCategory, string> = {
  industry: 'Industry',
  interest: 'Interest',
  need: 'Looking For',
  service: 'Service',
}

export function TagsManager() {
  const [tags, setTags] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState<TagCategory>('industry')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState<TagCategory>('industry')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('tags')
      .select('*')
      .order('category')
      .order('name')
    setTags((data as TagRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    const { error } = await supabase.from('tags').insert({ name, category: newCategory })
    setAdding(false)
    if (error) {
      toast({
        title: 'Could not add tag',
        description: error.code === '23505' ? 'A tag with that name already exists.' : error.message,
        variant: 'destructive',
      })
      return
    }
    setNewName('')
    toast({ title: 'Tag added', description: `"${name}" added to ${CATEGORY_LABEL[newCategory]}.` })
    load()
  }

  function startEdit(tag: TagRow) {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditCategory(tag.category as TagCategory)
  }

  async function saveEdit(id: string) {
    const name = editName.trim()
    if (!name) return
    const { error } = await supabase
      .from('tags')
      .update({ name, category: editCategory })
      .eq('id', id)
    if (error) {
      toast({
        title: 'Could not update tag',
        description: error.code === '23505' ? 'A tag with that name already exists.' : error.message,
        variant: 'destructive',
      })
      return
    }
    setEditingId(null)
    toast({ title: 'Tag updated' })
    load()
  }

  async function handleDelete(tag: TagRow) {
    if (
      !window.confirm(
        `Delete the tag "${tag.name}"? It will be removed from every member who has it. This cannot be undone.`,
      )
    ) {
      return
    }
    const { error } = await supabase.from('tags').delete().eq('id', tag.id)
    if (error) {
      toast({ title: 'Could not delete tag', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: 'Tag deleted', description: `"${tag.name}" removed.` })
    load()
  }

  const grouped = CATEGORIES.map((c) => ({
    ...c,
    tags: tags.filter((t) => t.category === c.value),
  }))

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Tags</CardTitle>
        <p className="text-sm text-text-muted mt-1">
          The shared vocabulary used to describe members and power introduction matching.
        </p>
      </CardHeader>
      <CardContent>
        {/* Add new tag */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1">
            <Input
              placeholder="New tag name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
              }}
            />
          </div>
          <div className="sm:w-44">
            <Select
              options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as TagCategory)}
            />
          </div>
          <Button onClick={handleAdd} loading={adding} icon={<Plus size={14} />} disabled={!newName.trim()}>
            Add Tag
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-text-dim">Loading tags…</p>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <div key={group.value}>
                <h3 className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.15em] text-text-muted mb-3">
                  {group.label}
                  <span className="ml-2 text-text-dim">· {group.tags.length}</span>
                </h3>
                {group.tags.length === 0 ? (
                  <p className="text-xs text-text-dim italic">No tags in this category yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {group.tags.map((tag) =>
                      editingId === tag.id ? (
                        <div
                          key={tag.id}
                          className="flex items-center gap-2 p-2 border border-border-gold rounded-[var(--radius-md)] bg-surface-2"
                        >
                          <input
                            className="bg-transparent text-sm text-text outline-none w-32 border-b border-border focus:border-gold"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(tag.id)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            autoFocus
                          />
                          <select
                            className="bg-surface text-xs text-text border border-border rounded px-1 py-0.5"
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value as TagCategory)}
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => saveEdit(tag.id)}
                            className="text-accent hover:opacity-70"
                            title="Save"
                          >
                            <Check size={15} strokeWidth={2} />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-text-dim hover:text-text"
                            title="Cancel"
                          >
                            <X size={15} strokeWidth={2} />
                          </button>
                        </div>
                      ) : (
                        <div
                          key={tag.id}
                          className="group flex items-center gap-1.5 pl-3 pr-2 py-1.5 border border-border rounded-[var(--radius-md)] bg-surface hover:border-border-hover transition-colors"
                        >
                          <TagIcon size={12} strokeWidth={1.5} className="text-gold shrink-0" />
                          <span className="text-sm text-text">{tag.name}</span>
                          <button
                            onClick={() => startEdit(tag)}
                            className="ml-1 text-text-dim hover:text-gold opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Edit"
                          >
                            <Pencil size={13} strokeWidth={1.5} />
                          </button>
                          <button
                            onClick={() => handleDelete(tag)}
                            className="text-text-dim hover:text-accent-warm opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete"
                          >
                            <Trash2 size={13} strokeWidth={1.5} />
                          </button>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
