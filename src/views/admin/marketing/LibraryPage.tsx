'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Library,
  Loader2,
  Search,
  Copy,
  ExternalLink,
  Sparkles,
  FileText,
  Linkedin,
  Instagram,
  Mail,
  Newspaper,
  Handshake,
  CalendarDays,
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { toast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  CHANNEL_META,
  VOICE_LABELS,
  linkedInVariantLabel,
  isMarketingChannel,
} from '@/lib/marketing/channels'
import type { MarketingChannelKey, VoiceKey } from '@/lib/marketing/channels'

interface LibraryItem {
  id: string
  campaign_id: string | null
  campaign_title: string | null
  channel: string
  variant: string | null
  voice: string | null
  title: string | null
  body: string | null
  status: string
  email_template_id: string | null
  event_id: string | null
  event_title: string | null
  sponsor_member_id: string | null
  sponsor_name: string | null
  member_id: string | null
  member_name: string | null
  published_at: string | null
  updated_at: string | null
}

interface Facets {
  events: { id: string; title: string }[]
  sponsors: { id: string; name: string }[]
  channels: string[]
  voices: string[]
}

const CHANNEL_ICON: Record<MarketingChannelKey, typeof FileText> = {
  seo_blog: FileText,
  recap_blog: FileText,
  linkedin: Linkedin,
  instagram_feed: Instagram,
  instagram_carousel: Instagram,
  instagram_reel: Instagram,
  newsletter: Mail,
  press_release: Newspaper,
  sponsor_recap: Handshake,
}

function channelLabel(channel: string): string {
  return isMarketingChannel(channel) ? CHANNEL_META[channel].label : channel
}

function channelIcon(channel: string): typeof FileText {
  return isMarketingChannel(channel) ? CHANNEL_ICON[channel] : FileText
}

function itemLabel(item: LibraryItem): string {
  const base = channelLabel(item.channel)
  if (item.channel === 'linkedin' && item.variant) {
    const vl = linkedInVariantLabel(item.variant)
    return vl ? `${base} · ${vl}` : base
  }
  return base
}

const STATUS_VARIANT: Record<string, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  draft: 'draft',
  in_review: 'info',
  approved: 'active',
  scheduled: 'upcoming',
  published: 'active',
  rejected: 'urgent',
}

export function LibraryPage() {
  const router = useRouter()
  const [items, setItems] = useState<LibraryItem[]>([])
  const [facets, setFacets] = useState<Facets>({ events: [], sponsors: [], channels: [], voices: [] })
  const [loading, setLoading] = useState(true)

  // Filters.
  const [q, setQ] = useState('')
  const [channel, setChannel] = useState('')
  const [voice, setVoice] = useState('')
  const [eventId, setEventId] = useState('')
  const [sponsorId, setSponsorId] = useState('')
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (channel) params.set('channel', channel)
    if (voice) params.set('voice', voice)
    if (eventId) params.set('event_id', eventId)
    if (sponsorId) params.set('sponsor_member_id', sponsorId)
    try {
      const res = await fetch(`/api/admin/marketing/library?${params.toString()}`)
      const json = await res.json()
      if (res.ok) {
        setItems(json.items ?? [])
        setFacets(json.facets ?? { events: [], sponsors: [], channels: [], voices: [] })
      } else {
        toast({ title: 'Failed to load library', description: json.error, variant: 'destructive' })
      }
    } finally {
      setLoading(false)
    }
  }, [q, channel, voice, eventId, sponsorId])

  // Debounce so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      load()
    }, 300)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [load])

  const channelOptions = [
    { value: '', label: 'All channels' },
    ...facets.channels
      .filter(isMarketingChannel)
      .map((c) => ({ value: c, label: CHANNEL_META[c].label })),
  ]
  const voiceOptions = [
    { value: '', label: 'All voices' },
    ...facets.voices.map((v) => ({ value: v, label: VOICE_LABELS[v as VoiceKey] ?? v })),
  ]
  const eventOptions = [
    { value: '', label: 'All events' },
    ...facets.events.map((e) => ({ value: e.id, label: e.title })),
  ]
  const sponsorOptions = [
    { value: '', label: 'All sponsors' },
    ...facets.sponsors.map((s) => ({ value: s.id, label: s.name })),
  ]

  const hasFilters = Boolean(q.trim() || channel || voice || eventId || sponsorId)

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Content Library"
        description="Every finished marketing piece — approved, published or handed to the email designer — searchable and tagged by event, sponsor, channel and voice. Copy a piece, open its campaign, or reuse it as the starting point for a fresh draft."
        breadcrumbs={[{ label: 'Marketing', href: '/dashboard/marketing' }, { label: 'Library' }]}
      />

      {/* Filter bar */}
      <Card className="mb-5">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="lg:col-span-1">
              <div className="relative">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
                />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search title & body…"
                  className="pl-9"
                />
              </div>
            </div>
            <Select
              options={channelOptions}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              aria-label="Filter by channel"
            />
            <Select
              options={voiceOptions}
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              aria-label="Filter by voice"
            />
            <Select
              options={eventOptions}
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              aria-label="Filter by event"
            />
            <Select
              options={sponsorOptions}
              value={sponsorId}
              onChange={(e) => setSponsorId(e.target.value)}
              aria-label="Filter by sponsor"
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-muted text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading library…
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <AdminEmptyState
              icon={Library}
              title={hasFilters ? 'No pieces match these filters' : 'The library is empty'}
              description={
                hasFilters
                  ? 'Try clearing a filter or broadening your search.'
                  : 'Approve or publish a marketing draft (or hand a newsletter to the designer) and it will appear here, ready to reuse.'
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => (
            <LibraryCard key={item.id} item={item} onReuse={(cid) => router.push(`/dashboard/marketing/${cid}`)} />
          ))}
        </div>
      )}
    </div>
  )
}

function LibraryCard({
  item,
  onReuse,
}: {
  item: LibraryItem
  onReuse: (campaignId: string) => void
}) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [reusing, setReusing] = useState(false)
  const Icon = channelIcon(item.channel)
  const voiceKey = item.voice === 'club' || item.voice === 'sarah' ? (item.voice as VoiceKey) : null

  async function copy() {
    try {
      await navigator.clipboard.writeText(item.body ?? '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast({ title: 'Could not copy to clipboard', variant: 'destructive' })
    }
  }

  async function reuse() {
    setReusing(true)
    try {
      const res = await fetch(`/api/admin/marketing/library/${item.id}/reuse`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Reuse failed')
      toast({ title: 'Started a new campaign from this piece' })
      onReuse(json.campaign_id as string)
    } catch (e) {
      toast({
        title: 'Reuse failed',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      })
      setReusing(false)
    }
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardContent className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center shrink-0">
              <Icon size={15} className="text-gold" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-text text-sm leading-tight truncate">{itemLabel(item)}</p>
              {voiceKey && <p className="text-[11px] text-text-dim">{VOICE_LABELS[voiceKey]} voice</p>}
            </div>
          </div>
          <Badge variant={STATUS_VARIANT[item.status] ?? 'draft'}>
            {item.status.replace('_', ' ')}
          </Badge>
        </div>

        {item.title && <p className="font-medium text-text text-sm">{item.title}</p>}

        <p className="text-xs text-text-muted leading-relaxed line-clamp-4 whitespace-pre-wrap break-words">
          {item.body?.trim() || <span className="italic text-text-dim">No content.</span>}
        </p>

        <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
          {item.event_title && (
            <span className="inline-flex items-center gap-1 text-[11px] text-text-dim">
              <CalendarDays size={11} /> {item.event_title}
            </span>
          )}
          {item.sponsor_name && (
            <span className="inline-flex items-center gap-1 text-[11px] text-text-dim">
              <Handshake size={11} /> {item.sponsor_name}
            </span>
          )}
        </div>
      </CardContent>

      <div className="flex items-center gap-2 px-5 py-3 border-t border-border">
        <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {item.campaign_id && (
          <Button
            size="sm"
            variant="ghost"
            icon={<ExternalLink size={14} />}
            onClick={() => router.push(`/dashboard/marketing/${item.campaign_id}`)}
          >
            Open
          </Button>
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          icon={<Sparkles size={14} />}
          loading={reusing}
          onClick={reuse}
          className={cn(reusing && 'pointer-events-none')}
        >
          Reuse
        </Button>
      </div>
    </Card>
  )
}
