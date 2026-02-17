import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { Avatar } from '../../../components/ui/Avatar'
import { formatDate, cn } from '../../../lib/utils'
import { ArrowLeft, ArrowRight, Check, X as XIcon, Save } from 'lucide-react'
import type { Database } from '../../../types/database'

type IntroStatus = Database['public']['Enums']['intro_status']

interface IntroDetail {
  id: string
  status: IntroStatus
  match_score: number | null
  match_reason: string | null
  matching_tags: string[] | null
  suggested_at: string
  approved_at: string | null
  approved_by: string | null
  sent_at: string | null
  accepted_at: string | null
  outcome: string | null
  business_converted: boolean
  estimated_value_pence: number | null
  event_id: string | null
  member_a_id: string
  member_b_id: string
  member_a: {
    id: string
    company_name: string | null
    profiles: {
      first_name: string | null
      last_name: string | null
      avatar_url: string | null
      company_name: string | null
    }
  }
  member_b: {
    id: string
    company_name: string | null
    profiles: {
      first_name: string | null
      last_name: string | null
      avatar_url: string | null
      company_name: string | null
    }
  }
  events: { title: string } | null
}

const introStatusBadge: Record<IntroStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  suggested: 'draft',
  approved: 'upcoming',
  sent: 'info',
  accepted: 'active',
  completed: 'active',
  declined: 'urgent',
}

const LIFECYCLE_STEPS: { key: IntroStatus; label: string }[] = [
  { key: 'suggested', label: 'Suggested' },
  { key: 'approved', label: 'Approved' },
  { key: 'sent', label: 'Sent' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'completed', label: 'Completed' },
]

const STATUS_ORDER: Record<IntroStatus, number> = {
  suggested: 0,
  approved: 1,
  sent: 2,
  accepted: 3,
  completed: 4,
  declined: -1,
}

function memberName(profiles: { first_name: string | null; last_name: string | null } | null): string {
  if (!profiles) return 'Unknown'
  return `${profiles.first_name ?? ''} ${profiles.last_name ?? ''}`.trim() || 'Unnamed'
}

function getTimestamp(intro: IntroDetail, step: IntroStatus): string | null {
  switch (step) {
    case 'suggested': return intro.suggested_at
    case 'approved': return intro.approved_at
    case 'sent': return intro.sent_at
    case 'accepted': return intro.accepted_at
    case 'completed': return intro.status === 'completed' ? intro.accepted_at : null // no dedicated completed_at
    default: return null
  }
}

export function IntroductionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [intro, setIntro] = useState<IntroDetail | null>(null)
  const [tagNames, setTagNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [advancing, setAdvancing] = useState(false)

  // Outcome editing
  const [outcomeText, setOutcomeText] = useState('')
  const [businessConverted, setBusinessConverted] = useState(false)
  const [estimatedValue, setEstimatedValue] = useState('')
  const [savingOutcome, setSavingOutcome] = useState(false)

  useEffect(() => {
    if (id) fetchIntro(id)
  }, [id])

  async function fetchIntro(introId: string) {
    setLoading(true)
    const { data, error } = await supabase
      .from('introductions')
      .select(`
        *,
        member_a:members!introductions_member_a_id_fkey(
          id, company_name,
          profiles(first_name, last_name, avatar_url, company_name)
        ),
        member_b:members!introductions_member_b_id_fkey(
          id, company_name,
          profiles(first_name, last_name, avatar_url, company_name)
        ),
        events(title)
      `)
      .eq('id', introId)
      .single()

    if (!error && data) {
      const d = data as unknown as IntroDetail
      setIntro(d)
      setOutcomeText(d.outcome ?? '')
      setBusinessConverted(d.business_converted)
      setEstimatedValue(d.estimated_value_pence != null ? String(d.estimated_value_pence / 100) : '')

      // Resolve matching_tags UUIDs to names
      if (d.matching_tags && d.matching_tags.length > 0) {
        const { data: tags } = await supabase
          .from('tags')
          .select('name')
          .in('id', d.matching_tags)
        setTagNames(tags?.map((t) => t.name) ?? [])
      } else {
        setTagNames([])
      }
    }
    setLoading(false)
  }

  async function advanceStatus(newStatus: IntroStatus) {
    if (!intro || !id) return
    setAdvancing(true)

    const updates: Record<string, unknown> = { status: newStatus }
    const now = new Date().toISOString()

    if (newStatus === 'approved') {
      updates.approved_at = now
      // approved_by would ideally be the current user, but we'll set it via auth
      const { data: { user } } = await supabase.auth.getUser()
      if (user) updates.approved_by = user.id
    } else if (newStatus === 'sent') {
      updates.sent_at = now
    } else if (newStatus === 'accepted') {
      updates.accepted_at = now
    }

    await supabase.from('introductions').update(updates).eq('id', id)
    await fetchIntro(id)
    setAdvancing(false)
  }

  async function saveOutcome() {
    if (!id) return
    setSavingOutcome(true)

    await supabase.from('introductions').update({
      outcome: outcomeText || null,
      business_converted: businessConverted,
      estimated_value_pence: estimatedValue ? Math.round(parseFloat(estimatedValue) * 100) : null,
    }).eq('id', id)

    await fetchIntro(id)
    setSavingOutcome(false)
  }

  if (loading || !intro) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading introduction...</span>
        </div>
      </div>
    )
  }

  const nameA = memberName(intro.member_a?.profiles)
  const nameB = memberName(intro.member_b?.profiles)
  const companyA = intro.member_a?.company_name ?? intro.member_a?.profiles?.company_name
  const companyB = intro.member_b?.company_name ?? intro.member_b?.profiles?.company_name
  const currentOrder = STATUS_ORDER[intro.status]
  const isDeclined = intro.status === 'declined'
  const isTerminal = intro.status === 'completed' || isDeclined

  return (
    <div className="p-8 max-w-4xl">
      {/* Back */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/dashboard/introductions')}
          className="flex items-center gap-2 text-sm text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
          Back to Introductions
        </button>
      </div>

      {/* Header card — Members */}
      <Card className="mb-6">
        <CardContent className="py-6">
          <div className="flex items-center gap-6">
            {/* Member A */}
            <div className="flex-1 text-center">
              <div className="flex justify-center mb-2">
                <Avatar
                  src={intro.member_a?.profiles?.avatar_url}
                  name={nameA}
                  size="lg"
                />
              </div>
              <p className="font-medium text-text">{nameA}</p>
              {companyA && <p className="text-sm text-text-muted">{companyA}</p>}
            </div>

            {/* Arrow */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <ArrowRight size={20} className="text-gold" />
              <Badge variant={introStatusBadge[intro.status]} dot>
                {intro.status}
              </Badge>
              {intro.match_score != null && (
                <span className="text-sm font-medium text-gold">
                  {Math.round(intro.match_score * 100)}% match
                </span>
              )}
            </div>

            {/* Member B */}
            <div className="flex-1 text-center">
              <div className="flex justify-center mb-2">
                <Avatar
                  src={intro.member_b?.profiles?.avatar_url}
                  name={nameB}
                  size="lg"
                />
              </div>
              <p className="font-medium text-text">{nameB}</p>
              {companyB && <p className="text-sm text-text-muted">{companyB}</p>}
            </div>
          </div>

          {/* Match reason */}
          {intro.match_reason && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Match Reason</p>
              <p className="text-sm text-text">{intro.match_reason}</p>
            </div>
          )}

          {/* Matching tags */}
          {tagNames.length > 0 && (
            <div className="mt-3">
              <div className="flex flex-wrap gap-1.5">
                {tagNames.map((tag, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 text-xs rounded-full bg-gold-muted text-gold border border-border-gold"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Event */}
          {intro.events && (
            <div className="mt-3 text-sm text-text-muted">
              Event: <span className="text-text">{intro.events.title}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timeline card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Lifecycle</CardTitle>
        </CardHeader>
        <CardContent>
          {isDeclined ? (
            <div className="flex items-center gap-3 py-4">
              <div className="w-8 h-8 rounded-full bg-[rgba(196,105,74,0.1)] flex items-center justify-center">
                <XIcon size={16} className="text-accent-warm" />
              </div>
              <div>
                <p className="font-medium text-accent-warm">Declined</p>
                <p className="text-xs text-text-dim">This introduction was declined</p>
              </div>
            </div>
          ) : (
            <div className="space-y-0">
              {LIFECYCLE_STEPS.map((step, index) => {
                const stepOrder = STATUS_ORDER[step.key]
                const isPast = currentOrder > stepOrder
                const isCurrent = currentOrder === stepOrder
                const isFuture = currentOrder < stepOrder
                const timestamp = getTimestamp(intro, step.key)
                const isLast = index === LIFECYCLE_STEPS.length - 1

                return (
                  <div key={step.key} className="flex gap-4">
                    {/* Line + indicator */}
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                          isPast && 'bg-accent text-white',
                          isCurrent && 'bg-gold text-white',
                          isFuture && 'bg-surface-2 text-text-dim'
                        )}
                      >
                        {isPast ? (
                          <Check size={14} />
                        ) : isCurrent ? (
                          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                        ) : (
                          <div className="w-2 h-2 bg-text-dim/30 rounded-full" />
                        )}
                      </div>
                      {!isLast && (
                        <div
                          className={cn(
                            'w-0.5 h-8',
                            isPast ? 'bg-accent' : 'bg-border'
                          )}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className="pb-4 pt-1">
                      <p
                        className={cn(
                          'text-sm font-medium',
                          isPast && 'text-text',
                          isCurrent && 'text-gold',
                          isFuture && 'text-text-dim'
                        )}
                      >
                        {step.label}
                      </p>
                      {isPast && timestamp && (
                        <p className="text-xs text-text-dim">{formatDate(timestamp)}</p>
                      )}
                      {isCurrent && (
                        <p className="text-xs text-gold">Current step</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      {!isTerminal && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {intro.status === 'suggested' && (
                <Button
                  onClick={() => advanceStatus('approved')}
                  loading={advancing}
                  icon={<Check size={14} />}
                >
                  Approve
                </Button>
              )}
              {intro.status === 'approved' && (
                <Button
                  onClick={() => advanceStatus('sent')}
                  loading={advancing}
                  icon={<ArrowRight size={14} />}
                >
                  Mark as Sent
                </Button>
              )}
              {intro.status === 'sent' && (
                <>
                  <Button
                    onClick={() => advanceStatus('accepted')}
                    loading={advancing}
                    icon={<Check size={14} />}
                  >
                    Accepted
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => advanceStatus('declined')}
                    loading={advancing}
                    icon={<XIcon size={14} />}
                  >
                    Declined
                  </Button>
                </>
              )}
              {intro.status === 'accepted' && (
                <Button
                  onClick={() => advanceStatus('completed')}
                  loading={advancing}
                  icon={<Check size={14} />}
                >
                  Complete
                </Button>
              )}
              {/* Decline from any non-terminal status */}
              {intro.status !== 'sent' && (
                <Button
                  variant="ghost"
                  onClick={() => advanceStatus('declined')}
                  loading={advancing}
                  icon={<XIcon size={14} />}
                >
                  Decline
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Outcome section (when completed) */}
      {intro.status === 'completed' && (
        <Card>
          <CardHeader>
            <CardTitle>Outcome</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Textarea
                label="Outcome Notes"
                rows={3}
                value={outcomeText}
                onChange={(e) => setOutcomeText(e.target.value)}
                placeholder="Describe the outcome of this introduction..."
              />

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={businessConverted}
                    onChange={(e) => setBusinessConverted(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-gold focus:ring-gold"
                  />
                  <span className="text-sm text-text">Business converted</span>
                </label>
              </div>

              <Input
                label="Estimated Value (£)"
                type="number"
                step="0.01"
                min="0"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                placeholder="0.00"
              />

              <div className="flex justify-end">
                <Button
                  icon={<Save size={14} />}
                  loading={savingOutcome}
                  onClick={saveOutcome}
                >
                  Save Outcome
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
