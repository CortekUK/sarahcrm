'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Sparkles, Loader2, FileText, Wand2 } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Select,
  Textarea,
  StatCard,
} from '@/components/ui'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/hooks/use-toast'
import { ProspectsView, QueueLink } from './ProspectsView'

interface EventOption {
  id: string
  title: string
  start_date: string | null
}

interface MatchCounts {
  warm: number
  cold: number
  total: number
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function SponsorshipHub() {
  const searchParams = useSearchParams()

  const [events, setEvents] = useState<EventOption[]>([])
  const [eventId, setEventId] = useState('')

  const [brief, setBrief] = useState('')
  const [deckText, setDeckText] = useState('')
  const [deckBrief, setDeckBrief] = useState('')
  const [parsingDeck, setParsingDeck] = useState(false)

  const [matching, setMatching] = useState(false)
  const [counts, setCounts] = useState<MatchCounts | null>(null)
  const [coldStatus, setColdStatus] = useState<string | null>(null)
  const [outreachCount, setOutreachCount] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Load events for the picker (same source as MarketingPage).
  useEffect(() => {
    supabase
      .from('events')
      .select('id, title, start_date')
      .order('start_date', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        const list = (data ?? []) as EventOption[]
        setEvents(list)
        // Preselect from ?event_id= (deep-link from the event's Sponsors panel).
        const fromQuery = searchParams.get('event_id')
        if (fromQuery && list.some((e) => e.id === fromQuery)) {
          setEventId(fromQuery)
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadOutreachCount = useCallback(async () => {
    if (!eventId) {
      setOutreachCount(null)
      return
    }
    try {
      const res = await fetch(`/api/admin/sponsorship/outreach?event_id=${eventId}`)
      const json = await res.json()
      if (res.ok) setOutreachCount((json.outreach ?? []).length)
    } catch {
      /* best-effort */
    }
  }, [eventId])

  // Reset match summary + reload outreach count when the event changes.
  useEffect(() => {
    setCounts(null)
    setColdStatus(null)
    loadOutreachCount()
  }, [eventId, loadOutreachCount])

  async function parseDeck() {
    if (!deckText.trim()) return
    setParsingDeck(true)
    try {
      const res = await fetch('/api/admin/sponsorship/deck/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: deckText.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Could not read the deck')
      setDeckBrief(json.deck_brief ?? '')
      toast({
        title: 'Deck read',
        description: 'The deck summary will be blended into the match.',
      })
    } catch (e) {
      toast({
        title: 'Could not read the deck',
        description: e instanceof Error ? e.message : 'Parse failed',
        variant: 'destructive',
      })
    } finally {
      setParsingDeck(false)
    }
  }

  async function findSponsors() {
    if (!eventId) {
      toast({ title: 'Choose an event first', variant: 'destructive' })
      return
    }
    setMatching(true)
    setCounts(null)
    setColdStatus(null)
    try {
      const res = await fetch('/api/admin/sponsorship/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          brief: brief.trim() || undefined,
          deck_brief: deckBrief.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Match failed')
      setCounts(json.counts ?? null)
      setColdStatus(json.cold_status ?? null)
      setRefreshKey((k) => k + 1)
      loadOutreachCount()
      toast({
        title: 'Ideal sponsors found',
        description: `${json.counts?.total ?? 0} prospects ranked for this event.`,
      })
    } catch (e) {
      toast({
        title: 'Could not find sponsors',
        description: e instanceof Error ? e.message : 'Match failed',
        variant: 'destructive',
      })
    } finally {
      setMatching(false)
    }
  }

  const coldLimited = coldStatus === 'upgrade_required' || coldStatus === 'unavailable'

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Sponsorship intelligence"
        description="Find the ideal sponsors for an event — warm matches from your CRM plus cold discovery — then draft a personalised outreach sequence for your review."
      />

      <div className="mb-6">
        <div className="max-w-md">
          <Select
            label="Event"
            placeholder={events.length ? 'Choose an event…' : 'No events found'}
            options={events.map((ev) => ({
              value: ev.id,
              label: ev.start_date ? `${ev.title} · ${fmtDate(ev.start_date)}` : ev.title,
            }))}
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
          />
        </div>
      </div>

      {/* Intelligence panel */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles size={16} className="text-gold" /> Find ideal sponsors
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Textarea
            label="Brief (optional)"
            placeholder="Describe the ideal sponsor — sectors, audience fit, deal size, anything that should steer the match…"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
          />

          <div className="space-y-2">
            <Textarea
              label="Paste deck text (optional)"
              placeholder="Paste the text of a sponsorship deck or prospectus — it's summarised and blended into the match."
              value={deckText}
              onChange={(e) => setDeckText(e.target.value)}
              rows={3}
            />
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="secondary"
                icon={
                  parsingDeck ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <FileText size={13} />
                  )
                }
                onClick={parseDeck}
                disabled={!deckText.trim() || parsingDeck}
              >
                Read deck
              </Button>
              {deckBrief && (
                <span className="text-xs text-accent inline-flex items-center gap-1">
                  Deck summary ready — it will be used in the match.
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Button
              icon={<Wand2 size={16} />}
              onClick={findSponsors}
              loading={matching}
              disabled={!eventId}
            >
              {matching ? 'Finding…' : 'Find ideal sponsors'}
            </Button>

            {counts && (
              <p className="text-sm text-text-muted">
                {counts.total} prospects · {counts.warm} warm · {counts.cold} cold
              </p>
            )}
          </div>

          {coldLimited && (
            <div className="px-3 py-2.5 rounded-[var(--radius-md)] bg-[rgba(184,151,90,0.08)] border border-[rgba(184,151,90,0.25)]">
              <p className="text-xs text-gold-dark">
                Cold discovery couldn’t run (no usable search criteria, or the data
                vendor’s search quota is used up) — showing warm CRM matches only.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      {eventId && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Prospects found" value={counts?.total ?? '—'} />
          <StatCard label="Warm (CRM)" value={counts?.warm ?? '—'} />
          <StatCard label="Cold (discovery)" value={counts?.cold ?? '—'} />
          <StatCard label="Outreach sent" value={outreachCount ?? '—'} />
        </div>
      )}

      {/* Ranked prospects for the selected event */}
      {eventId && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">
              Ranked prospects
            </h2>
            <QueueLink eventId={eventId} />
          </div>
          <ProspectsView key={`${eventId}-${refreshKey}`} eventId={eventId} />
        </div>
      )}
    </div>
  )
}
