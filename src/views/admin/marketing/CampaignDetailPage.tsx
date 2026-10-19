'use client'

import { useCallback, useEffect, useState } from 'react'
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
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { Button, Badge, Card, Textarea, Input, Select, Modal } from '@/components/ui'
import { MediaPicker } from '@/components/ui/MediaPicker'
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
  MarketingTemplate,
  TemplateSlot,
  SlotValues,
} from '@/lib/marketing/graphics/types'

const SOCIAL_GRAPHIC_CHANNELS = new Set([
  'instagram_feed',
  'instagram_carousel',
  'instagram_reel',
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
  email_template_id: string | null
  template_id: string | null
  graphic_url: string | null
  slot_values: SlotValues | null
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
function metricoolInfo(asset: Asset): { mode: 'draft' | 'live'; when: string | null } | null {
  const t = asset.publish_target
  if (!t || t.platform !== 'metricool') return null
  if (asset.status !== 'approved' && asset.status !== 'published') return null
  const pd = t.publicationDate as { dateTime?: unknown; timezone?: unknown } | undefined
  const when =
    pd && typeof pd.dateTime === 'string'
      ? `${pd.dateTime.replace('T', ' ').slice(0, 16)}${typeof pd.timezone === 'string' ? ` (${pd.timezone})` : ''}`
      : null
  return { mode: t.mode === 'live' ? 'live' : 'draft', when }
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
}: {
  asset: Asset
  campaignId: string
  onChange: (a: Asset) => void
  templates: MarketingTemplate[]
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(asset.title ?? '')
  const [body, setBody] = useState(asset.body ?? '')
  const [busy, setBusy] = useState<null | 'save' | 'approve' | 'reject' | 'regenerate' | 'resend' | 'unpublish'>(null)
  const [resendOpen, setResendOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
  const isNewsletter = asset.channel === 'newsletter'
  const editorHref = asset.email_template_id
    ? `/dashboard/communications/templates/editor?id=${asset.email_template_id}`
    : null

  async function patch(action: 'save' | 'approve' | 'reject' | 'in_review') {
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
      const { data } = await apiClient.patch<{ asset: Asset }>(
        `/api/admin/marketing/assets/${asset.id}`,
        { action: 'resend' },
      )
      onChange(data.asset)
      setResendOpen(false)
      toast({
        title: 'Ready to send again',
        description: 'Review the post, then click Approve & publish to send it to Metricool.',
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
          <Badge variant={metricool.mode === 'draft' ? 'upcoming' : 'active'}>
            {metricool.mode === 'draft' ? 'Metricool draft' : 'Sent to Metricool'}
          </Badge>
        ) : website?.live ? (
          <Badge variant="active">Live on website</Badge>
        ) : (
          <Badge variant={STATUS_VARIANT[asset.status]}>{asset.status.replace('_', ' ')}</Badge>
        )}
      </div>

      <div className="px-6 py-4 space-y-3">
        {SOCIAL_GRAPHIC_CHANNELS.has(asset.channel) && (
          <GraphicSection
            asset={asset}
            templates={templates}
            disabled={published}
            onChange={onChange}
          />
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
            {metricool.mode === 'draft'
              ? `Sent to Metricool as a draft${metricool.when ? ` for ${metricool.when}` : ''} — not published yet. Approve it in Metricool’s planner to publish.`
              : `Sent to Metricool — scheduled to publish${metricool.when ? ` at ${metricool.when}` : ''}.`}
          </p>
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
              disabled={published}
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
          This will send the post to Metricool again. If the previous Metricool post/draft still
          exists, delete it in Metricool&rsquo;s planner first, or you&rsquo;ll get a duplicate.
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
    </Card>
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
        background_photo_url: tpl.background.type === 'photo' ? photoVal || null : null,
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
      const values: SlotValues = { as_is: true, as_is_url: photo }
      const res = await fetch(`/api/admin/marketing/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          graphic_url: photo,
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

          {usesPhoto && (
            <MediaPicker
              label="Image"
              value={photo}
              onChange={onPhotoChange}
              mediaType="image"
              onMediaTypeChange={() => {}}
              lockedToType="image"
              bucket="gallery"
              folder="marketing"
              hint="Pick from Google Drive, upload, or paste a URL. Choosing an image renders the graphic automatically; edit the text and click Re-render to update it."
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
