'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/hooks/use-toast'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Clock } from 'lucide-react'

// 00:00 – 23:00, labelled in UK time. The daily automation batch (renewals,
// payment chasers, scheduled introductions, etc.) fires at this hour.
const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, '0')}:00`,
}))

export function AutomationTimeSettings() {
  const [hour, setHour] = useState('7')
  const [initial, setInitial] = useState('7')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'daily_send_hour')
        .maybeSingle()
      const v = data?.value
      const h = typeof v === 'number' ? String(v) : typeof v === 'string' ? v : '7'
      setHour(h)
      setInitial(h)
      setLoading(false)
    })()
  }, [])

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'daily_send_hour', value: Number(hour) }, { onConflict: 'key' })
    setSaving(false)
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' })
      return
    }
    setInitial(hour)
    toast({
      title: 'Send time updated',
      description: `Daily emails will go out around ${String(hour).padStart(2, '0')}:00 UK time.`,
    })
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Automation Send Time</CardTitle>
        <p className="text-sm text-text-muted mt-1">
          The time of day (UK) the daily batch runs — renewal reminders, payment
          chasers, and any introductions scheduled for that date.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3 max-w-md">
          <div className="w-40">
            <Select
              label="Daily send time"
              options={HOURS}
              value={hour}
              onChange={(e) => setHour(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-dim pb-2.5">
            <Clock size={13} strokeWidth={1.5} />
            UK time (Europe/London)
          </div>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={loading || hour === initial}
            className="ml-auto"
          >
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
