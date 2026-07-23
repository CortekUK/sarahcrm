'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { RichTextRenderer } from '@/components/sops/RichText'
import { Loader2, BookOpen, Search, ChevronRight, ChevronDown } from 'lucide-react'
import { groupByCategory, toPlainText, type SopRow } from '@/lib/sops'

// Staff "Playbook" panel at /team — read-only browse of PUBLISHED SOPs by
// category. RLS ("Staff read published sops") guarantees drafts are never
// returned to staff, so this only ever renders published knowledge. Bodies are
// sanitized on render (RichTextRenderer → isomorphic-dompurify).
export function StaffSopPanel() {
  const [loading, setLoading] = useState(true)
  const [sops, setSops] = useState<SopRow[]>([])
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    // RLS restricts to published rows for staff; the explicit filter is belt-
    // and-braces + keeps the query intent obvious.
    const { data } = await supabase
      .from('sops')
      .select('*')
      .eq('status', 'published')
      .order('category', { ascending: true })
      .order('title', { ascending: true })
    setSops((data as SopRow[]) ?? [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sops
    return sops.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.category ?? '').toLowerCase().includes(q) ||
        toPlainText(s.body).toLowerCase().includes(q),
    )
  }, [sops, search])

  const grouped = useMemo(() => groupByCategory(filtered), [filtered])

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-text-muted py-6">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading the playbook…
      </div>
    )
  }

  return (
    <div className="mb-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-text">
            Playbook
          </h2>
          <p className="text-sm text-text-muted mt-0.5">
            Standard Operating Procedures — how we do things here.
          </p>
        </div>
        {sops.length > 0 && (
          <div className="w-full sm:w-64">
            <Input
              placeholder="Search the playbook…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              suffix={<Search size={15} className="text-text-dim" />}
            />
          </div>
        )}
      </div>

      {sops.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <BookOpen size={22} className="mx-auto text-text-dim mb-2" />
            <p className="text-sm text-text-muted">
              No procedures have been published yet. Check back soon.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-sm text-text-muted">Nothing matches your search.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(([category, items]) => (
            <div key={category}>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-2">
                {category} · {items.length}
              </p>
              <Card>
                <CardContent className="p-0 divide-y divide-border">
                  {items.map((s) => {
                    const open = openId === s.id
                    return (
                      <div key={s.id}>
                        <button
                          type="button"
                          onClick={() => setOpenId(open ? null : s.id)}
                          className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left hover:bg-surface-2 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-text">{s.title}</p>
                          </div>
                          {open ? (
                            <ChevronDown size={16} className="mt-1 shrink-0 text-text-dim" />
                          ) : (
                            <ChevronRight size={16} className="mt-1 shrink-0 text-text-dim" />
                          )}
                        </button>
                        {open && (
                          <div className="px-5 pb-5 pt-0">
                            <RichTextRenderer html={s.body} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
