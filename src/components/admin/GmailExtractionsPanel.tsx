'use client'

// "Detected from email" — surfaces AI-extracted potential new contacts and
// introductions from unmatched inbound Gmail messages. Recommendation-only:
// approving a contact creates an enquiry (lead); dismiss discards. Nothing is
// created automatically.

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { toast } from '@/lib/hooks/use-toast'
import { Sparkles, UserPlus, Handshake, Check, X, Loader2 } from 'lucide-react'

interface Extraction {
  id: string
  kind: 'new_contact' | 'introduction'
  payload: Record<string, string | null>
  created_at: string
}

export function GmailExtractionsPanel() {
  const [items, setItems] = useState<Extraction[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/google/gmail/extractions')
      const json = await res.json()
      if (res.ok) setItems(json.extractions ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function act(id: string, action: 'approve' | 'dismiss') {
    setBusyId(id)
    try {
      const res = await fetch('/api/admin/google/gmail/extractions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Action failed')
      setItems((cur) => cur.filter((x) => x.id !== id))
      toast({ title: action === 'approve' ? 'Added to leads' : 'Dismissed' })
    } catch (e) {
      toast({ title: 'Could not update', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  // Hide the panel entirely when there's nothing to review (keeps the log clean).
  if (!loading && items.length === 0) return null

  return (
    <Card className="mb-6 border-gold/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles size={16} className="text-gold" /> Detected from email
        </CardTitle>
        <p className="text-sm text-text-muted mt-1">
          AI spotted these possible new contacts / introductions in inbound email. Review and add to
          your leads, or dismiss. Nothing is created automatically.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((x) => (
              <div key={x.id} className="flex items-start gap-3 py-3">
                <div className="w-9 h-9 rounded-[var(--radius-md)] bg-gold-muted flex items-center justify-center shrink-0">
                  {x.kind === 'new_contact' ? (
                    <UserPlus size={16} className="text-gold" />
                  ) : (
                    <Handshake size={16} className="text-gold" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="info">
                      {x.kind === 'new_contact' ? 'New contact' : 'Introduction'}
                    </Badge>
                  </div>
                  <p className="text-sm text-text mt-1">{summarize(x)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {x.kind === 'new_contact' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === x.id}
                      icon={busyId === x.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      onClick={() => act(x.id, 'approve')}
                    >
                      Add lead
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === x.id}
                    icon={<X size={14} />}
                    onClick={() => act(x.id, 'dismiss')}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function summarize(x: Extraction): string {
  const p = x.payload || {}
  if (x.kind === 'new_contact') {
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unknown contact'
    const bits = [p.position, p.company].filter(Boolean).join(', ')
    return bits ? `${name} — ${bits}` : name
  }
  const from = p.from_party || '?'
  const to = p.to_party || '?'
  return `${from} → ${to}${p.context ? ` · ${p.context}` : ''}`
}
