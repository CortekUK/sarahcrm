'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { toast } from '@/lib/hooks/use-toast'
import { formatDateTime } from '@/lib/utils'
import { Loader2, CheckCircle2, ClipboardCheck } from 'lucide-react'
import {
  type DailyHandoverRow,
  HANDOVER_FIELDS,
  handoverHasContent,
  today as todayStr,
  formatHandoverDate,
} from '@/lib/handover'

type FormState = Record<(typeof HANDOVER_FIELDS)[number]['key'], string>

const emptyForm: FormState = {
  completed_today: '',
  working_tomorrow: '',
  blocked: '',
  support_needed: '',
}

// Staff daily handover form. RLS scopes every query to the signed-in user:
// they can only read/insert/update their OWN handover (staff_id = auth.uid()).
// One handover per day (handover_date), editable that day via upsert.
export function StaffHandoverPanel() {
  const { profile } = useAuth()
  const date = useMemo(() => todayStr(), [])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>({ ...emptyForm })
  const [existing, setExisting] = useState<DailyHandoverRow | null>(null)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function load() {
    if (!profile?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('daily_handovers')
      .select('*')
      .eq('handover_date', date)
      .maybeSingle()
    const row = (data as DailyHandoverRow | null) ?? null
    setExisting(row)
    setForm(
      row
        ? {
            completed_today: row.completed_today ?? '',
            working_tomorrow: row.working_tomorrow ?? '',
            blocked: row.blocked ?? '',
            support_needed: row.support_needed ?? '',
          }
        : { ...emptyForm },
    )
    setLoading(false)
  }

  const submitted = handoverHasContent(existing)

  async function save() {
    if (!profile?.id) return
    if (!HANDOVER_FIELDS.some((f) => form[f.key].trim() !== '')) {
      toast({ title: 'Add at least one note before saving', variant: 'destructive' })
      return
    }
    setSaving(true)
    const payload = {
      staff_id: profile.id,
      handover_date: date,
      completed_today: form.completed_today.trim() || null,
      working_tomorrow: form.working_tomorrow.trim() || null,
      blocked: form.blocked.trim() || null,
      support_needed: form.support_needed.trim() || null,
    }
    const { data, error } = await supabase
      .from('daily_handovers')
      .upsert(payload, { onConflict: 'staff_id,handover_date' })
      .select('*')
      .single()
    setSaving(false)
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' })
      return
    }
    setExisting(data as DailyHandoverRow)
    toast({ title: 'Handover saved' })
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-text-muted py-6">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your handover…
      </div>
    )
  }

  return (
    <div className="mb-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-text">
            Daily handover
          </h2>
          <p className="text-sm text-text-muted mt-0.5">
            Today · {formatHandoverDate(date)}
          </p>
        </div>
        {submitted && (
          <Badge variant="active">
            <CheckCircle2 size={12} className="mr-1" />
            Submitted
          </Badge>
        )}
      </div>

      <Card>
        <CardContent className="py-5 space-y-4">
          {!submitted && (
            <div className="flex items-start gap-2 text-sm text-text-muted">
              <ClipboardCheck size={16} className="mt-0.5 shrink-0 text-gold" />
              <p>
                Take a moment at the end of your day to share where things stand. You can edit
                today&apos;s handover any time before the day ends.
              </p>
            </div>
          )}
          {HANDOVER_FIELDS.map((f) => (
            <Textarea
              key={f.key}
              label={f.label}
              placeholder={f.placeholder}
              value={form[f.key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="min-h-[80px]"
            />
          ))}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-text-dim">
              {submitted && existing?.updated_at
                ? `Last saved ${formatDateTime(existing.updated_at)}`
                : 'Not submitted yet'}
            </p>
            <Button loading={saving} onClick={save}>
              {submitted ? 'Update handover' : 'Submit handover'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
