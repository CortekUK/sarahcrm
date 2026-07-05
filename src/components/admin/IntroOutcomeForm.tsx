'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { DateField } from '@/components/ui/DateField'
import { Textarea } from '@/components/ui/Textarea'
import { toast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Save, Check } from 'lucide-react'
import {
  OUTCOME_STAGES,
  outcomeStageFlags,
  buildIntroOutcomeUpdate,
  poundsToPence,
  penceToPounds,
  toDateInput,
  fromDateInput,
  type DealStatus,
  type IntroOutcomeValues,
} from '@/lib/introductions/outcome'

export interface IntroOutcomeInitial {
  outcome: string | null
  meeting_held_at: string | null
  proposal_sent_at: string | null
  deal_status: DealStatus | null
  estimated_value_pence: number | null
  revenue_pence: number | null
  testimonial_obtained: boolean
  testimonial_note: string | null
  followed_up_at: string | null
}

interface Props {
  introId: string
  initial: IntroOutcomeInitial
  /** Called after a successful save so the parent can refetch. */
  onSaved?: () => void
}

const STAGE_LABELS: Record<(typeof OUTCOME_STAGES)[number], string> = {
  introduced: 'Introduced',
  meeting: 'Meeting',
  proposal: 'Proposal',
  deal: 'Deal',
  revenue: 'Revenue',
  testimonial: 'Testimonial',
}

const checkboxCls =
  'w-4 h-4 rounded border-border text-gold focus:ring-gold cursor-pointer'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Records the commercial outcome pipeline for an introduction. Shared by the
 * introduction detail page and the member matches panel so the two never
 * drift. Renders fields only — the parent supplies the surrounding card/modal.
 */
export function IntroOutcomeForm({ introId, initial, onSaved }: Props) {
  const [outcome, setOutcome] = useState(initial.outcome ?? '')
  const [meetingHeld, setMeetingHeld] = useState(Boolean(initial.meeting_held_at))
  const [meetingDate, setMeetingDate] = useState(toDateInput(initial.meeting_held_at))
  const [proposalSent, setProposalSent] = useState(Boolean(initial.proposal_sent_at))
  const [proposalDate, setProposalDate] = useState(toDateInput(initial.proposal_sent_at))
  const [dealStatus, setDealStatus] = useState<DealStatus | null>(initial.deal_status)
  const [estimatedValue, setEstimatedValue] = useState(penceToPounds(initial.estimated_value_pence))
  const [revenue, setRevenue] = useState(penceToPounds(initial.revenue_pence))
  const [testimonialObtained, setTestimonialObtained] = useState(initial.testimonial_obtained)
  const [testimonialNote, setTestimonialNote] = useState(initial.testimonial_note ?? '')
  const [saving, setSaving] = useState(false)

  const meetingAt = meetingHeld ? fromDateInput(meetingDate || today()) : null
  const proposalAt = proposalSent ? fromDateInput(proposalDate || today()) : null
  // Each pill reflects its OWN milestone, independently — live as boxes tick.
  const stageFlags = outcomeStageFlags({
    meeting_held_at: meetingAt,
    proposal_sent_at: proposalAt,
    deal_status: dealStatus,
    revenue_pence: poundsToPence(revenue),
    testimonial_obtained: testimonialObtained,
  })

  async function save() {
    setSaving(true)
    const values: IntroOutcomeValues = {
      outcome: outcome || null,
      meeting_held_at: meetingAt,
      proposal_sent_at: proposalAt,
      deal_status: dealStatus,
      estimated_value_pence: poundsToPence(estimatedValue),
      revenue_pence: poundsToPence(revenue),
      testimonial_obtained: testimonialObtained,
      testimonial_note: testimonialNote || null,
    }
    const update = buildIntroOutcomeUpdate(values, initial.followed_up_at)
    const { error } = await supabase.from('introductions').update(update).eq('id', introId)
    setSaving(false)
    if (error) {
      toast({ title: 'Could not save outcome', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: 'Outcome saved' })
    onSaved?.()
  }

  return (
    <div className="space-y-5">
      {/* Pipeline tracker */}
      <div className="flex flex-wrap items-center gap-1.5">
        {OUTCOME_STAGES.map((stage, i) => {
          const lit = stageFlags[stage]
          return (
            <div key={stage} className="flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
                  lit
                    ? 'bg-gold-muted text-gold border-border-gold'
                    : 'bg-surface-2 text-text-dim border-border',
                )}
              >
                {lit && <Check size={11} />}
                {STAGE_LABELS[stage]}
              </span>
              {i < OUTCOME_STAGES.length - 1 && (
                <span className={cn('h-px w-3', lit ? 'bg-border-gold' : 'bg-border')} />
              )}
            </div>
          )
        })}
      </div>

      {/* Meeting held */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className={checkboxCls}
            checked={meetingHeld}
            onChange={(e) => setMeetingHeld(e.target.checked)}
          />
          <span className="text-sm text-text">Meeting held</span>
        </label>
        {meetingHeld && (
          <DateField
            value={meetingDate || today()}
            onChange={(v) => setMeetingDate(v)}
          />
        )}
      </div>

      {/* Proposal sent */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className={checkboxCls}
            checked={proposalSent}
            onChange={(e) => setProposalSent(e.target.checked)}
          />
          <span className="text-sm text-text">Proposal sent</span>
        </label>
        {proposalSent && (
          <DateField
            value={proposalDate || today()}
            onChange={(v) => setProposalDate(v)}
          />
        )}
      </div>

      <Input
        label="Estimated value (£)"
        type="number"
        step="0.01"
        min="0"
        value={estimatedValue}
        onChange={(e) => setEstimatedValue(e.target.value)}
        placeholder="0.00"
      />

      {/* Deal outcome */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-text">Deal outcome</p>
        <div className="flex flex-wrap gap-2">
          {([
            { key: null, label: 'Undecided' },
            { key: 'won', label: 'Won' },
            { key: 'lost', label: 'Lost' },
          ] as const).map((opt) => {
            const active = dealStatus === opt.key
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => setDealStatus(opt.key)}
                className={cn(
                  'rounded-[var(--radius-md)] border px-3 py-1.5 text-sm font-medium transition-colors',
                  active && opt.key === 'won' && 'bg-accent text-white border-accent',
                  active && opt.key === 'lost' && 'bg-[rgba(196,105,74,0.12)] text-accent-warm border-border-gold',
                  active && opt.key === null && 'bg-surface-2 text-text border-border-gold',
                  !active && 'bg-surface-2 text-text-muted border-border hover:text-text',
                )}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-text-dim">
          Marking a deal Won or Lost completes the introduction.
        </p>
      </div>

      {/* Revenue — only when won */}
      {dealStatus === 'won' && (
        <Input
          label="Revenue generated (£)"
          type="number"
          step="0.01"
          min="0"
          value={revenue}
          onChange={(e) => setRevenue(e.target.value)}
          placeholder="0.00"
        />
      )}

      {/* Testimonial */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className={checkboxCls}
            checked={testimonialObtained}
            onChange={(e) => setTestimonialObtained(e.target.checked)}
          />
          <span className="text-sm text-text">Testimonial obtained</span>
        </label>
        {testimonialObtained && (
          <Textarea
            rows={2}
            value={testimonialNote}
            onChange={(e) => setTestimonialNote(e.target.value)}
            placeholder="Testimonial or quote..."
          />
        )}
      </div>

      <Textarea
        label="Outcome notes"
        rows={3}
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        placeholder="Describe the outcome of this introduction..."
      />

      <div className="flex justify-end">
        <Button icon={<Save size={14} />} loading={saving} onClick={save}>
          Save outcome
        </Button>
      </div>
    </div>
  )
}
