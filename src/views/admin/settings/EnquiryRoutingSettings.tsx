'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/hooks/use-toast'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { Button } from '@/components/ui/Button'

interface AdminProfile {
  id: string
  first_name: string | null
  last_name: string | null
}

function personName(p: AdminProfile | undefined): string {
  if (!p) return 'Unassigned'
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed'
}

// The enquiry intents the public forms submit — mirrors EnquiriesListPage's
// INTENT_LABELS and the intake route's routing map keys.
const INTENTS: { key: string; label: string }[] = [
  { key: 'membership', label: 'Membership' },
  { key: 'event', label: 'Upcoming event' },
  { key: 'private_event', label: 'Private event' },
  { key: 'concierge', label: 'Concierge' },
  { key: 'sponsorship', label: 'Sponsorship' },
  { key: 'venue', label: 'Venue / space hire' },
  { key: 'general', label: 'General enquiry' },
  { key: 'press', label: 'Press / media' },
]

// Sentinel for "no explicit owner" — Radix disallows empty-string values, and
// unset intents fall back to the first admin in the intake route.
const UNSET = 'default'

export function EnquiryRoutingSettings() {
  const [admins, setAdmins] = useState<AdminProfile[]>([])
  // intent → profileId (or UNSET). Seeded so every row renders on first paint.
  const [routing, setRouting] = useState<Record<string, string>>(() =>
    Object.fromEntries(INTENTS.map((i) => [i.key, UNSET])),
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      // Load the saved routing map + the admin roster together — same pattern
      // TasksPage/EnquiriesListPage use to populate their owner dropdowns.
      const [routingRes, adminsRes] = await Promise.all([
        supabase.from('app_settings').select('value').eq('key', 'enquiry_routing').maybeSingle(),
        supabase.from('profiles').select('id, first_name, last_name').eq('role', 'admin'),
      ])
      if (adminsRes.data) setAdmins(adminsRes.data as AdminProfile[])
      const saved = (routingRes.data?.value ?? {}) as Record<string, unknown>
      setRouting((prev) => {
        const next = { ...prev }
        for (const { key } of INTENTS) {
          const v = saved[key]
          next[key] = typeof v === 'string' && v ? v : UNSET
        }
        return next
      })
      setLoading(false)
    })()
  }, [])

  async function handleSave() {
    setSaving(true)
    // Build the intent→profileId object, omitting unset intents entirely.
    const value: Record<string, string> = {}
    for (const { key } of INTENTS) {
      if (routing[key] && routing[key] !== UNSET) value[key] = routing[key]
    }
    const { error } = await supabase.from('app_settings').upsert(
      { key: 'enquiry_routing', value, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    setSaving(false)
    if (error) {
      toast({ title: 'Could not save routing', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: 'Enquiry routing updated' })
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Enquiry Routing</CardTitle>
        <p className="text-sm text-text-muted mt-1">
          New website enquiries of each type are auto-assigned to the owner you pick here (with an
          acknowledgement email + a follow-up task). Unset types go to the first admin.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {INTENTS.map((intent) => (
            <div key={intent.key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-text">{intent.label}</span>
              <div className="w-52 shrink-0">
                <SelectMenu
                  size="sm"
                  ariaLabel={`Owner for ${intent.label} enquiries`}
                  value={routing[intent.key]}
                  onValueChange={(v) =>
                    setRouting((prev) => ({ ...prev, [intent.key]: v }))
                  }
                  options={[
                    { value: UNSET, label: 'First admin (default)' },
                    ...admins.map((a) => ({ value: a.id, label: personName(a) })),
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={handleSave} loading={saving} disabled={loading}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
