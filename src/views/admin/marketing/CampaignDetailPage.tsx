'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Loader2,
  RefreshCw,
  Check,
  X,
  Copy,
  Pencil,
  Save,
  FileText,
  Linkedin,
  Instagram,
  Facebook,
  Music2,
  Globe,
  EyeOff,
  Mail,
  Newspaper,
  Handshake,
  ExternalLink,
  Image as ImageIcon,
  Send,
  Layers,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  AlertCircle,
  Film,
  Play,
  CalendarClock,
  CalendarX,
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { Button, Badge, Card, Textarea, Input, Select, Modal } from '@/components/ui'
import { MediaPicker } from '@/components/ui/MediaPicker'
import { DateTimeField } from '@/components/ui/DateTimeField'
import { cn } from '@/lib/utils'
import { apiClient, getApiErrorMessage } from '@/lib/http'
import { toast } from '@/lib/hooks/use-toast'
import {
  CHANNEL_META,
  CHANNEL_ORDER,
  LINKEDIN_VARIANTS,
  VOICE_LABELS,
  TIKTOK_GRAPHIC_SHAPE,
  TIKTOK_PUBLISH_NOTE,
  isBlogChannel,
  linkedInVariantLabel,
} from '@/lib/marketing/channels'
import type { MarketingChannelKey, VoiceKey } from '@/lib/marketing/channels'
import type {
  CarouselSlide,
  GraphicShape,
  MarketingTemplate,
  TemplateSlot,
  SlotValues,
} from '@/lib/marketing/graphics/types'
import {
  CAROUSEL_MAX_SLIDES,
  CAROUSEL_MIN_SLIDES,
  CAROUSEL_VIDEO_MAX_MB,
  CAROUSEL_VIDEO_MAX_S,
  CAROUSEL_VIDEO_MIN_S,
  SHAPE_LABELS,
  carouselShapeFor,
} from '@/lib/marketing/graphics/types'
import type { CarouselSlideMediaType } from '@/lib/marketing/graphics/types'
import {
  carouselIssues,
  carouselMedia,
  carouselVideoProblems,
  coerceSlides,
  hasCarouselVideoExtension,
  isVideoSlide,
  parseCarouselBody,
  ratioLabel,
  slidesFromText,
} from '@/lib/marketing/graphics/carousel'
import {
  DEFAULT_SCHEDULE_TIMEZONE,
  SCHEDULE_MIN_LEAD_MS,
  formatScheduleTime,
  instantToWallClock,
  isMetricoolSocialChannel,
  scheduleMaxDate,
  scheduleQuickPicks,
  scheduleZoneLabel,
  scheduleZoneShort,
  wallClockToInstant,
} from '@/lib/marketing/publish/schedule'
import { readVideoMeta } from '@/lib/media/video-meta'
import { formatBytes } from '@/lib/media/limits'
import {
  REEL_VIDEO_ACCEPT,
  REEL_VIDEO_MAX_MB,
  coerceReelVideoMeta,
  isEmptyReelMeta,
  reelCoverUrl,
  reelMetaLine,
  reelVideoProblems,
  reelVideoUrl,
  reelVideoWarnings,
  stripPostLabels,
} from '@/lib/marketing/reel'
import type { ReelVideoMeta } from '@/lib/marketing/reel'

const SOCIAL_GRAPHIC_CHANNELS = new Set([
  'instagram_feed',
  'instagram_carousel',
  // instagram_reel has its own video editor (ReelSection), not a graphic.
  'linkedin',
  'facebook',
  'tiktok',
])

type AssetStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'rejected'

interface Asset {
  id: string
  campaign_id: string
  channel: string
  variant: string | null
  voice: string | null
  title: string | null
  body: string | null
  status: AssetStatus
  publish_target: Record<string, unknown> | null
  published_at: string | null
  // When the post should go out (Metricool social channels; set from the
  // Schedule panel). null = publish when approved.
  scheduled_at?: string | null
  email_template_id: string | null
  template_id: string | null
  graphic_url: string | null
  slot_values: SlotValues | null
}

// GET /api/admin/marketing/metricool/status (env only, no network).
interface MetricoolStatus {
  configured: boolean
  mode: 'draft' | 'live'
  timezone: string
}

interface Campaign {
  id: string
  title: string
  source_type: string
  status: string
  event_id?: string | null
}

// Icon per channel — labels come from the shared channel metadata.
const CHANNEL_ICON: Record<MarketingChannelKey, typeof FileText> = {
  seo_blog: FileText,
  recap_blog: FileText,
  linkedin: Linkedin,
  instagram_feed: Instagram,
  instagram_carousel: Instagram,
  instagram_reel: Instagram,
  facebook: Facebook,
  // lucide has no TikTok brand mark — Music2 is the neutral stand-in.
  tiktok: Music2,
  newsletter: Mail,
  press_release: Newspaper,
  sponsor_recap: Handshake,
}

function channelMeta(channel: string): { label: string; icon: typeof FileText } {
  const key = channel as MarketingChannelKey
  if (key in CHANNEL_ICON) {
    return { label: CHANNEL_META[key].label, icon: CHANNEL_ICON[key] }
  }
  return { label: channel, icon: FileText }
}

const CHANNEL_SORT = new Map(CHANNEL_ORDER.map((c, i) => [c as string, i]))
const VARIANT_SORT = new Map(LINKEDIN_VARIANTS.map((v, i) => [v as string, i]))

// Header label + voice line for an asset. LinkedIn assets read
// "LinkedIn · The Club" etc.; other channels show their channel label.
function assetLabel(asset: Asset): string {
  const base = channelMeta(asset.channel).label
  if (asset.channel === 'linkedin' && asset.variant) {
    const vl = linkedInVariantLabel(asset.variant)
    return vl ? `${base} · ${vl}` : base
  }
  return base
}

function voiceLine(asset: Asset): string | null {
  if (asset.voice === 'club' || asset.voice === 'sarah') {
    return `${VOICE_LABELS[asset.voice as VoiceKey]} voice`
  }
  return null
}

const STATUS_VARIANT: Record<AssetStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  draft: 'draft',
  in_review: 'info',
  approved: 'active',
  scheduled: 'upcoming',
  published: 'active',
  rejected: 'urgent',
}

// What a Metricool publish left in publish_target (see
// src/lib/marketing/publish/metricool.ts). null for mock / not-yet-published.
//   mode 'draft' → sitting as a DRAFT in Metricool's planner (asset status
//                  stays 'approved' — it is NOT published anywhere yet);
//   mode 'live'  → scheduled in Metricool, publishes at publicationDate.
function metricoolInfo(
  asset: Asset,
): { mode: 'draft' | 'live'; when: string | null; publishAt: string | null; postId: string | null } | null {
  const t = asset.publish_target
  if (!t || t.platform !== 'metricool') return null
  if (asset.status !== 'approved' && asset.status !== 'published') return null
  const pd = t.publicationDate as { dateTime?: unknown; timezone?: unknown } | undefined
  const when =
    pd && typeof pd.dateTime === 'string'
      ? `${pd.dateTime.replace('T', ' ').slice(0, 16)}${typeof pd.timezone === 'string' ? ` (${pd.timezone})` : ''}`
      : null
  // publishAt (ISO) is stored by MetricoolPublisher; older rows only have the
  // wall-clock publicationDate — convert that in its own zone.
  let publishAt = typeof t.publishAt === 'string' ? t.publishAt : null
  if (!publishAt && pd && typeof pd.dateTime === 'string') {
    const inst = wallClockToInstant(
      pd.dateTime.slice(0, 16),
      typeof pd.timezone === 'string' && pd.timezone ? pd.timezone : DEFAULT_SCHEDULE_TIMEZONE,
    )
    publishAt = inst ? inst.toISOString() : null
  }
  return {
    mode: t.mode === 'live' ? 'live' : 'draft',
    when,
    publishAt,
    postId: typeof t.metricoolPostId === 'string' ? t.metricoolPostId : null,
  }
}

function isFutureIso(iso: string | null | undefined): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return !Number.isNaN(t) && t > Date.now()
}

// What a website blog publish left in publish_target (see
// src/lib/marketing/publish/blog.ts). null when the asset never went to the
// website. live = the post is on /blog right now; otherwise it was taken
// down (unpublished) and approving again re-publishes it at the same URL.
function websiteInfo(
  asset: Asset,
): { live: boolean; url: string | null; unpublishedAt: string | null } | null {
  const t = asset.publish_target
  if (!t || t.platform !== 'website') return null
  return {
    live: asset.status === 'published',
    url: typeof t.url === 'string' ? t.url : null,
    unpublishedAt: typeof t.unpublished_at === 'string' ? t.unpublished_at : null,
  }
}

function fmtDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function CampaignDetailPage() {
  const params = useParams<{ id: string }>()
  const campaignId = params.id
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [templates, setTemplates] = useState<MarketingTemplate[]>([])
  const [metricoolStatus, setMetricoolStatus] = useState<MetricoolStatus | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/marketing/campaigns/${campaignId}`)
    if (res.status === 404) {
      setNotFound(true)
      setLoading(false)
      return
    }
    const json = await res.json()
    if (res.ok) {
      setCampaign(json.campaign)
      setAssets(json.assets ?? [])
    }
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    fetch('/api/admin/marketing/templates')
      .then((r) => r.json())
      .then((j) => setTemplates(j.templates ?? []))
      .catch(() => {})
    // Draft vs live + timezone (env only) — drives the Schedule / Approve wording.
    fetch('/api/admin/marketing/metricool/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && typeof j.configured === 'boolean') {
          setMetricoolStatus({
            configured: j.configured,
            mode: j.mode === 'live' ? 'live' : 'draft',
            timezone: typeof j.timezone === 'string' && j.timezone ? j.timezone : DEFAULT_SCHEDULE_TIMEZONE,
          })
        }
      })
      .catch(() => {})
  }, [])

  function updateAsset(updated: Asset) {
    setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
  }

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title={campaign?.title ?? 'Campaign'}
        description="Approval queue — review, edit and approve each channel draft. Nothing publishes until you click Approve."
        backHref="/dashboard/marketing"
        breadcrumbs={[
          { label: 'Marketing', href: '/dashboard/marketing' },
          { label: campaign?.title ?? 'Campaign' },
        ]}
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-muted text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      ) : notFound ? (
        <Card className="p-8 text-center text-text-muted">Campaign not found.</Card>
      ) : assets.length === 0 ? (
        <Card className="p-8 text-center text-text-muted">
          No drafts yet for this campaign.
        </Card>
      ) : (
        <div className="space-y-5">
          {[...assets]
            .sort((a, b) => {
              const byChannel =
                (CHANNEL_SORT.get(a.channel) ?? 99) - (CHANNEL_SORT.get(b.channel) ?? 99)
              if (byChannel !== 0) return byChannel
              // Within LinkedIn, order the four variants deterministically.
              return (VARIANT_SORT.get(a.variant ?? '') ?? 99) - (VARIANT_SORT.get(b.variant ?? '') ?? 99)
            })
            .map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                campaignId={campaignId}
                onChange={updateAsset}
                templates={templates}
                metricoolStatus={metricoolStatus}
              />
            ))}
        </div>
      )}
    </div>
  )
}

function AssetCard({
  asset,
  campaignId,
  onChange,
  templates,
  metricoolStatus,
}: {
  asset: Asset
  campaignId: string
  onChange: (a: Asset) => void
  templates: MarketingTemplate[]
  metricoolStatus: MetricoolStatus | null
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(asset.title ?? '')
  const [body, setBody] = useState(asset.body ?? '')
  const [busy, setBusy] = useState<
    null | 'save' | 'approve' | 'reject' | 'regenerate' | 'resend' | 'unpublish' | 'unschedule'
  >(null)
  const [resendOpen, setResendOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Bumped after a regenerate so the graphic editors re-initialise from the
  // fresh slot_values (new carousel slides etc.).
  const [graphicKey, setGraphicKey] = useState(0)

  useEffect(() => {
    setTitle(asset.title ?? '')
    setBody(asset.body ?? '')
  }, [asset.title, asset.body])

  const meta = channelMeta(asset.channel)
  const Icon = meta.icon
  const metricool = metricoolInfo(asset)
  const website = websiteInfo(asset)
  const isBlog = isBlogChannel(asset.channel)
  const confirm = useConfirm()
  // Locked once published OR once handed to Metricool (even as a draft) — the
  // server also refuses a second approve so Metricool never gets a duplicate.
  const published = asset.status === 'published' || metricool !== null
  // Instagram carousel publish gate: at least 2 rendered slides (slide 1 =
  // graphic_url, 2..n = publish_target.media_urls). The server enforces it too.
  const isCarousel = asset.channel === 'instagram_carousel'
  const carouselSlideCount = isCarousel ? carouselMedia(asset.graphic_url, asset.publish_target).length : 0
  const carouselBlocked = isCarousel && !published && carouselSlideCount < CAROUSEL_MIN_SLIDES
  const carouselBlockReason = carouselBlocked
    ? `A carousel needs at least ${CAROUSEL_MIN_SLIDES} ready slides (rendered images or checked videos) to publish — ${carouselSlideCount} ready so far. Use “${carouselSlideCount ? 'Edit slides' : 'Build slides'}” above.`
    : null
  // Instagram reel publish gate: a video (publish_target.video_url). The
  // server refuses too; an old reel's image graphic is never posted.
  const isReel = asset.channel === 'instagram_reel'
  const reelBlocked = isReel && !published && !reelVideoUrl(asset.publish_target)
  const reelBlockReason = reelBlocked
    ? 'A reel needs its video before it can be approved — add it under “Reel video” above.'
    : null
  const approveBlockReason = carouselBlockReason ?? reelBlockReason
  const isNewsletter = asset.channel === 'newsletter'
  // Scheduling — Metricool social channels only, when Metricool is configured
  // (otherwise the mock publisher ignores the time).
  const tz = metricoolStatus?.timezone ?? DEFAULT_SCHEDULE_TIMEZONE
  const zoneShort = scheduleZoneShort(tz)
  const draftMode = metricoolStatus?.mode !== 'live'
  const canSchedule = isMetricoolSocialChannel(asset.channel) && metricoolStatus?.configured === true
  const scheduledAt = canSchedule && !published ? (asset.scheduled_at ?? null) : null
  const scheduleFuture = isFutureIso(scheduledAt)
  const schedulePassed = !!scheduledAt && !scheduleFuture
  // Sent to Metricool and not published yet → can be unscheduled.
  const sentPending =
    metricool !== null && (metricool.mode === 'draft' || isFutureIso(metricool.publishAt))
  const editorHref = asset.email_template_id
    ? `/dashboard/communications/templates/editor?id=${asset.email_template_id}`
    : null

  async function patch(action: 'save' | 'approve' | 'reject' | 'in_review') {
    if (action === 'approve' && canSchedule && scheduledAt && !isFutureIso(scheduledAt)) {
      const ok = await confirm({
        title: 'The scheduled time has passed',
        description: `This post was scheduled for ${formatScheduleTime(scheduledAt, tz)} (${zoneShort}), which is now in the past. ${
          draftMode
            ? 'Approving now sends it to Metricool as a draft dated now.'
            : 'Approving now publishes it immediately.'
        } To pick a new time instead, cancel and use “Schedule”.`,
        confirmLabel: draftMode ? 'Send draft now' : 'Publish now',
        tone: 'warning',
      })
      if (!ok) return
    }
    setBusy(action === 'in_review' ? 'save' : action)
    setError(null)
    try {
      const res = await fetch(`/api/admin/marketing/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, title, body }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Update failed')
      onChange(json.asset as Asset)
      if (action === 'save') setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(null)
    }
  }

  // "Send again" — resets a Metricool-sent asset to in_review (old
  // publish_target kept under publish_target.previous). It does NOT publish:
  // the admin clicks Approve again afterwards.
  async function resetForResend() {
    setBusy('resend')
    setError(null)
    try {
      const { data } = await apiClient.patch<{ asset: Asset; notice?: string }>(
        `/api/admin/marketing/assets/${asset.id}`,
        { action: 'resend' },
      )
      onChange(data.asset)
      setResendOpen(false)
      toast({
        title: 'Ready to send again',
        description: `${data.notice ? `${data.notice} ` : ''}Review the post, then approve it to send it to Metricool.`,
      })
    } catch (e) {
      toast({
        title: 'Could not reset the post',
        description: getApiErrorMessage(e, 'Please try again.'),
        variant: 'destructive',
      })
    } finally {
      setBusy(null)
    }
  }

  // "Unschedule" — deletes the still-pending Metricool post and puts the asset
  // back to in_review (scheduled_at kept). Reschedule = this, then the panel.
  async function unschedule(reschedule = false) {
    const ok = await confirm({
      title: reschedule ? 'Reschedule this post?' : 'Unschedule this post?',
      description: `The ${metricool?.mode === 'draft' ? 'draft' : 'scheduled post'} will be deleted from Metricool and this post goes back to review${
        reschedule ? ' — then pick the new time and approve it again' : ' — you can edit it and approve it again'
      }. Nothing is published.`,
      confirmLabel: reschedule ? 'Unschedule & pick a time' : 'Unschedule',
      tone: 'warning',
    })
    if (!ok) return
    setBusy('unschedule')
    setError(null)
    try {
      const { data } = await apiClient.patch<{ asset: Asset; notice?: string }>(
        `/api/admin/marketing/assets/${asset.id}`,
        { action: 'unschedule' },
      )
      onChange(data.asset)
      toast({ title: 'Unscheduled', description: data.notice ?? 'Removed from Metricool.' })
      if (reschedule) setScheduleOpen(true)
    } catch (e) {
      toast({
        title: 'Could not unschedule the post',
        description: getApiErrorMessage(e, 'Please try again.'),
        variant: 'destructive',
      })
    } finally {
      setBusy(null)
    }
  }

  // "Unpublish" — takes a live website blog post down. The asset goes back to
  // in_review; approving it again re-publishes at the same URL.
  async function unpublish() {
    const ok = await confirm({
      title: 'Take this post off the website?',
      description:
        'The blog post will no longer be visible on the website. You can edit it and approve it again to re-publish it at the same address.',
      confirmLabel: 'Unpublish',
      tone: 'warning',
    })
    if (!ok) return
    setBusy('unpublish')
    setError(null)
    try {
      const { data } = await apiClient.patch<{ asset: Asset }>(
        `/api/admin/marketing/assets/${asset.id}`,
        { action: 'unpublish' },
      )
      onChange(data.asset)
      toast({ title: 'Taken off the website', description: 'The blog post is no longer public.' })
    } catch (e) {
      toast({
        title: 'Could not unpublish the post',
        description: getApiErrorMessage(e, 'Please try again.'),
        variant: 'destructive',
      })
    } finally {
      setBusy(null)
    }
  }

  async function regenerate() {
    setBusy('regenerate')
    setError(null)
    try {
      const res = await fetch('/api/admin/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          channels: [asset.channel],
          regenerate_asset_id: asset.id,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Regeneration failed')
      const regenerated = (json.assets ?? []).find(
        (a: { id: string }) => a.id === asset.id,
      )
      if (regenerated) {
        onChange({ ...asset, ...regenerated } as Asset)
        setEditing(false)
        setGraphicKey((k) => k + 1)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Regeneration failed')
    } finally {
      setBusy(null)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Could not copy to clipboard.')
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center">
            <Icon size={17} className="text-gold" />
          </div>
          <div>
            <p className="font-medium text-text leading-tight">{assetLabel(asset)}</p>
            {voiceLine(asset) && (
              <p className="text-xs text-text-dim">{voiceLine(asset)}</p>
            )}
          </div>
        </div>
        {metricool ? (
          <Badge variant={metricool.mode === 'draft' || isFutureIso(metricool.publishAt) ? 'upcoming' : 'active'}>
            {metricool.mode === 'draft'
              ? 'Metricool draft'
              : isFutureIso(metricool.publishAt)
                ? 'Scheduled on Metricool'
                : 'Sent to Metricool'}
          </Badge>
        ) : website?.live ? (
          <Badge variant="active">Live on website</Badge>
        ) : (
          <Badge variant={STATUS_VARIANT[asset.status]}>{asset.status.replace('_', ' ')}</Badge>
        )}
      </div>

      <div className="px-6 py-4 space-y-3">
        {isCarousel ? (
          <CarouselSection
            key={graphicKey}
            asset={asset}
            templates={templates}
            disabled={published}
            onChange={onChange}
          />
        ) : isReel ? (
          <ReelSection key={graphicKey} asset={asset} disabled={published} onChange={onChange} />
        ) : (
          SOCIAL_GRAPHIC_CHANNELS.has(asset.channel) && (
            <GraphicSection
              key={graphicKey}
              asset={asset}
              templates={templates}
              disabled={published}
              onChange={onChange}
            />
          )
        )}
        {isBlog && <BlogHeroSection asset={asset} disabled={published} onChange={onChange} />}
        {editing ? (
          <>
            <Textarea
              label="Title / headline"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="min-h-[44px]"
              rows={2}
            />
            <Textarea
              label="Body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[240px] font-mono text-[13px]"
            />
          </>
        ) : (
          <>
            {title && <p className="font-medium text-text">{title}</p>}
            <pre className="whitespace-pre-wrap break-words font-sans text-sm text-text-muted leading-relaxed">
              {body || <span className="italic text-text-dim">No content.</span>}
            </pre>
          </>
        )}

        {metricool && (
          <p className="text-xs text-text-dim">
            {(() => {
              const at = metricool.publishAt
                ? `${formatScheduleTime(metricool.publishAt, tz)} (${zoneShort})`
                : metricool.when
              if (metricool.mode === 'draft') {
                return `Sent to Metricool as a draft${at ? ` dated ${at}` : ''} — not published yet. Approve it in Metricool’s planner to publish.`
              }
              return isFutureIso(metricool.publishAt)
                ? `Scheduled on Metricool for ${at}.`
                : `Sent / published${at ? ` ${at}` : ''} via Metricool.`
            })()}
          </p>
        )}
        {canSchedule && !published && (scheduledAt || metricoolStatus) && (
          <div className="space-y-1.5">
            {scheduledAt && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                  schedulePassed
                    ? 'text-accent-warm bg-[rgba(196,105,74,0.1)]'
                    : 'text-gold bg-[rgba(184,151,90,0.1)]',
                )}
              >
                <CalendarClock size={13} />
                Scheduled · {formatScheduleTime(scheduledAt, tz)} {zoneShort}
              </span>
            )}
            {schedulePassed && (
              <p className="flex items-start gap-1.5 text-xs text-accent-warm">
                <AlertCircle size={13} className="mt-px shrink-0" />
                This time has passed — approving now will {draftMode ? 'send a draft dated now' : 'publish immediately'}.
                Pick a new time with “Schedule” to post it later.
              </p>
            )}
            {draftMode && (
              <p className="text-xs text-text-dim">
                Metricool is in draft mode — approving sends this to Metricool&rsquo;s planner as a draft
                {scheduleFuture ? ` dated ${formatScheduleTime(scheduledAt!, tz)} (${zoneShort})` : ' dated now'}.
                It won&rsquo;t publish until someone approves it in Metricool.
              </p>
            )}
          </div>
        )}
        {website && (
          <p className="text-xs text-text-dim">
            {website.live ? (
              <>
                Published on the website
                {website.url && (
                  <>
                    {' at '}
                    <a
                      href={website.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gold hover:underline"
                    >
                      {website.url}
                    </a>
                  </>
                )}
                . The marketing team has a review task under Tasks.
              </>
            ) : (
              `Taken off the website${website.unpublishedAt ? ` on ${fmtDateTime(website.unpublishedAt)}` : ''}. Approve again to re-publish it at the same address.`
            )}
          </p>
        )}
        {asset.channel === 'tiktok' && (
          <p className="text-xs text-text-dim">
            {TIKTOK_PUBLISH_NOTE} Caption: {(body ?? '').length} / 300 characters suggested.
          </p>
        )}
        {isBlog && !published && !website && (
          <p className="text-xs text-text-dim">
            Approving publishes this article as a public blog post on the website (The Journal) and
            notifies the marketing team.
          </p>
        )}
        {approveBlockReason && (
          <p className="flex items-start gap-1.5 text-xs text-text-dim">
            <AlertCircle size={13} className="mt-px shrink-0" />
            {approveBlockReason}
          </p>
        )}
        {error && <p className="text-sm text-accent-warm">{error}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-6 py-4 border-t border-border">
        {isNewsletter ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw size={14} />}
              loading={busy === 'regenerate'}
              onClick={regenerate}
            >
              Regenerate
            </Button>
            <span className="text-xs text-text-dim">
              Finish, approve and send this newsletter in the branded email designer.
            </span>
            <div className="flex-1" />
            {editorHref ? (
              <Button
                size="sm"
                icon={<ExternalLink size={14} />}
                onClick={() => window.open(editorHref, '_blank')}
              >
                Open in email designer
              </Button>
            ) : (
              <span className="text-xs text-accent-warm">No linked email template.</span>
            )}
          </>
        ) : editing ? (
          <>
            <Button
              size="sm"
              icon={<Save size={14} />}
              loading={busy === 'save'}
              onClick={() => patch('save')}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTitle(asset.title ?? '')
                setBody(asset.body ?? '')
                setEditing(false)
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw size={14} />}
              loading={busy === 'regenerate'}
              onClick={regenerate}
              disabled={published}
            >
              Regenerate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Pencil size={14} />}
              onClick={() => setEditing(true)}
              disabled={published}
            >
              Edit
            </Button>
            <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <div className="flex-1" />
            {website?.live && (
              <>
                {website.url && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Globe size={14} />}
                    onClick={() => window.open(website.url!, '_blank')}
                  >
                    View on website
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<EyeOff size={14} />}
                  loading={busy === 'unpublish'}
                  onClick={unpublish}
                >
                  Unpublish
                </Button>
              </>
            )}
            {sentPending && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<CalendarX size={14} />}
                  loading={busy === 'unschedule'}
                  onClick={() => unschedule(false)}
                >
                  Unschedule
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<CalendarClock size={14} />}
                  disabled={busy === 'unschedule'}
                  onClick={() => unschedule(true)}
                >
                  Reschedule
                </Button>
              </>
            )}
            {asset.publish_target?.platform === 'metricool' && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Send size={14} />}
                loading={busy === 'resend'}
                onClick={() => setResendOpen(true)}
              >
                Send again
              </Button>
            )}
            {canSchedule && !published && (
              <Button
                size="sm"
                variant="secondary"
                icon={<CalendarClock size={14} />}
                onClick={() => setScheduleOpen(true)}
              >
                {scheduledAt ? 'Change time' : 'Schedule'}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={<X size={14} />}
              loading={busy === 'reject'}
              onClick={() => patch('reject')}
              disabled={published}
              className={cn(!published && 'text-accent-warm hover:text-accent-warm')}
            >
              Reject
            </Button>
            <Button
              size="sm"
              icon={<Check size={14} />}
              loading={busy === 'approve'}
              onClick={() => patch('approve')}
              disabled={published || carouselBlocked || reelBlocked}
              title={approveBlockReason ?? undefined}
            >
              {metricool
                ? metricool.mode === 'draft'
                  ? 'Sent to Metricool (draft)'
                  : 'Sent to Metricool'
                : published
                  ? website?.live
                    ? 'Live on website'
                    : 'Published'
                  : isBlog
                    ? 'Approve & publish to website'
                    : canSchedule
                      ? draftMode
                        ? 'Approve & send draft'
                        : scheduleFuture
                          ? 'Approve & schedule'
                          : 'Approve & publish now'
                      : 'Approve & publish'}
            </Button>
          </>
        )}
      </div>

      <Modal
        open={resendOpen}
        onClose={() => {
          if (busy !== 'resend') setResendOpen(false)
        }}
        title="Send to Metricool again?"
        size="sm"
      >
        <p className="text-sm text-text-muted leading-relaxed">
          The post goes back to review so you can approve it again. If the previous Metricool post
          or draft is still waiting to go out, it is deleted from Metricool first so there&rsquo;s no
          duplicate. If it was already published, it stays on the account.
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <Button
            variant="ghost"
            onClick={() => setResendOpen(false)}
            disabled={busy === 'resend'}
          >
            Cancel
          </Button>
          <Button
            icon={<Send size={14} />}
            loading={busy === 'resend'}
            onClick={resetForResend}
          >
            Send again
          </Button>
        </div>
      </Modal>

      {canSchedule && (
        <SchedulePanel
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          asset={asset}
          timeZone={tz}
          draftMode={draftMode}
          onSaved={onChange}
        />
      )}
    </Card>
  )
}

// ── Schedule panel (Metricool social posts) ──────────────────────────
// Picks a UK (METRICOOL_TIMEZONE) wall-clock time, converts it to an instant
// and saves it as scheduled_at via the asset route (action 'save'). The
// server validates again (>= 5 min ahead, <= 6 months, not yet sent).
function SchedulePanel({
  open,
  onClose,
  asset,
  timeZone,
  draftMode,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  asset: Asset
  timeZone: string
  draftMode: boolean
  onSaved: (a: Asset) => void
}) {
  const [wall, setWall] = useState('')
  const [saving, setSaving] = useState<null | 'save' | 'clear'>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setWall(
      asset.scheduled_at && isFutureIso(asset.scheduled_at)
        ? instantToWallClock(new Date(asset.scheduled_at), timeZone)
        : '',
    )
  }, [open, asset.scheduled_at, timeZone])

  const picks = open ? scheduleQuickPicks(new Date(), timeZone) : []
  // Earliest pickable moment = now + 5 min, as UK wall-clock time (the picker
  // works in plain wall-clock values). Past days, hours and minutes are
  // disabled; the server re-checks the same limit.
  const minDay = new Date(instantToWallClock(new Date(Date.now() + SCHEDULE_MIN_LEAD_MS), timeZone))

  function check(value: string): { iso: string } | { error: string } {
    const inst = wallClockToInstant(value, timeZone)
    if (!inst) return { error: 'Pick a date and time.' }
    const now = Date.now()
    if (inst.getTime() < now + SCHEDULE_MIN_LEAD_MS) return { error: 'Pick a time at least 5 minutes from now.' }
    if (inst.getTime() > scheduleMaxDate(new Date(now)).getTime()) {
      return { error: 'Posts can be scheduled at most 6 months ahead.' }
    }
    return { iso: inst.toISOString() }
  }

  async function save(value: string | null) {
    let scheduled_at: string | null = null
    if (value !== null) {
      const c = check(value)
      if ('error' in c) {
        setError(c.error)
        return
      }
      scheduled_at = c.iso
    }
    setSaving(value === null ? 'clear' : 'save')
    setError(null)
    try {
      const { data } = await apiClient.patch<{ asset: Asset }>(`/api/admin/marketing/assets/${asset.id}`, {
        action: 'save',
        scheduled_at,
      })
      onSaved(data.asset)
      toast({
        title: scheduled_at ? 'Schedule saved' : 'Schedule cleared',
        description: scheduled_at
          ? `${formatScheduleTime(scheduled_at, timeZone)} ${scheduleZoneShort(timeZone)} — approve the post to ${
              draftMode ? 'send it to Metricool as a draft for that time' : 'schedule it on Metricool'
            }.`
          : 'Approving will publish it straight away.',
      })
      onClose()
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not save the schedule.'))
    } finally {
      setSaving(null)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose()
      }}
      title="Schedule post"
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-sm text-text-muted leading-relaxed">
          Pick when this post should go out. It is only sent to Metricool when you approve it.
        </p>
        <div className="flex flex-wrap gap-2">
          {picks.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setWall(p.wall)
                setError(null)
              }}
              className={cn(
                'px-3 py-1.5 rounded-full border text-xs font-medium transition-colors',
                wall === p.wall
                  ? 'border-gold bg-gold-muted text-text'
                  : 'border-border text-text-muted hover:border-border-hover hover:text-text',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <DateTimeField
          label="Publish at"
          value={wall}
          onChange={(v) => {
            setWall(v)
            setError(null)
          }}
          min={minDay}
          hint={scheduleZoneLabel(timeZone)}
          error={error ?? undefined}
        />
        {wall && !error && wallClockToInstant(wall, timeZone) && (
          <p className="text-xs text-text-dim">
            Goes out {formatScheduleTime(wallClockToInstant(wall, timeZone)!, timeZone)}{' '}
            {scheduleZoneShort(timeZone)}
            {draftMode ? ' — as a Metricool draft (draft mode).' : '.'}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          {asset.scheduled_at && (
            <Button
              variant="ghost"
              icon={<CalendarX size={14} />}
              loading={saving === 'clear'}
              disabled={saving === 'save'}
              onClick={() => save(null)}
              className="mr-auto"
            >
              Clear schedule
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={!!saving}>
            Cancel
          </Button>
          <Button
            icon={<CalendarClock size={14} />}
            loading={saving === 'save'}
            disabled={!wall || saving === 'clear'}
            onClick={() => save(wall)}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Hero image on a blog asset ──────────────────────────────────────
// Blog posts don't use template graphics; the image picked here is stored
// as the asset's graphic_url and becomes the public post's hero image on
// approval. Optional — without one the linked event's cover is used (if any).
function BlogHeroSection({
  asset,
  disabled,
  onChange,
}: {
  asset: Asset
  disabled: boolean
  onChange: (a: Asset) => void
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string>(asset.graphic_url ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(next: string | null) {
    setBusy(true)
    setError(null)
    try {
      const { data } = await apiClient.patch<{ asset: Asset }>(
        `/api/admin/marketing/assets/${asset.id}`,
        { action: 'save', graphic_url: next },
      )
      onChange(data.asset)
      setUrl(next ?? '')
      setOpen(false)
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not save the image.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <div className="sm:w-44 shrink-0 bg-surface flex items-center justify-center p-3">
          {asset.graphic_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.graphic_url}
              alt="Blog hero image"
              className="max-h-40 w-auto rounded-[var(--radius-sm)] shadow-sm"
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-text-dim py-6">
              <ImageIcon size={22} />
              <span className="text-xs">No hero image</span>
            </div>
          )}
        </div>
        <div className="flex-1 p-3 flex flex-col gap-2">
          <p className="text-sm text-text font-medium">Hero image</p>
          <p className="text-xs text-text-dim">
            Shown at the top of the blog post on the website. Optional — without one, the linked
            event&rsquo;s cover image is used if there is one.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Pencil size={13} />}
              onClick={() => setOpen((v) => !v)}
              disabled={disabled}
            >
              {open ? 'Close' : asset.graphic_url ? 'Change image' : 'Add image'}
            </Button>
            {asset.graphic_url && !disabled && (
              <Button size="sm" variant="ghost" icon={<X size={13} />} loading={busy && !open} onClick={() => save(null)}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-border p-4 space-y-4">
          <MediaPicker
            label="Hero image"
            value={url}
            onChange={setUrl}
            mediaType="image"
            onMediaTypeChange={() => {}}
            lockedToType="image"
            bucket="gallery"
            folder="marketing"
            hint="Pick from Google Drive, upload, or paste a URL. A wide (landscape) image works best."
          />
          {error && <p className="text-sm text-accent-warm">{error}</p>}
          <div className="flex justify-end">
            <Button size="sm" icon={<Check size={13} />} loading={busy} onClick={() => save(url || null)} disabled={!url}>
              Use this image
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Derive graphic AI text from the existing post so a template picked on a
// text-only post produces a real graphic (not just the logo).
function firstLine(body: string | null): string {
  return (body ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
    ?? ''
}
function deriveHeading(asset: Asset): string {
  return (asset.title?.trim() || firstLine(asset.body)).slice(0, 120)
}
function deriveSubtext(asset: Asset): string {
  const line = firstLine(asset.body)
  const sentence = line.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || line
  return sentence.length > 140 ? `${sentence.slice(0, 137).trimEnd()}…` : sentence
}

// ── Template graphic on a social asset ──────────────────────────────
// Shows the rendered PNG (when present) and an inline editor to swap the
// template, edit the AI text slots, change the photo, and re-render.
function GraphicSection({
  asset,
  templates,
  disabled,
  onChange,
}: {
  asset: Asset
  templates: MarketingTemplate[]
  disabled: boolean
  onChange: (a: Asset) => void
}) {
  const [open, setOpen] = useState(false)
  const [templateId, setTemplateId] = useState<string>(asset.template_id ?? '')
  const initialValues: SlotValues = asset.slot_values ?? {}
  const [texts, setTexts] = useState<Record<string, string>>(() => {
    const t: Record<string, string> = {}
    for (const [id, v] of Object.entries(initialValues.slots ?? {})) {
      if (v?.text) t[id] = v.text
    }
    return t
  })
  const [photo, setPhoto] = useState<string>(
    initialValues.as_is_url ??
      initialValues.background_photo_url ??
      Object.values(initialValues.slots ?? {}).find((v) => v?.photo_url)?.photo_url ??
      '',
  )
  // "Use image as-is" — post an already-designed image (flyer/collage) with NO
  // template overlay. Persisted via slot_values.as_is.
  const [asIs, setAsIs] = useState<boolean>(initialValues.as_is === true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const template = templates.find((t) => t.id === templateId) ?? null
  const aiSlots: TemplateSlot[] = (template?.slots ?? []).filter(
    (s) => (s.type === 'heading' || s.type === 'subtext') && s.text_source === 'ai',
  )
  const usesPhoto =
    template?.background.type === 'photo' || (template?.slots ?? []).some((s) => s.type === 'photo')

  // Core render+save. Given a template, the current text map and photo, render
  // the PNG, persist it on the asset and reflect it. `closeOnSuccess` is true
  // for the manual button, false for auto-render (keep the editor open so the
  // admin sees the graphic and can adjust).
  async function renderWith(
    tpl: MarketingTemplate,
    textsMap: Record<string, string>,
    photoVal: string,
    closeOnSuccess: boolean,
  ) {
    setBusy(true)
    setError(null)
    try {
      // Assemble slot_values from the edited AI text + chosen photo.
      const slots: Record<string, { text?: string; photo_url?: string }> = {}
      for (const s of tpl.slots) {
        if ((s.type === 'heading' || s.type === 'subtext') && s.text_source === 'ai') {
          slots[s.id] = { text: textsMap[s.id] ?? '' }
        } else if (s.type === 'photo' && photoVal) {
          slots[s.id] = { photo_url: photoVal }
        }
      }
      const values: SlotValues = {
        slots,
        // Photo templates use it as their background; colour templates with no
        // photo slot can optionally take it too (it replaces the brand colour).
        background_photo_url:
          tpl.background.type === 'photo' || !tpl.slots.some((s) => s.type === 'photo')
            ? photoVal || null
            : null,
      }
      const rRes = await fetch('/api/admin/marketing/graphics/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // TikTok photo posts are vertical 9:16 — render any template at the
        // 'story' shape (1080×1920) for TikTok; every other channel keeps
        // the template's own shape.
        body: JSON.stringify({
          template_id: tpl.id,
          values,
          shape: asset.channel === 'tiktok' ? TIKTOK_GRAPHIC_SHAPE : tpl.shape,
        }),
      })
      const rJson = await rRes.json()
      if (!rRes.ok) throw new Error(rJson.error ?? 'Render failed')

      const pRes = await fetch(`/api/admin/marketing/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          graphic_url: rJson.graphic_url,
          slot_values: values,
          template_id: tpl.id,
        }),
      })
      const pJson = await pRes.json()
      if (!pRes.ok) throw new Error(pJson.error ?? 'Save failed')
      onChange(pJson.asset as Asset)
      if (closeOnSuccess) setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Re-render failed')
    } finally {
      setBusy(false)
    }
  }

  function rerender() {
    if (!template) return setError('Choose a template first.')
    if (usesPhoto && !photo)
      return setError('Pick an image from Google Drive (or upload one) first.')
    void renderWith(template, texts, photo, true)
  }

  // Called when the admin picks an image via the MediaPicker (Google Drive
  // browse / upload / URL — all emit a public URL the renderer can fetch).
  //   * as-is mode: just hold the URL; the admin clicks "Use this image".
  //   * template mode: the moment an image is chosen AND a template is set,
  //     render the graphic automatically (the new model — no image at
  //     generation, the admin adds one here). Text edits use "Re-render".
  function onPhotoChange(url: string) {
    setPhoto(url)
    setError(null)
    if (asIs || !url || !template) return
    void renderWith(template, texts, url, false)
  }

  // "Use image as-is": set the asset's graphic_url DIRECTLY to the chosen raw
  // image — no ImageResponse render, no heading/brand overlay. Persist
  // slot_values.as_is so the queue knows this asset uses a raw image.
  async function saveAsIs() {
    if (!photo) return setError('Choose or upload an image first.')
    setBusy(true)
    setError(null)
    try {
      // Phone photos carry an EXIF rotation flag that not every platform
      // honours — the server writes an upright copy when the flag isn't 1
      // (otherwise the same URL comes back). If that step fails we keep the
      // original image (old behaviour).
      let postUrl = photo
      try {
        const oRes = await fetch('/api/admin/marketing/graphics/orient', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: photo }),
        })
        const oJson = await oRes.json()
        if (oRes.ok && typeof oJson.url === 'string') postUrl = oJson.url
      } catch {
        /* keep the original image */
      }
      const values: SlotValues = { as_is: true, as_is_url: postUrl }
      const res = await fetch(`/api/admin/marketing/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          graphic_url: postUrl,
          slot_values: values,
          template_id: null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      onChange(json.asset as Asset)
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  // Pre-fill empty AI heading/subtext fields from the stored slot_values (set
  // at generation) or, failing that, derived from the post itself — so the
  // fields are never blank when the editor opens or the template is swapped.
  // NO auto-render here: there is no image yet in the new model. The admin
  // picks an image (via the MediaPicker), which triggers the render.
  useEffect(() => {
    if (!open || asIs || !template) return
    setTexts((prev) => {
      const next = { ...prev }
      for (const s of aiSlots) {
        if (next[s.id]?.trim()) continue
        next[s.id] = s.type === 'heading' ? deriveHeading(asset) : deriveSubtext(asset)
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, open])

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <div className="sm:w-44 shrink-0 bg-surface flex items-center justify-center p-3">
          {asset.graphic_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.graphic_url}
              alt="Rendered graphic"
              className="max-h-40 w-auto rounded-[var(--radius-sm)] shadow-sm"
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-text-dim py-6">
              <ImageIcon size={22} />
              <span className="text-xs">No graphic</span>
            </div>
          )}
        </div>
        <div className="flex-1 p-3 flex flex-col gap-2">
          <p className="text-sm text-text font-medium">Template graphic</p>
          <p className="text-xs text-text-dim">
            {asIs
              ? 'This image is posted as-is (no text overlay). Open the editor to change the image or turn the overlay back on.'
              : asset.graphic_url
                ? 'This rendered image accompanies the caption. Change the photo, edit the AI text or swap the template, then re-render.'
                : 'Add an on-brand graphic to this post from a template.'}
            {asset.channel === 'tiktok' &&
              ' TikTok needs an image: templates render vertically at 1080×1920 (9:16); an as-is image should be 9:16 too.'}
          </p>
          <div>
            <Button
              size="sm"
              variant="secondary"
              icon={<Pencil size={13} />}
              onClick={() => setOpen((v) => !v)}
              disabled={disabled}
            >
              {open ? 'Close graphic editor' : asset.graphic_url ? 'Edit graphic' : 'Add graphic'}
            </Button>
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-border p-4 space-y-4">
          {/* Use image as-is (no text overlay) toggle. */}
          <div className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-3">
            <div>
              <p className="text-sm font-medium text-text">Use image as-is (no text overlay)</p>
              <p className="text-xs text-text-dim mt-0.5">
                For images that are ALREADY finished graphics (flyers, collages with their own
                text/logo). Posts the chosen image directly — no template, no heading or brand
                overlay added.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={asIs}
              onClick={() => setAsIs((v) => !v)}
              className={cn(
                'shrink-0 mt-0.5 relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                asIs ? 'bg-gold' : 'bg-surface-3',
              )}
            >
              <span
                className={cn(
                  'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                  asIs ? 'translate-x-[22px]' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>

          {asIs ? (
            <>
              <MediaPicker
                label="Image to post"
                value={photo}
                onChange={onPhotoChange}
                mediaType="image"
                onMediaTypeChange={() => {}}
                lockedToType="image"
                bucket="gallery"
                folder="marketing"
                hint="Pick from Google Drive, upload, or paste a URL. Posted exactly as-is — no heading or brand overlay is added."
              />

              {error && <p className="text-sm text-accent-warm">{error}</p>}

              <div className="flex justify-end">
                <Button
                  size="sm"
                  icon={<Check size={13} />}
                  loading={busy}
                  onClick={saveAsIs}
                  disabled={!photo}
                >
                  Use this image
                </Button>
              </div>
            </>
          ) : (
          <>
          <Select
            label="Template"
            placeholder="Choose a template…"
            options={templates.map((t) => ({ value: t.id, label: `${t.name} (${t.shape})` }))}
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          />

          {aiSlots.length > 0 && (
            <div className="space-y-2">
              {aiSlots.map((s) => (
                <Input
                  key={s.id}
                  label={s.type === 'heading' ? 'Heading' : 'Subtext'}
                  value={texts[s.id] ?? ''}
                  onChange={(e) => setTexts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                />
              ))}
            </div>
          )}

          {template && (
            <MediaPicker
              label={usesPhoto ? 'Image' : 'Image (optional)'}
              value={photo}
              onChange={onPhotoChange}
              mediaType="image"
              onMediaTypeChange={() => {}}
              lockedToType="image"
              bucket="gallery"
              folder="marketing"
              hint={
                usesPhoto
                  ? 'Pick from Google Drive, upload, or paste a URL. Choosing an image renders the graphic automatically; edit the text and click Re-render to update it.'
                  : 'Optional — add a photo to sit behind the text instead of the brand colour. Leave empty to keep the plain brand background.'
              }
            />
          )}

          {error && <p className="text-sm text-accent-warm">{error}</p>}

          <div className="flex justify-end">
            <Button
              size="sm"
              icon={<RefreshCw size={13} />}
              loading={busy}
              onClick={rerender}
              disabled={!template || (usesPhoto && !photo)}
            >
              {asset.graphic_url ? 'Re-render graphic' : 'Render graphic'}
            </Button>
          </div>
          </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Instagram carousel: multi-slide graphic editor ──────────────────
// One template (and one shape) for the whole carousel — Instagram needs every
// slide at the same aspect ratio. Each slide has its own heading/subtext,
// photo and "use as-is" toggle. Rendering a slide stores its PNG (or the
// cropped as-is copy) on the slide; saving mirrors the renders where the
// publisher reads them: slide 1 → graphic_url, slides 2..n →
// publish_target.media_urls. Slide state lives in slot_values.slides.
// A slide can also be a VIDEO (media_type 'video'): posted as-is — no
// template, text or crop. Picking the video reads its duration / size /
// dimensions in the browser and checks Instagram's carousel video limits; it
// counts as ready (rendered_url = the video URL) only when those pass.

// What the file input offers for a carousel video (MP4 / MOV only).
const CAROUSEL_VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v'

// `#t=0.1` makes browsers paint the first frame as the poster.
function posterFrameSrc(url: string): string {
  return url.includes('#') ? url : `${url}#t=0.1`
}

function formatDuration(s: number): string {
  const total = Math.round(s)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

interface EditorSlide extends CarouselSlide {
  key: string
}

interface SlideStatus {
  busy?: boolean
  error?: string | null
  // Text / toggle / template changed since the last render.
  dirty?: boolean
}

let slideKeySeq = 0
function newSlideKey(): string {
  slideKeySeq += 1
  return `s${Date.now().toString(36)}${slideKeySeq}`
}

function toEditorSlides(slides: CarouselSlide[]): EditorSlide[] {
  return slides.map((s) => ({ ...s, key: newSlideKey() }))
}

function blankSlide(): EditorSlide {
  return {
    key: newSlideKey(),
    heading: '',
    subtext: '',
    photo_url: null,
    as_is: false,
    rendered_url: null,
    media_type: 'image',
  }
}

// Clears everything tied to the slide's current media.
const CLEARED_MEDIA: Partial<CarouselSlide> = {
  photo_url: null,
  rendered_url: null,
  duration_s: null,
  width: null,
  height: null,
  size_bytes: null,
}

// Initial slides: stored slot_values.slides → legacy "Slide n:" lines in the
// body → one slide from the post's heading/subtext. Legacy assets keep any
// renders they already have (graphic_url + media_urls) in order.
function initialCarouselSlides(asset: Asset): EditorSlide[] {
  const stored = coerceSlides(asset.slot_values?.slides)
  if (stored.length) return toEditorSlides(stored)
  const parsed = parseCarouselBody(asset.body)
  let slides: CarouselSlide[] = parsed.slides.length
    ? slidesFromText(parsed.slides)
    : slidesFromText([{ heading: deriveHeading(asset), subtext: deriveSubtext(asset) }])
  const media = carouselMedia(asset.graphic_url, asset.publish_target)
  media.slice(0, CAROUSEL_MAX_SLIDES).forEach((url, i) => {
    const video = hasCarouselVideoExtension(url)
    const media: Partial<CarouselSlide> = video
      ? { rendered_url: url, photo_url: url, media_type: 'video' }
      : { rendered_url: url }
    if (slides[i]) slides[i] = { ...slides[i], ...media }
    else slides = [...slides, { heading: '', subtext: '', photo_url: null, as_is: false, media_type: 'image', ...media }]
  })
  if (!slides.length) return [blankSlide()]
  return toEditorSlides(slides)
}

// Template + one slide → the slot_values the render route takes (mirrors the
// single-graphic editor's rules).
function slideRenderValues(tpl: MarketingTemplate, slide: CarouselSlide): SlotValues {
  const photo = slide.photo_url ?? ''
  const slots: Record<string, { text?: string; photo_url?: string }> = {}
  for (const s of tpl.slots) {
    if (s.type === 'heading' && s.text_source === 'ai') slots[s.id] = { text: slide.heading }
    else if (s.type === 'subtext' && s.text_source === 'ai') slots[s.id] = { text: slide.subtext }
    else if (s.type === 'photo' && photo) slots[s.id] = { photo_url: photo }
  }
  return {
    slots,
    background_photo_url:
      tpl.background.type === 'photo' || !tpl.slots.some((s) => s.type === 'photo') ? photo || null : null,
  }
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-gold' : 'bg-surface-3',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

// Run tasks with a small concurrency limit (Instagram renders are heavy).
async function runLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await fn(item)
    }
  })
  await Promise.all(workers)
}

function CarouselSection({
  asset,
  templates,
  disabled,
  onChange,
}: {
  asset: Asset
  templates: MarketingTemplate[]
  disabled: boolean
  onChange: (a: Asset) => void
}) {
  const [open, setOpen] = useState(false)
  const [templateId, setTemplateId] = useState<string>(asset.template_id ?? '')
  const [slides, setSlidesState] = useState<EditorSlide[]>(() => initialCarouselSlides(asset))
  const slidesRef = useRef<EditorSlide[]>(slides)
  const [status, setStatus] = useState<Record<string, SlideStatus>>({})
  const [renderingAll, setRenderingAll] = useState<{ done: number; total: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoCheckTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  useEffect(() => {
    const timers = videoCheckTimers.current
    return () => Object.values(timers).forEach(clearTimeout)
  }, [])

  const template = templates.find((t) => t.id === templateId) ?? null
  const shape: GraphicShape = carouselShapeFor(template?.shape)
  const usesPhoto =
    template?.background.type === 'photo' || (template?.slots ?? []).some((s) => s.type === 'photo')
  const hasHeading = !template || template.slots.some((s) => s.type === 'heading' && s.text_source === 'ai')
  const hasSubtext = !template || template.slots.some((s) => s.type === 'subtext' && s.text_source === 'ai')
  const media = carouselMedia(asset.graphic_url, asset.publish_target)
  const renderedCount = slides.filter((s) => s.rendered_url).length
  const anyBusy = renderingAll !== null || saving || Object.values(status).some((s) => s.busy)
  const issues = carouselIssues(slides, shape)
  const hasVideo = slides.some(isVideoSlide)
  const needsTemplate = slides.some((s) => !isVideoSlide(s) && !s.as_is)
  // Collapsed strip: which ready media are videos (slide metadata, else extension).
  const videoUrls = new Set(
    slides.filter((s) => isVideoSlide(s) && s.rendered_url).map((s) => s.rendered_url as string),
  )
  const isVideoMedia = (url: string) => videoUrls.has(url) || hasCarouselVideoExtension(url)

  // Keep a ref in step with state so async renders always save the latest.
  function setSlides(updater: (prev: EditorSlide[]) => EditorSlide[]) {
    const next = updater(slidesRef.current)
    slidesRef.current = next
    setSlidesState(next)
    return next
  }
  function patchStatus(key: string, s: SlideStatus) {
    setStatus((prev) => ({ ...prev, [key]: { ...prev[key], ...s } }))
  }
  function updateSlide(key: string, change: Partial<CarouselSlide>, markDirty = true) {
    setSlides((prev) => prev.map((s) => (s.key === key ? { ...s, ...change } : s)))
    if (markDirty) patchStatus(key, { dirty: true, error: null })
  }

  // Persist slides + mirror the renders onto graphic_url / media_urls. Also
  // strips legacy "Slide n:" / "Caption:" scaffolding from the caption.
  async function persist(next: EditorSlide[]) {
    const rendered = next.map((s) => s.rendered_url).filter((u): u is string => !!u)
    const legacy = parseCarouselBody(asset.body)
    const payload: Record<string, unknown> = {
      action: 'save',
      graphic_url: rendered[0] ?? null,
      media_urls: rendered.slice(1),
      slot_values: {
        slides: next.map(({ key: _key, ...s }) => s),
        carousel_shape: shape,
      } satisfies SlotValues,
      template_id: templateId || null,
    }
    if (legacy.hadScaffolding && legacy.caption) payload.body = legacy.caption
    setSaving(true)
    try {
      const { data } = await apiClient.patch<{ asset: Asset }>(
        `/api/admin/marketing/assets/${asset.id}`,
        payload,
      )
      onChange(data.asset)
    } finally {
      setSaving(false)
    }
  }

  // Render (or crop, for as-is) ONE slide → its finished image URL.
  async function produceSlide(slide: CarouselSlide, index: number): Promise<string> {
    if (slide.as_is) {
      if (!slide.photo_url) throw new Error(`Slide ${index + 1}: pick an image first.`)
      // Upright (EXIF) + centre-cropped to the carousel shape — a fresh copy.
      const { data } = await apiClient.post<{ url: string }>('/api/admin/marketing/graphics/orient', {
        url: slide.photo_url,
        shape,
      })
      return data.url
    }
    if (!template) throw new Error('Choose a template first.')
    if (usesPhoto && !slide.photo_url) throw new Error(`Slide ${index + 1}: pick an image first.`)
    const { data } = await apiClient.post<{ graphic_url: string }>('/api/admin/marketing/graphics/render', {
      template_id: template.id,
      values: slideRenderValues(template, slide),
      shape,
    })
    return data.graphic_url
  }

  // VIDEO slide: read the video's metadata in the browser, run the Instagram
  // carousel video checks, and mark it ready (rendered_url = the video URL)
  // only when they pass. Saves either way so the metadata is kept.
  async function checkVideoSlide(key: string, persistAfter = true): Promise<boolean> {
    const slide = slidesRef.current.find((s) => s.key === key)
    const url = slide?.photo_url ?? null
    if (!slide || !url) return false
    patchStatus(key, { busy: true, error: null })
    const meta = await readVideoMeta(url)
    // The user may have swapped/removed the video while we were reading.
    if (slidesRef.current.find((s) => s.key === key)?.photo_url !== url) return false
    const problems = carouselVideoProblems({ url, ...meta })
    if (meta.duration_s == null && !problems.length) {
      problems.push(
        'Could not read this video in the browser — check the link opens a playable MP4/MOV file (HEVC / HDR iPhone videos can’t be posted; export as H.264 MP4).',
      )
    }
    const ok = problems.length === 0
    const next = setSlides((prev) =>
      prev.map((s) =>
        s.key === key
          ? {
              ...s,
              duration_s: meta.duration_s,
              width: meta.width,
              height: meta.height,
              size_bytes: meta.size_bytes,
              rendered_url: ok ? url : null,
            }
          : s,
      ),
    )
    patchStatus(key, { busy: false, dirty: false, error: ok ? null : problems.join(' ') })
    if (persistAfter) {
      try {
        await persist(next)
      } catch (e) {
        patchStatus(key, { error: getApiErrorMessage(e, 'Could not save the slide.') })
        return false
      }
    }
    return ok
  }

  async function renderOne(key: string, persistAfter = true): Promise<boolean> {
    const index = slidesRef.current.findIndex((s) => s.key === key)
    const slide = slidesRef.current[index]
    if (!slide) return false
    if (isVideoSlide(slide)) return checkVideoSlide(key, persistAfter)
    patchStatus(key, { busy: true, error: null })
    try {
      const url = await produceSlide(slide, index)
      const next = setSlides((prev) => prev.map((s) => (s.key === key ? { ...s, rendered_url: url } : s)))
      patchStatus(key, { busy: false, dirty: false })
      if (persistAfter) await persist(next)
      return true
    } catch (e) {
      patchStatus(key, { busy: false, error: getApiErrorMessage(e, 'Render failed') })
      return false
    }
  }

  async function renderAll() {
    setError(null)
    if (!template && slidesRef.current.some((s) => !s.as_is && !isVideoSlide(s))) {
      return setError('Choose a template first.')
    }
    // Video slides have no render step — they're ready once their video passes.
    const keys = slidesRef.current.filter((s) => !isVideoSlide(s)).map((s) => s.key)
    if (!keys.length) return setError('Every slide is a video — videos are posted as-is, nothing to render.')
    let done = 0
    let failed = 0
    setRenderingAll({ done: 0, total: keys.length })
    try {
      await runLimited(keys, 2, async (key) => {
        const ok = await renderOne(key, false)
        if (!ok) failed += 1
        done += 1
        setRenderingAll({ done, total: keys.length })
      })
      await persist(slidesRef.current)
      if (failed) setError(`${failed} slide${failed === 1 ? '' : 's'} could not be rendered — see the slide for details.`)
      else toast({ title: 'Carousel rendered', description: `${keys.length} slides saved in order.` })
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not save the carousel.'))
    } finally {
      setRenderingAll(null)
    }
  }

  // Structural changes (order / removal) are saved straight away so the
  // publish order always matches what is on screen.
  async function structural(updater: (prev: EditorSlide[]) => EditorSlide[]) {
    setError(null)
    const next = setSlides(updater)
    if (!next.some((s) => s.rendered_url) && !media.length) return
    try {
      await persist(next)
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not save the slide order.'))
    }
  }

  function move(key: string, dir: -1 | 1) {
    void structural((prev) => {
      const i = prev.findIndex((s) => s.key === key)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const copy = [...prev]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })
  }

  function remove(key: string) {
    if (slidesRef.current.length <= 1) return
    void structural((prev) => prev.filter((s) => s.key !== key))
  }

  function addSlide() {
    if (slidesRef.current.length >= CAROUSEL_MAX_SLIDES) return
    setSlides((prev) => [...prev, blankSlide()])
  }

  // Picking an image renders that slide straight away (template permitting).
  function onSlidePhoto(key: string, url: string) {
    updateSlide(key, { photo_url: url || null })
    if (!url) return
    const slide = slidesRef.current.find((s) => s.key === key)
    if (slide && (slide.as_is || template)) void renderOne(key)
  }

  function onTemplateChange(id: string) {
    setTemplateId(id)
    setStatus((prev) => {
      const next = { ...prev }
      for (const s of slidesRef.current) {
        if (!s.as_is && !isVideoSlide(s)) next[s.key] = { ...next[s.key], dirty: true }
      }
      return next
    })
  }

  // Image ↔ video. Switching drops the slide's current media (an image render
  // can't be a video and vice versa) and saves straight away.
  function setSlideMediaType(key: string, type: CarouselSlideMediaType) {
    const slide = slidesRef.current.find((s) => s.key === key)
    if (!slide || (slide.media_type ?? 'image') === type) return
    patchStatus(key, { error: null, dirty: false })
    void structural((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...CLEARED_MEDIA, media_type: type, as_is: false } : s)),
    )
  }

  // Picking a video checks it (no render step). Debounced because a typed
  // External URL fires on every keystroke; a stale check is discarded.
  function onSlideVideo(key: string, url: string) {
    const trimmed = url.trim()
    clearTimeout(videoCheckTimers.current[key])
    patchStatus(key, { busy: false, error: null, dirty: false })
    if (!trimmed) {
      void structural((prev) => prev.map((s) => (s.key === key ? { ...s, ...CLEARED_MEDIA } : s)))
      return
    }
    updateSlide(key, { ...CLEARED_MEDIA, photo_url: trimmed }, false)
    if (!/^https?:\/\/\S+\.\S+/i.test(trimmed)) return
    videoCheckTimers.current[key] = setTimeout(() => void checkVideoSlide(key), 600)
  }

  // Video slides saved as "not ready" (e.g. under an older, stricter rule, or
  // before a page reload) are re-checked once automatically, so their status
  // always reflects the current rules without a manual "Re-check video".
  const autoChecked = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const s of slides) {
      if (!isVideoSlide(s) || !s.photo_url || s.rendered_url) continue
      const tag = `${s.key}|${s.photo_url}`
      if (autoChecked.current.has(tag)) continue
      autoChecked.current.add(tag)
      void checkVideoSlide(s.key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides])

  const unrendered = slides
    .map((s, i) => (!s.rendered_url ? i + 1 : null))
    .filter((n): n is number => n !== null)

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 overflow-hidden">
      <div className="p-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-text font-medium flex items-center gap-1.5">
              <Layers size={14} className="text-gold" /> Carousel slides
            </p>
            <p className="text-xs text-text-dim mt-0.5">
              {media.length
                ? `${media.length} slide${media.length === 1 ? '' : 's'} ready to post, in this order. The caption below is posted with them.`
                : 'Build 2–10 swipeable slides — images from a template, or videos posted as-is. The caption below is posted with them.'}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={<Pencil size={13} />}
            onClick={() => setOpen((v) => !v)}
            disabled={disabled}
          >
            {open ? 'Close slide editor' : media.length ? 'Edit slides' : 'Build slides'}
          </Button>
        </div>

        {media.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" aria-label="Ready slides">
            {media.map((url, i) => (
              <div key={`${url}-${i}`} className="relative shrink-0">
                {isVideoMedia(url) ? (
                  <>
                    <video
                      src={posterFrameSrc(url)}
                      muted
                      playsInline
                      preload="metadata"
                      aria-label={`Slide ${i + 1} (video)`}
                      className="h-28 w-auto max-w-[12rem] rounded-[var(--radius-sm)] border border-border bg-surface object-cover shadow-sm"
                    />
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white">
                        <Play size={14} className="ml-0.5" fill="currentColor" />
                      </span>
                    </span>
                  </>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={`Slide ${i + 1}`}
                    className="h-28 w-auto rounded-[var(--radius-sm)] border border-border bg-surface object-cover shadow-sm"
                  />
                )}
                <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 text-[10px] font-medium text-white">
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-border bg-surface px-3 py-4 text-xs text-text-dim">
            <ImageIcon size={16} /> No slides ready yet.
          </div>
        )}

        {!open &&
          issues.warnings.map((w) => (
            <p key={w} className="flex items-start gap-1.5 text-xs text-text-muted">
              <AlertCircle size={13} className="mt-px shrink-0 text-gold" />
              {w}
            </p>
          ))}
      </div>

      {open && (
        <div className="border-t border-border p-3 sm:p-4 space-y-4">
          <div className="space-y-1.5">
            <Select
              label="Template (all image slides)"
              placeholder="Choose a template…"
              options={templates.map((t) => ({ value: t.id, label: `${t.name} (${t.shape})` }))}
              value={templateId}
              onChange={(e) => onTemplateChange(e.target.value)}
            />
            <p className="text-xs text-text-dim">
              Every image slide renders at {SHAPE_LABELS[shape]} — Instagram needs one aspect ratio across a
              carousel.
              {template?.shape === 'landscape' && ' Landscape templates are rendered portrait (4:5) for carousels.'}{' '}
              As-is images are centre-cropped to the same shape.
              {hasVideo &&
                ` Videos are posted as they are — MP4 or MOV, ${CAROUSEL_VIDEO_MIN_S}–${CAROUSEL_VIDEO_MAX_S} seconds, up to ${CAROUSEL_VIDEO_MAX_MB} MB, ideally the same shape.`}
            </p>
          </div>

          <ol className="space-y-3">
            {slides.map((slide, i) => {
              const st = status[slide.key] ?? {}
              const video = isVideoSlide(slide)
              const thumb = slide.rendered_url ?? (slide.as_is ? slide.photo_url : null)
              const videoSrc = video ? slide.photo_url : null
              const slideProblems = issues.slideErrors[i] ?? []
              // Status error (from the check) already covers the problems.
              const shownError = st.error ?? (slideProblems.length ? slideProblems.join(' ') : null)
              const videoAspect =
                slide.width && slide.height ? `${slide.width} / ${slide.height}` : undefined
              return (
                <li
                  key={slide.key}
                  className="rounded-[var(--radius-md)] border border-border bg-surface p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-muted">
                      Slide {i + 1}
                      {i === 0 && <span className="normal-case tracking-normal text-text-dim"> · hook</span>}
                      {i === slides.length - 1 && slides.length > 1 && (
                        <span className="normal-case tracking-normal text-text-dim"> · call to action</span>
                      )}
                    </p>
                    <div className="flex items-center gap-2">
                      <div
                        role="radiogroup"
                        aria-label={`Slide ${i + 1} media type`}
                        className="inline-flex rounded-[var(--radius-sm)] border border-border bg-surface-2 p-0.5"
                      >
                        {(['image', 'video'] as const).map((t) => {
                          const active = (slide.media_type ?? 'image') === t
                          return (
                            <button
                              key={t}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              disabled={st.busy || anyBusy}
                              onClick={() => setSlideMediaType(slide.key, t)}
                              className={cn(
                                'inline-flex items-center gap-1 rounded-[calc(var(--radius-sm)-2px)] px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50',
                                active ? 'bg-surface text-gold shadow-[var(--shadow-sm)]' : 'text-text-muted hover:text-text',
                              )}
                            >
                              {t === 'image' ? <ImageIcon size={12} /> : <Film size={12} />}
                              {t === 'image' ? 'Image' : 'Video'}
                            </button>
                          )
                        })}
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<ArrowUp size={14} />}
                          aria-label={`Move slide ${i + 1} up`}
                          title="Move up"
                          onClick={() => move(slide.key, -1)}
                          disabled={i === 0 || anyBusy}
                          className="px-2"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<ArrowDown size={14} />}
                          aria-label={`Move slide ${i + 1} down`}
                          title="Move down"
                          onClick={() => move(slide.key, 1)}
                          disabled={i === slides.length - 1 || anyBusy}
                          className="px-2"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 size={14} />}
                          aria-label={`Remove slide ${i + 1}`}
                          title="Remove slide"
                          onClick={() => remove(slide.key)}
                          disabled={slides.length <= 1 || anyBusy}
                          className="px-2 text-accent-warm hover:text-accent-warm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    {video ? (
                      <div
                        className={cn(
                          'relative shrink-0 self-start w-full max-w-[16rem] sm:w-44 overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface-2 flex items-center justify-center',
                          !videoAspect && (shape === 'square' ? 'aspect-square' : 'aspect-[4/5]'),
                        )}
                        style={videoAspect ? { aspectRatio: videoAspect } : undefined}
                      >
                        {videoSrc ? (
                          <video
                            key={videoSrc}
                            src={posterFrameSrc(videoSrc)}
                            muted
                            playsInline
                            controls
                            preload="metadata"
                            aria-label={`Slide ${i + 1} video preview`}
                            className={cn('h-full w-full object-cover bg-black', !slide.rendered_url && 'opacity-60')}
                          />
                        ) : (
                          <Film size={18} className="text-text-dim" />
                        )}
                        {st.busy && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <Loader2 size={18} className="animate-spin text-white" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        className={cn(
                          'relative shrink-0 self-start w-24 overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface-2 flex items-center justify-center',
                          shape === 'square' ? 'aspect-square' : 'aspect-[4/5]',
                        )}
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt={`Slide ${i + 1} preview`}
                            className={cn('h-full w-full object-cover', !slide.rendered_url && 'opacity-50')}
                          />
                        ) : (
                          <ImageIcon size={18} className="text-text-dim" />
                        )}
                        {st.busy && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <Loader2 size={18} className="animate-spin text-white" />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {video ? (
                          <>
                            {slide.rendered_url && <Badge variant="active">Video ready</Badge>}
                            {!slide.rendered_url && st.busy && <Badge variant="upcoming">Checking video…</Badge>}
                            {!slide.rendered_url && !st.busy && slide.photo_url && shownError && (
                              <Badge variant="draft">Needs a fix</Badge>
                            )}
                            {!slide.photo_url && <Badge variant="draft">No video yet</Badge>}
                            {(slide.duration_s || slide.width || slide.size_bytes) && (
                              <span className="text-[11px] text-text-dim tabular-nums">
                                {[
                                  slide.duration_s ? formatDuration(slide.duration_s) : null,
                                  slide.width && slide.height
                                    ? `${slide.width}×${slide.height} (${ratioLabel(slide.width / slide.height)})`
                                    : null,
                                  slide.size_bytes ? formatBytes(slide.size_bytes) : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            {slide.rendered_url && !st.dirty && <Badge variant="active">Rendered</Badge>}
                            {slide.rendered_url && st.dirty && <Badge variant="upcoming">Edited — re-render</Badge>}
                            {!slide.rendered_url && <Badge variant="draft">Not rendered</Badge>}
                          </>
                        )}
                      </div>

                      {video ? (
                        <>
                          <p className="flex items-start gap-1.5 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2 text-[11px] text-text-muted">
                            <Film size={13} className="mt-px shrink-0 text-gold" />
                            <span>
                              Videos are posted as-is — no text or brand overlay. MP4 or MOV,{' '}
                              {CAROUSEL_VIDEO_MIN_S}–{CAROUSEL_VIDEO_MAX_S} seconds, up to {CAROUSEL_VIDEO_MAX_MB} MB,
                              between 4:5 and 16:9.
                            </span>
                          </p>
                          <MediaPicker
                            label="Video"
                            value={slide.photo_url ?? ''}
                            onChange={(url) => onSlideVideo(slide.key, url)}
                            mediaType="video"
                            onMediaTypeChange={() => {}}
                            lockedToType="video"
                            accept={CAROUSEL_VIDEO_ACCEPT}
                            uploadHint={`MP4 / MOV — ${CAROUSEL_VIDEO_MIN_S}–${CAROUSEL_VIDEO_MAX_S} s, up to ${CAROUSEL_VIDEO_MAX_MB} MB`}
                            maxMB={CAROUSEL_VIDEO_MAX_MB}
                            bucket="gallery"
                            folder="marketing"
                          />
                        </>
                      ) : (
                        <>
                          {!slide.as_is && (
                            <>
                              {hasHeading && (
                                <Input
                                  id={`${slide.key}-heading`}
                                  label="Heading"
                                  value={slide.heading}
                                  onChange={(e) => updateSlide(slide.key, { heading: e.target.value })}
                                  hint={slide.heading.split(/\s+/).filter(Boolean).length > 8 ? 'Aim for 8 words or fewer.' : undefined}
                                />
                              )}
                              {hasSubtext && (
                                <Input
                                  id={`${slide.key}-subtext`}
                                  label="Subtext"
                                  value={slide.subtext}
                                  onChange={(e) => updateSlide(slide.key, { subtext: e.target.value })}
                                />
                              )}
                            </>
                          )}

                          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-text">Use image as-is</p>
                              <p className="text-[11px] text-text-dim">No template or text overlay on this slide.</p>
                            </div>
                            <ToggleSwitch
                              checked={slide.as_is}
                              onChange={(v) => updateSlide(slide.key, { as_is: v })}
                              disabled={st.busy}
                              label={`Use image as-is on slide ${i + 1}`}
                            />
                          </div>

                          {(slide.as_is || template) && (
                            <MediaPicker
                              label={slide.as_is || usesPhoto ? 'Image' : 'Image (optional)'}
                              value={slide.photo_url ?? ''}
                              onChange={(url) => onSlidePhoto(slide.key, url)}
                              mediaType="image"
                              onMediaTypeChange={() => {}}
                              lockedToType="image"
                              bucket="gallery"
                              folder="marketing"
                              hint={
                                slide.as_is
                                  ? 'Posted without overlay, centre-cropped to the carousel shape.'
                                  : 'Choosing an image renders this slide automatically.'
                              }
                            />
                          )}
                        </>
                      )}

                      {shownError && (
                        <p className="flex items-start gap-1.5 text-xs text-accent-warm">
                          <AlertCircle size={13} className="mt-px shrink-0" />
                          {shownError}
                        </p>
                      )}

                      <div className="flex justify-end">
                        {video ? (
                          slide.photo_url && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<RefreshCw size={13} />}
                              loading={st.busy}
                              onClick={() => {
                                setError(null)
                                void checkVideoSlide(slide.key)
                              }}
                              disabled={renderingAll !== null || saving}
                            >
                              Re-check video
                            </Button>
                          )
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<RefreshCw size={13} />}
                            loading={st.busy}
                            onClick={() => {
                              setError(null)
                              void renderOne(slide.key)
                            }}
                            disabled={renderingAll !== null || saving || (!slide.as_is && !template)}
                          >
                            {slide.rendered_url ? 'Re-render slide' : 'Render slide'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>

          {unrendered.length > 0 && renderedCount > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-text-dim">
              <AlertCircle size={13} className="mt-px shrink-0" />
              Slide{unrendered.length === 1 ? '' : 's'} {unrendered.join(', ')} {unrendered.length === 1 ? 'is' : 'are'}{' '}
              not ready and will be left out of the post.
            </p>
          )}
          {issues.warnings.map((w) => (
            <p key={w} className="flex items-start gap-1.5 text-xs text-text-muted">
              <AlertCircle size={13} className="mt-px shrink-0 text-gold" />
              {w}
            </p>
          ))}
          {error && <p className="text-sm text-accent-warm">{error}</p>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={13} />}
              onClick={addSlide}
              disabled={slides.length >= CAROUSEL_MAX_SLIDES || anyBusy}
            >
              Add slide ({slides.length}/{CAROUSEL_MAX_SLIDES})
            </Button>
            <Button
              size="sm"
              icon={<RefreshCw size={13} />}
              loading={renderingAll !== null}
              onClick={renderAll}
              disabled={anyBusy || !needsTemplate}
              title={!needsTemplate ? 'Every slide is a video — nothing to render.' : undefined}
            >
              {renderingAll
                ? `Rendering ${renderingAll.done}/${renderingAll.total}…`
                : (() => {
                    const n = slides.filter((s) => !isVideoSlide(s)).length
                    return n === 1 ? 'Render image slide' : `Render ${n} image slides`
                  })()}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Instagram reel: the video (+ optional cover) ────────────────────
// A reel is ONE video posted with the caption. The video is saved as
// publish_target.video_url (+ video_meta read in the browser) through the
// asset route; only "no link / not https / not MP4-MOV" is blocking — length,
// size, shape and codec advice are WARNINGS the admin may ignore. The optional
// cover is cropped to a 9:16 JPEG (orient route, shape 'story') and saved as
// publish_target.cover_url → Metricool's videoThumbnailUrl. Old reel drafts
// may still have an image graphic (graphic_url) — it is never posted.

type ReelCheck = 'idle' | 'checking' | 'ready' | 'error'

function ReelSection({
  asset,
  disabled,
  onChange,
}: {
  asset: Asset
  disabled: boolean
  onChange: (a: Asset) => void
}) {
  const savedUrl = reelVideoUrl(asset.publish_target)
  const savedCover = reelCoverUrl(asset.publish_target)
  const savedMeta = coerceReelVideoMeta(asset.publish_target?.video_meta)
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(savedUrl ?? '')
  const [meta, setMeta] = useState<ReelVideoMeta>(savedMeta)
  const [unreadable, setUnreadable] = useState(false)
  const [check, setCheck] = useState<ReelCheck>(savedUrl ? 'ready' : 'idle')
  const [problems, setProblems] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [coverInput, setCoverInput] = useState(savedCover ?? '')
  const [coverBusy, setCoverBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const coverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestUrl = useRef(url)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (coverTimer.current) clearTimeout(coverTimer.current)
    },
    [],
  )

  // Save through the asset route. The first save also strips old "Hook:" /
  // "Caption:" labels from the caption (what's posted is just the caption).
  async function save(fields: Record<string, unknown>) {
    const payload: Record<string, unknown> = { action: 'save', ...fields }
    const stripped = stripPostLabels(asset.body, { dropHook: true })
    if (stripped.hadScaffolding && stripped.caption) payload.body = stripped.caption
    const { data } = await apiClient.patch<{ asset: Asset }>(`/api/admin/marketing/assets/${asset.id}`, payload)
    onChange(data.asset)
    return data.asset
  }

  // Read the video in the browser, then save it unless a BLOCKING problem.
  async function checkAndSave(target: string, persist = true) {
    setCheck('checking')
    setError(null)
    setProblems([])
    const m = await readVideoMeta(target)
    if (latestUrl.current !== target) return // swapped while reading
    const facts: ReelVideoMeta = {
      duration_s: m.duration_s,
      width: m.width,
      height: m.height,
      size_bytes: m.size_bytes,
    }
    setMeta(facts)
    setUnreadable(m.duration_s == null && m.width == null)
    const blocking = reelVideoProblems({ url: target, mime: m.mime })
    if (blocking.length) {
      setProblems(blocking)
      setCheck('error')
      return
    }
    if (!persist) {
      setCheck('ready')
      return
    }
    try {
      await save({ video_url: target, video_meta: facts })
      if (latestUrl.current === target) setCheck('ready')
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not save the video.'))
      setCheck('error')
    }
  }

  function onVideo(next: string) {
    const trimmed = next.trim()
    setUrl(trimmed)
    latestUrl.current = trimmed
    setProblems([])
    setError(null)
    if (timer.current) clearTimeout(timer.current)
    if (!trimmed) {
      setMeta({ duration_s: null, width: null, height: null, size_bytes: null })
      setUnreadable(false)
      setCheck('idle')
      if (savedUrl) {
        save({ video_url: null }).catch((e) => setError(getApiErrorMessage(e, 'Could not remove the video.')))
      }
      return
    }
    if (!/^https?:\/\/\S+\.\S+/i.test(trimmed)) {
      setCheck('error')
      setProblems(reelVideoProblems({ url: trimmed }))
      return
    }
    setCheck('checking')
    timer.current = setTimeout(() => void checkAndSave(trimmed), 600)
  }

  // A saved video without stored facts (older save / page reload after an
  // unreadable check) is read once so the metadata + warnings show.
  const autoRead = useRef(false)
  useEffect(() => {
    if (autoRead.current || !savedUrl || !isEmptyReelMeta(savedMeta)) return
    autoRead.current = true
    void checkAndSave(savedUrl, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedUrl])

  // Cover: crop to a 9:16 JPEG (Instagram's cover spec) and save.
  async function setCover(src: string) {
    setCoverBusy(true)
    setError(null)
    try {
      const { data } = await apiClient.post<{ url: string }>('/api/admin/marketing/graphics/orient', {
        url: src,
        shape: 'story',
      })
      await save({ cover_url: data.url })
      setCoverInput(data.url)
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not use that image as the cover.'))
    } finally {
      setCoverBusy(false)
    }
  }

  function onCover(next: string) {
    const trimmed = next.trim()
    setCoverInput(trimmed)
    if (coverTimer.current) clearTimeout(coverTimer.current)
    if (!trimmed) {
      if (savedCover) {
        save({ cover_url: null }).catch((e) => setError(getApiErrorMessage(e, 'Could not remove the cover.')))
      }
      return
    }
    if (trimmed === savedCover || !/^https?:\/\/\S+\.\S+/i.test(trimmed)) return
    coverTimer.current = setTimeout(() => void setCover(trimmed), 600)
  }

  const current = url || null
  const shownMeta = current ? meta : savedMeta
  const metaLine = reelMetaLine(shownMeta, formatBytes)
  const warnings = current ? reelVideoWarnings({ url: current, ...shownMeta }, { unreadable }) : []
  const pendingDifferent = !!savedUrl && current !== savedUrl && check !== 'checking'
  const oldGraphic = !!asset.graphic_url

  const statusBadge =
    check === 'checking' ? (
      <Badge variant="upcoming">Checking…</Badge>
    ) : !current ? (
      <Badge variant="draft">No video yet</Badge>
    ) : check === 'error' || problems.length ? (
      <Badge variant="urgent">Needs a fix</Badge>
    ) : current === savedUrl ? (
      <Badge variant="active">Ready</Badge>
    ) : (
      <Badge variant="upcoming">Checking…</Badge>
    )

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <div className="sm:w-44 shrink-0 bg-surface flex items-center justify-center p-3">
          {savedUrl ? (
            <div className="relative h-40 aspect-[9/16] overflow-hidden rounded-[var(--radius-sm)] border border-border bg-black shadow-sm">
              {savedCover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={savedCover} alt="Reel cover" className="h-full w-full object-cover" />
              ) : (
                <video
                  src={posterFrameSrc(savedUrl)}
                  muted
                  playsInline
                  preload="metadata"
                  aria-label="Reel video thumbnail"
                  className="h-full w-full object-cover"
                />
              )}
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white">
                  <Play size={15} className="ml-0.5" fill="currentColor" />
                </span>
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-text-dim py-6">
              <Film size={22} />
              <span className="text-xs">No video</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 p-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-text font-medium flex items-center gap-1.5">
              <Film size={14} className="text-gold" /> Reel video
            </p>
            {statusBadge}
          </div>
          <p className="text-xs text-text-dim">
            {savedUrl
              ? `This video is posted as the reel, with the caption below${savedCover ? ' and your cover image' : ''}.`
              : 'A reel is a video — add an MP4 or MOV (vertical 9:16 is best). It can’t be approved until a video is set.'}
          </p>
          {metaLine && savedUrl && <p className="text-[11px] text-text-dim tabular-nums">{metaLine}</p>}
          {oldGraphic && (
            <p className="flex items-start gap-1.5 text-[11px] text-text-muted">
              <ImageIcon size={13} className="mt-px shrink-0 text-gold" />
              This draft has an older image graphic. Reels post the video only, so that image isn&rsquo;t used
              {savedCover ? '.' : ' — you can make it the cover in the editor.'}
            </p>
          )}
          {!open &&
            warnings.map((w) => (
              <p key={w} className="flex items-start gap-1.5 text-xs text-text-muted">
                <AlertCircle size={13} className="mt-px shrink-0 text-gold" />
                {w}
              </p>
            ))}
          <div>
            <Button
              size="sm"
              variant="secondary"
              icon={<Pencil size={13} />}
              onClick={() => setOpen((v) => !v)}
              disabled={disabled}
            >
              {open ? 'Close video editor' : savedUrl ? 'Change video' : 'Add video'}
            </Button>
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-border p-3 sm:p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative shrink-0 self-start w-full max-w-[12rem] aspect-[9/16] overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface flex items-center justify-center">
              {current && /^https?:\/\//i.test(current) ? (
                <video
                  key={current}
                  src={posterFrameSrc(current)}
                  muted
                  playsInline
                  controls
                  preload="metadata"
                  aria-label="Reel video preview"
                  className={cn('h-full w-full object-contain bg-black', check !== 'ready' && 'opacity-70')}
                />
              ) : (
                <Film size={20} className="text-text-dim" />
              )}
              {check === 'checking' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 size={18} className="animate-spin text-white" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {statusBadge}
                {metaLine && current && <span className="text-[11px] text-text-dim tabular-nums">{metaLine}</span>}
              </div>
              <p className="flex items-start gap-1.5 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-[11px] text-text-muted">
                <Film size={13} className="mt-px shrink-0 text-gold" />
                <span>
                  Instagram Reels: MP4 or MOV, H.264 video + AAC audio, vertical 9:16 (1080×1920), 3 seconds to
                  15 minutes, up to {REEL_VIDEO_MAX_MB} MB. HEVC and iPhone HDR videos can&rsquo;t be auto-published —
                  export as H.264 &ldquo;Most Compatible&rdquo;.
                </span>
              </p>
              <MediaPicker
                label="Video"
                value={url}
                onChange={onVideo}
                mediaType="video"
                onMediaTypeChange={() => {}}
                lockedToType="video"
                accept={REEL_VIDEO_ACCEPT}
                uploadHint={`MP4 / MOV — vertical 9:16, 3 s – 15 min, ideally under ${REEL_VIDEO_MAX_MB} MB`}
                bucket="gallery"
                folder="marketing"
                hint="Upload from your computer, pick a video from Google Drive, or paste a public link."
              />
              {problems.map((p) => (
                <p key={p} className="flex items-start gap-1.5 text-xs text-accent-warm">
                  <AlertCircle size={13} className="mt-px shrink-0" />
                  {p}
                </p>
              ))}
              {pendingDifferent && check === 'error' && (
                <p className="text-[11px] text-text-dim">The previously saved video is still the one that will be posted.</p>
              )}
              {warnings.map((w) => (
                <p key={w} className="flex items-start gap-1.5 text-xs text-text-muted">
                  <AlertCircle size={13} className="mt-px shrink-0 text-gold" />
                  {w}
                </p>
              ))}
              {warnings.length > 0 && check === 'ready' && (
                <p className="text-[11px] text-text-dim">
                  These are warnings only — the reel can still be approved.
                </p>
              )}
              {current && check !== 'checking' && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<RefreshCw size={13} />}
                    onClick={() => {
                      latestUrl.current = current
                      void checkAndSave(current)
                    }}
                  >
                    Re-check video
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[var(--radius-md)] border border-border bg-surface p-3 space-y-2">
            <p className="text-sm font-medium text-text">Cover image (optional)</p>
            <p className="text-xs text-text-dim">
              Shown on your profile grid and in the Reels feed. Leave empty to use the video&rsquo;s first frame. The
              image is centre-cropped to a 9:16 JPEG (1080×1920).
            </p>
            <div className={cn(coverBusy && 'pointer-events-none opacity-60')}>
              <MediaPicker
                label="Cover"
                value={coverInput}
                onChange={onCover}
                mediaType="image"
                onMediaTypeChange={() => {}}
                lockedToType="image"
                bucket="gallery"
                folder="marketing"
              />
            </div>
            {coverBusy && (
              <p className="flex items-center gap-1.5 text-xs text-text-dim">
                <Loader2 size={13} className="animate-spin" /> Preparing the cover…
              </p>
            )}
            {oldGraphic && !savedCover && !coverBusy && (
              <Button
                size="sm"
                variant="ghost"
                icon={<ImageIcon size={13} />}
                onClick={() => void setCover(asset.graphic_url as string)}
              >
                Use the old graphic as the cover
              </Button>
            )}
          </div>

          {error && <p className="text-sm text-accent-warm">{error}</p>}
        </div>
      )}
    </div>
  )
}
