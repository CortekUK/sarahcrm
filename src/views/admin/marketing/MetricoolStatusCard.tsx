'use client'

// Metricool connection status for the Marketing hub.
//
// On load it reads GET /api/admin/marketing/metricool/status (env only, no
// network call to Metricool). "Test connection" adds ?test=1, which makes the
// server call Metricool's READ-ONLY list-brands endpoint — nothing is posted.
//
// States:  Not connected  → credentials missing; social approvals use the mock.
//          Configured      → credentials set, not tested yet this visit.
//          Connected       → test passed (· Draft mode / · LIVE).
//          Connection failed → test failed; Metricool's message is shown.

import { useCallback, useEffect, useState } from 'react'
import { Share2, PlugZap } from 'lucide-react'
import { Badge, Button, Card } from '@/components/ui'
import { apiClient, getApiErrorMessage } from '@/lib/http'

interface MetricoolStatus {
  configured: boolean
  mode: 'draft' | 'live'
  timezone: string
  brands?: { blogId: string; name: string }[]
  brandFound?: boolean
  error?: string
}

export function MetricoolStatusCard() {
  const [status, setStatus] = useState<MetricoolStatus | null>(null)
  const [tested, setTested] = useState(false)
  const [testing, setTesting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async (test: boolean) => {
    if (test) setTesting(true)
    setLoadError(null)
    try {
      const { data } = await apiClient.get<MetricoolStatus>(
        '/api/admin/marketing/metricool/status',
        { params: test ? { test: '1' } : undefined },
      )
      setStatus(data)
      if (test) setTested(true)
    } catch (e) {
      const message = getApiErrorMessage(e, 'Could not load the Metricool status.')
      if (test) {
        // Keep the last known config; show the failure as a failed test.
        setStatus((prev) => (prev ? { ...prev, brands: undefined, brandFound: undefined, error: message } : prev))
        setTested(true)
      }
      setLoadError(message)
    } finally {
      if (test) setTesting(false)
    }
  }, [])

  useEffect(() => {
    load(false)
  }, [load])

  const live = status?.mode === 'live'
  const modeLabel = live ? 'LIVE' : 'Draft mode'

  let badge: { variant: 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'; label: string }
  let detail: string
  if (!status) {
    badge = { variant: 'draft', label: loadError ? 'Unknown' : 'Checking…' }
    detail = loadError ?? 'Checking the Metricool connection…'
  } else if (!status.configured) {
    badge = { variant: 'draft', label: 'Not connected' }
    detail =
      'Metricool credentials are not set, so approved social posts are only marked as published here — nothing is posted.'
  } else if (tested && status.error) {
    badge = { variant: 'urgent', label: 'Connection failed' }
    detail = status.error
  } else if (tested) {
    badge = { variant: live ? 'urgent' : 'active', label: `Connected · ${modeLabel}` }
    detail = status.brandFound === false
      ? 'Connected, but the configured brand (METRICOOL_BLOG_ID) is not in this account’s brand list — check the blogId.'
      : live
        ? 'Approved LinkedIn, Instagram, Facebook and TikTok posts are scheduled in Metricool and WILL publish to the real accounts (TikTok photo posts may still need a final tap in the TikTok app).'
        : 'Approved LinkedIn, Instagram, Facebook and TikTok posts are saved as drafts in Metricool’s planner — nothing publishes until someone approves it there.'
  } else {
    badge = { variant: live ? 'urgent' : 'upcoming', label: `Configured · ${modeLabel}` }
    detail = 'Credentials are set. Run a read-only connection test to confirm they work.'
  }

  const brandName =
    tested && status?.brands?.length
      ? status.brands.map((b) => b.name).join(', ')
      : null

  return (
    <Card className="mb-6 px-6 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center shrink-0">
          <Share2 size={17} className="text-gold" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-text leading-tight">Metricool</p>
            <Badge variant={badge.variant} dot>
              {badge.label}
            </Badge>
          </div>
          <p className="text-xs text-text-dim mt-1">{detail}</p>
          {brandName && (
            <p className="text-xs text-text-dim mt-0.5">
              Brands visible: {brandName} · Timezone: {status?.timezone}
            </p>
          )}
        </div>
        {status?.configured && (
          <Button
            size="sm"
            variant="secondary"
            icon={<PlugZap size={14} />}
            loading={testing}
            onClick={() => load(true)}
          >
            Test connection
          </Button>
        )}
      </div>
    </Card>
  )
}
