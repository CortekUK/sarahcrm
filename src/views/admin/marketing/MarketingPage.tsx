'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Megaphone, Plus, Loader2, Upload } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import {
  Button,
  Badge,
  Card,
  Input,
  Select,
  Textarea,
  Modal,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  CHANNEL_META,
  CHANNEL_GROUP_ORDER,
  MARKETING_CHANNELS,
  VOICE_KEYS,
  VOICE_LABELS,
} from '@/lib/marketing/channels'
import type {
  MarketingChannelKey,
  MarketingChannelGroup,
  VoiceKey,
} from '@/lib/marketing/channels'

type SourceType = 'event' | 'topic' | 'audio'
type Channel = MarketingChannelKey

interface CampaignRow {
  id: string
  title: string
  source_type: SourceType
  status: string
  asset_count: number
  created_at: string
}

interface EventOption {
  id: string
  title: string
  start_date: string | null
}

const SOURCE_OPTIONS = [
  { value: 'event', label: 'An event' },
  { value: 'topic', label: 'A typed topic / brief' },
  { value: 'audio', label: 'An audio recording (transcribed)' },
]

// Channels grouped for the create modal (Blogs / LinkedIn / Instagram /
// Newsletter / PR / Sponsor), driven by the shared channel metadata.
const CHANNELS_BY_GROUP: { group: MarketingChannelGroup; channels: MarketingChannelKey[] }[] =
  CHANNEL_GROUP_ORDER.map((group) => ({
    group,
    channels: MARKETING_CHANNELS.filter((k) => CHANNEL_META[k].group === group),
  })).filter((g) => g.channels.length > 0)

// Sensible default selection (kept small to avoid generating all 9 by default).
const DEFAULT_CHANNELS: Channel[] = ['seo_blog', 'linkedin']

// Social-graphic dropdown sentinels (distinct from any real template id).
//   AUTO = assign the default template (admin picks the image + renders in the
//          approval queue, per post, from Google Drive).
//   NONE = explicitly skip graphics — caption-only social posts.
const GRAPHIC_AUTO = 'auto'
const GRAPHIC_NONE = '__none__'

function statusVariant(status: string): 'active' | 'upcoming' | 'draft' | 'info' {
  if (status === 'ready') return 'active'
  if (status === 'generating') return 'upcoming'
  if (status === 'archived') return 'info'
  return 'draft'
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
      new Date(iso),
    )
  } catch {
    return iso
  }
}

export function MarketingPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/marketing/campaigns')
      const json = await res.json()
      if (res.ok) setCampaigns(json.campaigns ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Marketing"
        description="Turn an event, a typed topic, or an uploaded recording into on-brand marketing drafts — then review, edit and approve each piece before it publishes."
        actions={
          <Button icon={<Plus size={16} />} onClick={() => setModalOpen(true)}>
            New campaign
          </Button>
        }
      />

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-text-muted text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading campaigns…
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center">
              <Megaphone size={20} className="text-text-dim" />
            </div>
            <p className="text-text font-medium">No campaigns yet</p>
            <p className="text-sm text-text-muted max-w-sm">
              Create your first campaign from an event, a topic or a recording to generate
              multi-channel drafts.
            </p>
            <Button icon={<Plus size={16} />} onClick={() => setModalOpen(true)} className="mt-1">
              New campaign
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Drafts</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/dashboard/marketing/${c.id}`)}
                >
                  <TableCell className="font-medium text-text">{c.title}</TableCell>
                  <TableCell className="text-text-muted capitalize">
                    {c.source_type === 'audio' ? 'recording' : c.source_type}
                  </TableCell>
                  <TableCell className="text-text-muted">{c.asset_count}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-text-muted">{fmtDate(c.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <NewCampaignModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(id) => {
          setModalOpen(false)
          router.push(`/dashboard/marketing/${id}`)
        }}
      />
    </div>
  )
}

function NewCampaignModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (campaignId: string) => void
}) {
  const [title, setTitle] = useState('')
  const [sourceType, setSourceType] = useState<SourceType>('topic')
  const [eventId, setEventId] = useState('')
  const [topicBrief, setTopicBrief] = useState('')
  const [transcript, setTranscript] = useState('')
  const [transcribing, setTranscribing] = useState(false)
  const [channels, setChannels] = useState<Channel[]>(DEFAULT_CHANNELS)
  const [defaultVoice, setDefaultVoice] = useState<VoiceKey>('club')
  // Social-graphic choice: GRAPHIC_AUTO (default), a template id (override), or
  // GRAPHIC_NONE (explicitly text-only).
  const [graphicChoice, setGraphicChoice] = useState<string>(GRAPHIC_AUTO)
  const [templates, setTemplates] = useState<{ id: string; name: string; shape: string }[]>([])
  const [events, setEvents] = useState<EventOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // Reset on open.
    setTitle('')
    setSourceType('topic')
    setEventId('')
    setTopicBrief('')
    setTranscript('')
    setChannels(DEFAULT_CHANNELS)
    setDefaultVoice('club')
    setGraphicChoice(GRAPHIC_AUTO)
    setError(null)
    // Load recent events for the picker (events table is in generated types).
    supabase
      .from('events')
      .select('id, title, start_date')
      .order('start_date', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setEvents((data ?? []) as EventOption[])
      })
    // Load templates for the optional graphic picker (best-effort).
    fetch('/api/admin/marketing/templates')
      .then((r) => r.json())
      .then((j) => setTemplates(j.templates ?? []))
      .catch(() => {})
  }, [open])

  const hasSocial = channels.some((c) =>
    ['instagram_feed', 'instagram_carousel', 'instagram_reel', 'linkedin'].includes(c),
  )

  function toggleChannel(key: Channel) {
    setChannels((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]))
  }

  async function handleAudio(file: File) {
    setTranscribing(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/marketing/transcribe', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Transcription failed')
      setTranscript(json.transcript ?? '')
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ''))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed')
    } finally {
      setTranscribing(false)
    }
  }

  async function handleSubmit() {
    setError(null)
    if (!title.trim()) return setError('Please give the campaign a title.')
    if (channels.length === 0) return setError('Pick at least one channel to generate.')
    if (sourceType === 'event' && !eventId) return setError('Choose an event.')
    if (sourceType === 'topic' && !topicBrief.trim()) return setError('Type a topic or brief.')
    if (sourceType === 'audio' && !transcript.trim())
      return setError('Upload a recording to transcribe first.')

    setSubmitting(true)
    try {
      const createRes = await fetch('/api/admin/marketing/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          source_type: sourceType,
          event_id: sourceType === 'event' ? eventId : null,
          topic_brief: sourceType === 'topic' ? topicBrief.trim() : null,
          transcript: sourceType === 'audio' ? transcript.trim() : null,
        }),
      })
      const created = await createRes.json()
      if (!createRes.ok) throw new Error(created.error ?? 'Failed to create campaign')
      const campaignId = created.campaign.id as string

      // Translate the graphic choice into the generate route's contract:
      //   AUTO → assign the default template (no image yet; admin picks one
      //          from Drive + renders per post in the approval queue)
      //   NONE → skip graphics entirely (caption-only)
      //   <id> → assign that specific template as an override
      const isNone = graphicChoice === GRAPHIC_NONE
      const isAuto = graphicChoice === GRAPHIC_AUTO
      const genRes = await fetch('/api/admin/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          channels,
          default_voice: defaultVoice,
          template_id: isNone || isAuto ? null : graphicChoice,
          graphic_mode: isNone ? 'none' : 'auto',
        }),
      })
      const gen = await genRes.json()
      if (!genRes.ok) {
        // Campaign exists but generation failed — still open it so the user can retry.
        setError(gen.error ?? 'Generation failed — opening the campaign so you can retry.')
        onCreated(campaignId)
        return
      }
      onCreated(campaignId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New campaign" size="lg">
      <div className="space-y-5">
        <Input
          label="Campaign title"
          placeholder="e.g. Autumn Founders Dinner recap"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <Select
          label="Source"
          options={SOURCE_OPTIONS}
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as SourceType)}
        />

        {sourceType === 'event' && (
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
        )}

        {sourceType === 'topic' && (
          <Textarea
            label="Topic / brief"
            placeholder="Describe the topic, angle and any key points to cover…"
            value={topicBrief}
            onChange={(e) => setTopicBrief(e.target.value)}
            className="min-h-[120px]"
          />
        )}

        {sourceType === 'audio' && (
          <div className="space-y-3">
            <div>
              <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-1.5">
                Recording
              </label>
              <label
                className={cn(
                  'flex items-center gap-2 px-3.5 py-2.5 rounded-[var(--radius-md)] border border-dashed border-border text-sm text-text-muted cursor-pointer hover:border-gold transition-colors',
                  transcribing && 'opacity-60 pointer-events-none',
                )}
              >
                {transcribing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
                {transcribing ? 'Transcribing…' : 'Upload an audio file (mp3, m4a, wav — max 25 MB)'}
                <input
                  type="file"
                  accept="audio/*,.mp3,.m4a,.wav,.mp4,.webm"
                  className="hidden"
                  disabled={transcribing}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleAudio(f)
                  }}
                />
              </label>
            </div>
            <Textarea
              label="Transcript (editable)"
              placeholder="The transcript will appear here after upload. You can edit it before generating."
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              className="min-h-[120px]"
            />
          </div>
        )}

        <div>
          <Select
            label="Default voice"
            options={VOICE_KEYS.map((k) => ({ value: k, label: VOICE_LABELS[k] }))}
            value={defaultVoice}
            onChange={(e) => setDefaultVoice(e.target.value as VoiceKey)}
          />
          <p className="text-xs text-text-dim mt-1.5">
            Applied to the blog, Instagram, press-release and sponsor channels. LinkedIn always
            produces all four variants — The Club, Sarah, Sponsor and Founder spotlight — regardless
            of this choice.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
              Channels to generate
            </label>
            <div className="flex gap-3 text-xs">
              <button
                type="button"
                className="text-gold hover:underline"
                onClick={() => setChannels([...MARKETING_CHANNELS])}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-text-muted hover:text-text"
                onClick={() => setChannels([])}
              >
                Clear
              </button>
            </div>
          </div>

          {CHANNELS_BY_GROUP.map(({ group, channels: groupChannels }) => (
            <div key={group}>
              <p className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-text-dim mb-1.5">
                {group}
              </p>
              <div className="flex flex-wrap gap-2">
                {groupChannels.map((key) => {
                  const meta = CHANNEL_META[key]
                  const on = channels.includes(key)
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleChannel(key)}
                      className={cn(
                        'px-3.5 py-2 rounded-[var(--radius-md)] border text-sm text-left transition-colors',
                        on
                          ? 'border-gold bg-gold-muted text-text'
                          : 'border-border text-text-muted hover:text-text',
                      )}
                    >
                      <span className="block font-medium">{meta.label}</span>
                      <span className="block text-xs text-text-dim">{meta.hint}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {hasSocial && (
          <div>
            <Select
              label="Social graphic"
              options={[
                { value: GRAPHIC_AUTO, label: 'Add a template graphic' },
                ...templates.map((t) => ({
                  value: t.id,
                  label: `Template: ${t.name} (${t.shape})`,
                })),
                { value: GRAPHIC_NONE, label: 'No graphic (caption only)' },
              ]}
              value={graphicChoice}
              onChange={(e) => setGraphicChoice(e.target.value)}
            />
            <p className="text-xs text-text-dim mt-1.5">
              Applied to the Instagram + LinkedIn posts. <strong>Add a template graphic</strong>{' '}
              assigns the default template and drafts an on-graphic heading from each post’s own
              angle — then, per post in the approval queue, you pick an image from Google Drive and
              render the graphic. Pick a specific template to override the default, or{' '}
              <strong>No graphic</strong> for caption-only posts.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-accent-warm">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            {submitting ? 'Generating…' : 'Create & generate'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
