'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase as typedSupabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { ActiveToggle } from '@/components/admin/ActiveToggle'
import { SortableList, DragHandle } from '@/components/admin/SortableList'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { dbErrorMessage } from '@/lib/form-validation'
import { Plus, Pencil, Trash2, Check, X, Tags } from 'lucide-react'

// /dashboard/website/business-categories
//
// The "one business per category" chips on /memberships (The Club
// Business Membership block). Admins add, rename, reorder (drag) and
// delete categories, and mark a category Taken once a Business member
// holds it — the public chip then shows as taken.
//
// Table: public.business_categories (20261106_a_website_rebuild_schema.sql,
// seeded in 20261106_b_memberships.sql). Not in the generated types yet,
// so it's queried through an untyped client. RLS: public read, admin write.

const supabase = typedSupabase as unknown as SupabaseClient

const REVALIDATE_PATHS = ['/memberships']

async function flushPublicCache() {
  try {
    await fetch('/api/admin/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paths: REVALIDATE_PATHS }),
    })
  } catch {
    // Non-fatal — /memberships revalidates every 60s anyway.
  }
}

interface Category {
  id: string
  name: string
  is_taken: boolean
  display_order: number
}

export function BusinessCategoriesPage() {
  const confirm = useConfirm()
  const [rows, setRows] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('business_categories')
      .select('id, name, is_taken, display_order')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) {
      toast({
        title: 'Failed to load categories',
        description: dbErrorMessage(error),
        variant: 'destructive',
      })
    } else {
      setRows((data ?? []) as Category[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  function nameTaken(name: string, exceptId?: string) {
    const n = name.trim().toLowerCase()
    return rows.some((r) => r.name.trim().toLowerCase() === n && r.id !== exceptId)
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    if (nameTaken(name)) {
      toast({ title: 'Already listed', description: `“${name}” is already a category.`, variant: 'destructive' })
      return
    }
    setAdding(true)
    const nextOrder = rows.reduce((m, r) => Math.max(m, r.display_order), -1) + 1
    const { error } = await supabase
      .from('business_categories')
      .insert({ name, is_taken: false, display_order: nextOrder })
    setAdding(false)
    if (error) {
      toast({ title: 'Category not added', description: dbErrorMessage(error), variant: 'destructive' })
      return
    }
    setNewName('')
    toast({ title: 'Category added', description: name })
    fetchRows()
    void flushPublicCache()
  }

  async function saveRename(row: Category) {
    const name = editName.trim()
    if (!name || name === row.name) {
      setEditingId(null)
      return
    }
    if (nameTaken(name, row.id)) {
      toast({ title: 'Already listed', description: `“${name}” is already a category.`, variant: 'destructive' })
      return
    }
    setSavingEdit(true)
    const { error } = await supabase.from('business_categories').update({ name }).eq('id', row.id)
    setSavingEdit(false)
    if (error) {
      toast({ title: 'Rename failed', description: dbErrorMessage(error), variant: 'destructive' })
      return
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, name } : r)))
    setEditingId(null)
    void flushPublicCache()
  }

  async function handleToggleTaken(row: Category, next: boolean) {
    const { error } = await supabase
      .from('business_categories')
      .update({ is_taken: next })
      .eq('id', row.id)
    if (error) {
      toast({ title: 'Update failed', description: dbErrorMessage(error), variant: 'destructive' })
      throw error // ActiveToggle reverts its optimistic state
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_taken: next } : r)))
    void flushPublicCache()
  }

  async function handleDelete(row: Category) {
    const ok = await confirm({
      title: 'Delete this category?',
      description: (
        <span>
          “{row.name}” will be removed from the category chips on the public Memberships page.
        </span>
      ),
      confirmLabel: 'Delete category',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('business_categories').delete().eq('id', row.id)
    if (error) {
      toast({ title: 'Delete failed', description: dbErrorMessage(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Category deleted', description: row.name })
    fetchRows()
    void flushPublicCache()
  }

  async function handleReorder(next: Category[]) {
    setRows(next)
    const results = await Promise.all(
      next.map((r) =>
        supabase.from('business_categories').update({ display_order: r.display_order }).eq('id', r.id),
      ),
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) {
      toast({ title: 'Reorder not saved', description: dbErrorMessage(failed.error), variant: 'destructive' })
      fetchRows()
      return
    }
    void flushPublicCache()
  }

  const takenCount = rows.filter((r) => r.is_taken).length

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Business categories"
        description="The “one business per category” chips on /memberships for The Club Business Membership. Mark a category Taken when a Business member holds it — the public page then shows it as taken. Drag to reorder."
        meta={
          !loading && (
            <span className="text-xs text-text-dim">
              {rows.length} categor{rows.length === 1 ? 'y' : 'ies'} · {takenCount} taken
            </span>
          )
        }
      />

      <Card className="mb-6">
        <CardContent className="p-4 sm:p-5">
          <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <Input
                label="Add a category"
                placeholder="e.g. Private aviation"
                value={newName}
                maxLength={80}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <Button type="submit" icon={<Plus size={16} />} loading={adding} disabled={!newName.trim()}>
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading categories…</span>
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <AdminEmptyState
              icon={Tags}
              title="No categories yet"
              description="Add the categories open to exclusivity. Until the first one is added, the public page shows the default list from the brochure."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <SortableList
              items={rows}
              onReorder={handleReorder}
              renderItem={(row, dragHandleProps) => (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-border last:border-b-0 group hover:bg-surface-2/50 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <DragHandle dragHandleProps={dragHandleProps} />
                    {editingId === row.id ? (
                      <form
                        className="flex items-center gap-2 flex-1 min-w-0"
                        onSubmit={(e) => {
                          e.preventDefault()
                          saveRename(row)
                        }}
                      >
                        <input
                          autoFocus
                          value={editName}
                          maxLength={80}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          aria-label="Category name"
                          className="flex-1 min-w-0 px-3 py-1.5 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none focus:border-gold focus:shadow-[0_0_0_3px_var(--color-gold-muted)]"
                        />
                        <button
                          type="submit"
                          disabled={savingEdit}
                          className="p-1.5 text-text-dim hover:text-gold rounded hover:bg-surface-2 transition-colors"
                          aria-label="Save name"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="p-1.5 text-text-dim hover:text-text rounded hover:bg-surface-2 transition-colors"
                          aria-label="Cancel rename"
                        >
                          <X size={15} />
                        </button>
                      </form>
                    ) : (
                      <p
                        className={`text-sm flex-1 min-w-0 truncate ${
                          row.is_taken ? 'text-text-muted' : 'text-text'
                        }`}
                      >
                        {row.name}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 pl-8 sm:pl-0">
                    <ActiveToggle
                      active={row.is_taken}
                      activeLabel="Taken"
                      inactiveLabel="Open"
                      onChange={(next) => handleToggleTaken(row, next)}
                    />
                    <div className="flex items-center gap-0.5 ml-auto sm:ml-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(row.id)
                          setEditName(row.name)
                        }}
                        className="p-1.5 text-text-dim hover:text-text rounded hover:bg-surface-2 transition-colors"
                        aria-label={`Rename ${row.name}`}
                      >
                        <Pencil size={14} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        className="p-1.5 text-text-dim hover:text-accent-warm rounded hover:bg-surface-2 transition-colors"
                        aria-label={`Delete ${row.name}`}
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
