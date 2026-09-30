'use client'

import { Card, CardContent } from '@/components/ui/Card'
import { PLANNING_LABELS } from '@/lib/events/import'
import { Check, ClipboardList, AlertCircle } from 'lucide-react'

// The planning side of an imported event.
//
// Two jobs, both aimed at one moment: an admin turning a spreadsheet row into a
// real, bookable event.
//
//   1. THE CHECKLIST — what is still missing before it can be published. The
//      same rule is enforced by a database trigger (see the
//      20260923_event_planning_import migration), so this is a helpful mirror,
//      not the protection itself.
//   2. THE ORIGINAL TEXT — every cell exactly as Sarah typed it, including the
//      columns the events table has no field for (Purpose, Target Audience,
//      Sponsorship, Commercial notes). The admin reads the venue shortlist or
//      "Q4 2026 (TBC)" here and enters the decided value in the form.

export interface PublishableEvent {
  start_date: string | null
  venue_name: string | null
  capacity: number | null
  description: string | null
}

export interface ChecklistItem {
  label: string
  done: boolean
}

/** The publish requirements, in the order they appear on the form. */
export function publishChecklist(event: PublishableEvent): ChecklistItem[] {
  return [
    { label: 'Exact date & start time', done: Boolean(event.start_date) },
    { label: 'One venue chosen', done: Boolean(event.venue_name?.trim()) },
    { label: 'Capacity (a single number)', done: (event.capacity ?? 0) > 0 },
    { label: 'Description', done: Boolean(event.description?.trim()) },
  ]
}

export function missingForPublish(event: PublishableEvent): string[] {
  return publishChecklist(event)
    .filter((i) => !i.done)
    .map((i) => i.label)
}

/** Order the planning fields read best in, whatever order the sheet had them. */
const FIELD_ORDER = [
  'date',
  'location',
  'venue',
  'capacity',
  'tickets',
  'sponsorship',
  'concept',
  'purpose',
  'target_audience',
  'speakers',
  'notes',
]

export function PlanningChecklist({ event }: { event: PublishableEvent }) {
  const items = publishChecklist(event)
  const remaining = items.filter((i) => !i.done).length

  return (
    <Card className="mb-6 border-gold/30">
      <CardContent className="py-5">
        <div className="flex items-start gap-3">
          {remaining === 0 ? (
            <Check size={18} className="text-accent shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={18} className="text-gold shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text">
              {remaining === 0
                ? 'Ready to publish'
                : `${remaining} thing${remaining === 1 ? '' : 's'} still needed before this can be published`}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              Imported from the planning spreadsheet. It stays team-only — invisible to members and
              the public — until it is published.
            </p>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {items.map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-sm">
                  <span
                    className={
                      item.done
                        ? 'w-4 h-4 rounded-full bg-[rgba(91,123,106,0.15)] flex items-center justify-center shrink-0'
                        : 'w-4 h-4 rounded-full border border-border shrink-0'
                    }
                  >
                    {item.done && <Check size={11} className="text-accent" />}
                  </span>
                  <span className={item.done ? 'text-text-muted line-through' : 'text-text'}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function PlanningNotes({
  planningData,
  className,
}: {
  planningData: unknown
  className?: string
}) {
  if (!planningData || typeof planningData !== 'object') return null
  const data = planningData as Record<string, unknown>

  const entries = FIELD_ORDER.filter(
    (key) => typeof data[key] === 'string' && (data[key] as string).trim() !== '',
  ).map((key) => [key, data[key] as string] as const)

  if (entries.length === 0) return null

  const sheet = typeof data.source_sheet === 'string' ? data.source_sheet : null
  const section = typeof data.source_section === 'string' ? data.source_section : null

  return (
    <Card className={className}>
      <CardContent className="py-5">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardList size={15} className="text-gold" />
          <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
            From the planning spreadsheet
          </p>
        </div>
        <p className="text-xs text-text-dim mb-4">
          Exactly as written{sheet ? ` in "${sheet}"` : ''}
          {section ? ` · ${section}` : ''}. Nothing here is used on the public site — copy what you
          need into the fields above.
        </p>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {entries.map(([key, value]) => (
            <div key={key}>
              <dt className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">
                {PLANNING_LABELS[key] ?? key}
              </dt>
              {/* whitespace-pre-line: the sheet's line breaks carry meaning —
                 a venue shortlist and a two-slot time are one cell each. */}
              <dd className="text-sm text-text-muted whitespace-pre-line leading-relaxed">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
