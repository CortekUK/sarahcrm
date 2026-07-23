'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { toast } from '@/lib/hooks/use-toast'
import { formatDateTime } from '@/lib/utils'
import {
  Loader2,
  Sparkles,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleDashed,
} from 'lucide-react'
import { personName, type PersonLite } from '@/lib/accountability'
import {
  type DailyHandoverRow,
  type DailyReportRow,
  HANDOVER_FIELDS,
  handoverHasContent,
  today as todayStr,
  addDays,
  isToday,
  formatHandoverDate,
} from '@/lib/handover'

// Admin Daily Handover page. Pick a date; see every active staff member's
// end-of-day handover for that day (the 4 fields), a clear list of who hasn't
// submitted, and a Generate-report button that condenses the day's handovers
// into Sarah's Daily Leadership Report (saved + shown, re-generatable).
export function DailyHandoverPage() {
  const [date, setDate] = useState<string>(() => todayStr())
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState<PersonLite[]>([])
  const [handovers, setHandovers] = useState<DailyHandoverRow[]>([])
  const [report, setReport] = useState<DailyReportRow | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  async function load() {
    setLoading(true)
    const [staffRes, handoversRes, reportRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('role', ['team_member', 'freelancer'])
        .eq('staff_status', 'active'),
      supabase.from('daily_handovers').select('*').eq('handover_date', date),
      supabase.from('daily_reports').select('*').eq('report_date', date).maybeSingle(),
    ])
    if (staffRes.data) setStaff(staffRes.data as PersonLite[])
    if (handoversRes.data) setHandovers(handoversRes.data as DailyHandoverRow[])
    setReport((reportRes.data as DailyReportRow | null) ?? null)
    setLoading(false)
  }

  const handoverByStaff = useMemo(() => {
    const m = new Map<string, DailyHandoverRow>()
    for (const h of handovers) m.set(h.staff_id, h)
    return m
  }, [handovers])

  const submitted = useMemo(
    () => staff.filter((s) => handoverHasContent(handoverByStaff.get(s.id))),
    [staff, handoverByStaff],
  )
  const notSubmitted = useMemo(
    () => staff.filter((s) => !handoverHasContent(handoverByStaff.get(s.id))),
    [staff, handoverByStaff],
  )

  async function generateReport() {
    setGenerating(true)
    try {
      const res = await fetch('/api/admin/handover/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_date: date }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not generate report', description: json.error, variant: 'destructive' })
        return
      }
      setReport(json.report as DailyReportRow)
      toast({ title: 'Leadership report generated' })
    } catch (e) {
      toast({
        title: 'Could not generate report',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading handovers…
      </div>
    )
  }

  return (
    <div className="p-8">
      <AdminPageHeader
        title="Daily Handover"
        description="Every staff member submits a short end-of-day handover. Pick a date to see who's submitted and read each handover, then generate Sarah's Daily Leadership Report to condense the day into one briefing."
      />

      {/* Date picker */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="secondary"
          size="sm"
          icon={<ChevronLeft size={15} />}
          onClick={() => setDate((d) => addDays(d, -1))}
          aria-label="Previous day"
        />
        <div className="min-w-[220px] text-center">
          <p className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">
            {formatHandoverDate(date)}
          </p>
          <p className="text-xs text-text-dim">{isToday(date) ? 'Today' : date}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<ChevronRight size={15} />}
          onClick={() => setDate((d) => addDays(d, 1))}
          aria-label="Next day"
        />
        {!isToday(date) && (
          <Button variant="ghost" size="sm" onClick={() => setDate(todayStr())}>
            Today
          </Button>
        )}
      </div>

      {staff.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <AdminEmptyState
              icon={ClipboardCheck}
              title="No staff yet"
              description="Add team members under Accountability → Team Members. Their daily handovers will appear here."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Submission status + generate */}
          <Card className="mb-6">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div className="flex items-center gap-3">
                <Badge variant={submitted.length === staff.length ? 'active' : 'upcoming'}>
                  {submitted.length}/{staff.length} submitted
                </Badge>
                {notSubmitted.length > 0 && (
                  <p className="text-sm text-text-muted">
                    Waiting on:{' '}
                    <span className="text-text">
                      {notSubmitted.map((s) => personName(s)).join(', ')}
                    </span>
                  </p>
                )}
              </div>
              <Button
                icon={<Sparkles size={14} />}
                loading={generating}
                disabled={submitted.length === 0}
                onClick={generateReport}
              >
                {report ? 'Regenerate report' : 'Generate report'}
              </Button>
            </CardContent>
          </Card>

          {/* Leadership report */}
          {report && (
            <Card className="mb-6 border-gold/40">
              <CardContent className="py-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={15} className="text-gold" />
                  <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
                    Sarah&apos;s Daily Leadership Report · {report.submitted_count}/
                    {report.staff_total} submitted
                  </p>
                </div>
                <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">
                  {report.narrative}
                </p>
                {report.generated_at && (
                  <p className="text-xs text-text-dim mt-3">
                    Generated {formatDateTime(report.generated_at)}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Per-staff handovers */}
          <div className="space-y-4">
            {staff.map((s) => {
              const h = handoverByStaff.get(s.id)
              const has = handoverHasContent(h)
              return (
                <Card key={s.id}>
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
                      <p className="font-medium text-text">{personName(s)}</p>
                      {has ? (
                        <Badge variant="active">
                          <CheckCircle2 size={12} className="mr-1" />
                          Submitted
                        </Badge>
                      ) : (
                        <Badge variant="draft">
                          <CircleDashed size={12} className="mr-1" />
                          Not submitted
                        </Badge>
                      )}
                    </div>
                    {has ? (
                      <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
                        {HANDOVER_FIELDS.map((f) => {
                          const val = (h?.[f.key] ?? '').trim()
                          return (
                            <div key={f.key}>
                              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-1">
                                {f.label}
                              </p>
                              <p className="text-sm text-text whitespace-pre-wrap">
                                {val || <span className="text-text-dim">—</span>}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="px-5 py-6 text-sm text-text-muted">
                        No handover submitted for this date yet.
                      </div>
                    )}
                    {has && h?.updated_at && (
                      <div className="px-5 py-2.5 border-t border-border bg-surface-2">
                        <p className="text-xs text-text-dim">
                          Last updated {formatDateTime(h.updated_at)}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
