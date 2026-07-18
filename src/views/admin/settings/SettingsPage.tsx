'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/hooks/use-toast'
import { planForSlug } from '@/lib/membership/plans'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { Avatar } from '@/components/ui/Avatar'
import { Building2, CreditCard, Landmark, Mail, SlidersHorizontal, UserPlus } from 'lucide-react'
import { TagsManager } from './TagsManager'
import { AutomationTimeSettings } from './AutomationTimeSettings'
import { EnquiryRoutingSettings } from './EnquiryRoutingSettings'

// A row in the read-only "Membership plans" summary table. Sourced live
// from the `membership_plans` table (the single source of truth) — editing
// happens on the Website → Membership plans page, not here.
interface PlanRow {
  id: string
  name: string
  type: string
  price: string
  intros: string
  active: boolean
}

function gbp(pence: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: pence % 100 === 0 ? 0 : 2,
  }).format(pence / 100)
}

// Static metadata for each integration card. Connection status is fetched
// live from /api/admin/integrations/status (real env presence), not hardcoded.
type IntegrationKey = 'stripe' | 'gocardless' | 'xero' | 'resend'

const INTEGRATIONS: {
  key: IntegrationKey
  name: string
  description: string
  icon: typeof CreditCard
}[] = [
  {
    key: 'stripe',
    name: 'Stripe',
    description: 'Payment processing for event tickets and one-off charges',
    icon: CreditCard,
  },
  {
    key: 'gocardless',
    name: 'GoCardless',
    description: 'Direct debit collection for recurring membership fees',
    icon: Landmark,
  },
  {
    key: 'xero',
    name: 'Xero',
    description: 'Accounting sync for invoices, payments, and reconciliation',
    icon: Building2,
  },
  {
    key: 'resend',
    name: 'Resend',
    description: 'Transactional email delivery for introductions and communications',
    icon: Mail,
  },
]

type IntegrationState = Record<IntegrationKey, { connected: boolean; detail: string | null }>

const TEAM = [
  { name: 'Sarah Restrick', email: 'admin@sarahrestrick.com', role: 'Admin', initials: 'SR' },
  { name: 'Leanne', email: 'leanne@sarahrestrick.com', role: 'Admin', initials: 'L' },
]

export function SettingsPage() {
  const [clubName, setClubName] = useState('The Club by Sarah Restrick')
  const [contactEmail, setContactEmail] = useState('hello@sarahrestrick.com')
  const [phone, setPhone] = useState('+44 20 7946 0958')
  const [website, setWebsite] = useState('https://sarahrestrick.com')
  const [description, setDescription] = useState(
    'An exclusive private members network connecting ambitious founders, investors, and senior professionals across London. Curated introductions, intimate events, and a shared commitment to meaningful business relationships.'
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [integrations, setIntegrations] = useState<IntegrationState | null>(null)
  const [xeroDisconnecting, setXeroDisconnecting] = useState(false)
  const [xeroSyncing, setXeroSyncing] = useState(false)
  const [xeroInvoiceSyncing, setXeroInvoiceSyncing] = useState(false)
  const [xeroSpendSyncing, setXeroSpendSyncing] = useState(false)

  // Real integration connection status — reflects whether each provider's
  // credentials are actually configured in this environment.
  const refreshIntegrations = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/integrations/status')
      if (!res.ok) return
      const json = (await res.json()) as IntegrationState
      setIntegrations(json)
    } catch {
      /* leave null → cards show "Checking…" then nothing actionable */
    }
  }, [])

  useEffect(() => {
    void refreshIntegrations()
  }, [refreshIntegrations])

  // Reflect the outcome of the Xero OAuth redirect (?xero=connected|error|forbidden).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const outcome = params.get('xero')
    if (!outcome) return
    if (outcome === 'connected') {
      toast({ title: 'Xero connected', description: 'Accounting integration is now active.' })
    } else if (outcome === 'forbidden') {
      toast({ title: 'Admin only', description: 'You must be an admin to connect Xero.', variant: 'destructive' })
    } else if (outcome === 'error') {
      const reason = params.get('reason')
      toast({
        title: 'Xero connection failed',
        description: reason ? `Reason: ${reason}` : 'Please try connecting again.',
        variant: 'destructive',
      })
    }
    // Clean the query string so the toast doesn't re-fire on refresh.
    const clean = window.location.pathname
    window.history.replaceState(null, '', clean)
  }, [])

  async function handleXeroDisconnect() {
    setXeroDisconnecting(true)
    try {
      const res = await fetch('/api/admin/xero/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error('disconnect failed')
      await refreshIntegrations()
      toast({ title: 'Xero disconnected' })
    } catch {
      toast({ title: 'Could not disconnect Xero', variant: 'destructive' })
    } finally {
      setXeroDisconnecting(false)
    }
  }

  async function handleXeroSync() {
    setXeroSyncing(true)
    try {
      const res = await fetch('/api/admin/xero/sync-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const json = (await res.json()) as {
        ok: boolean
        created?: number
        matched?: number
        failed?: number
        error?: string
      }
      if (!res.ok || !json.ok) throw new Error(json.error || 'Sync failed')
      const parts = [`${json.created ?? 0} created`, `${json.matched ?? 0} matched`]
      if (json.failed) parts.push(`${json.failed} failed`)
      toast({ title: 'Contacts synced', description: `Synced: ${parts.join(', ')}` })
    } catch (err) {
      toast({
        title: 'Xero sync failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setXeroSyncing(false)
    }
  }

  async function handleXeroInvoiceSync() {
    setXeroInvoiceSyncing(true)
    try {
      const res = await fetch('/api/admin/xero/sync-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      type StreamCounts = { created?: number; failed?: number }
      const json = (await res.json()) as {
        ok: boolean
        payments?: StreamCounts
        guestPayments?: StreamCounts
        sponsorships?: StreamCounts
        concierge?: StreamCounts
        introCommissions?: StreamCounts
        referralPayouts?: StreamCounts
        error?: string
      }
      if (!res.ok || !json.ok) throw new Error(json.error || 'Sync failed')

      const streams: [string, StreamCounts | undefined][] = [
        ['invoices', json.payments],
        ['guest', json.guestPayments],
        ['sponsorships', json.sponsorships],
        ['concierge', json.concierge],
        ['intro commissions', json.introCommissions],
        ['referrals', json.referralPayouts],
      ]
      const created = streams
        .filter(([, s]) => (s?.created ?? 0) > 0)
        .map(([label, s]) => `${label} ${s?.created}`)
      const totalFailed = streams.reduce((sum, [, s]) => sum + (s?.failed ?? 0), 0)

      const summary = created.length ? created.join(', ') : 'nothing new to sync'
      const description = totalFailed
        ? `Synced — ${summary} (${totalFailed} failed)`
        : `Synced — ${summary}`
      toast({ title: 'Revenue synced', description })
    } catch (err) {
      toast({
        title: 'Xero invoice sync failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setXeroInvoiceSyncing(false)
    }
  }

  async function handleXeroSpendSync() {
    setXeroSpendSyncing(true)
    try {
      const res = await fetch('/api/admin/xero/sync-spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const json = (await res.json()) as {
        ok: boolean
        membersUpdated?: number
        invoicesScanned?: number
        contactsWithSpend?: number
        error?: string
      }
      if (!res.ok || !json.ok) throw new Error(json.error || 'Sync failed')
      toast({
        title: 'Spend synced',
        description: `Synced spend for ${json.membersUpdated ?? 0} member${
          json.membersUpdated === 1 ? '' : 's'
        }`,
      })
    } catch (err) {
      toast({
        title: 'Xero spend sync failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setXeroSpendSyncing(false)
    }
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase
        .from('membership_plans')
        .select('id, name, slug, monthly_price_pence, intro_quota, is_active')
        .order('display_order', { ascending: true })
      if (!active) return
      setPlans(
        (data ?? []).map((p) => {
          const def = planForSlug(p.slug)
          const quota =
            typeof p.intro_quota === 'number'
              ? p.intro_quota < 0
                ? 'Unlimited'
                : String(p.intro_quota)
              : '—'
          return {
            id: p.id,
            name: p.name,
            type: def ? def.membershipType[0].toUpperCase() + def.membershipType.slice(1) : '—',
            price: gbp(p.monthly_price_pence),
            intros: quota,
            active: p.is_active,
          }
        }),
      )
      setPlansLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  function handleSave() {
    setSaving(true)
    setSaved(false)
    setTimeout(() => {
      setSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }, 600)
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
          Settings
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Manage your club details, membership tiers, integrations, and team.
        </p>
      </div>

      {/* Club Details */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Club Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Input
              label="Club Name"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
            />
            <Input
              label="Contact Email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
            <Input
              label="Phone Number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label="Website URL"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>
          <div className="mt-5">
            <Textarea
              label="Club Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Button onClick={handleSave} loading={saving}>
              Save Changes
            </Button>
            {saved && (
              <span className="text-sm text-accent">Changes saved</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Membership Plans — read-only summary of the live plans. Each plan
          IS a tier; edit them on Website → Membership plans. */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Membership Plans</CardTitle>
          <Link href="/dashboard/website/memberships">
            <Button size="sm" variant="secondary" icon={<SlidersHorizontal size={14} />}>
              Manage plans
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Monthly Price</TableHead>
                <TableHead>Monthly Intros</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plansLoading ? (
                <TableRow>
                  <TableCell className="text-sm text-text-muted">Loading plans…</TableCell>
                </TableRow>
              ) : plans.length === 0 ? (
                <TableRow>
                  <TableCell className="text-sm text-text-muted">
                    No plans yet — add them on Website → Membership plans.
                  </TableCell>
                </TableRow>
              ) : (
                plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <span className="font-medium text-text">{plan.name}</span>
                    </TableCell>
                    <TableCell>{plan.type}</TableCell>
                    <TableCell className="font-[family-name:var(--font-mono)] text-sm">
                      {plan.price}/mo
                    </TableCell>
                    <TableCell>{plan.intros}</TableCell>
                    <TableCell>
                      <Badge variant={plan.active ? 'active' : 'draft'} dot>
                        {plan.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <p className="px-6 py-3 text-xs text-text-dim border-t border-border">
            Each plan is a membership tier. Prices, intro quotas, and benefits are
            edited on Website → Membership plans.
          </p>
        </CardContent>
      </Card>

      {/* Tags */}
      <TagsManager />

      {/* Automation send time */}
      <AutomationTimeSettings />

      {/* Enquiry owner routing */}
      <EnquiryRoutingSettings />

      {/* Integrations — connection status is live (real env config), not mocked */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {INTEGRATIONS.map((integration) => {
              const checking = integrations === null
              const status = integrations?.[integration.key]
              const connected = status?.connected ?? false
              return (
                <div
                  key={integration.key}
                  className="flex items-start gap-4 p-4 border border-border rounded-[var(--radius-lg)] bg-surface"
                >
                  <div className="p-2.5 rounded-[var(--radius-md)] bg-surface-2 text-text-muted shrink-0">
                    <integration.icon size={20} strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-medium text-sm text-text">{integration.name}</p>
                      {checking ? (
                        <span className="text-[10px] uppercase tracking-[0.15em] text-text-dim">
                          Checking…
                        </span>
                      ) : connected ? (
                        <Badge variant="active" dot>Connected</Badge>
                      ) : (
                        <Badge variant="draft" dot>Not connected</Badge>
                      )}
                    </div>
                    <p className="text-xs text-text-dim leading-relaxed">{integration.description}</p>
                    {connected && status?.detail && (
                      <p className="text-[11px] text-text-muted mt-1">{status.detail}</p>
                    )}
                    {integration.key === 'xero' && !checking && (
                      <div className="mt-2.5 flex items-center gap-2">
                        {connected ? (
                          <>
                            <Button
                              size="sm"
                              loading={xeroSyncing}
                              onClick={handleXeroSync}
                            >
                              Sync contacts
                            </Button>
                            <Button
                              size="sm"
                              loading={xeroInvoiceSyncing}
                              onClick={handleXeroInvoiceSync}
                            >
                              Sync invoices
                            </Button>
                            <Button
                              size="sm"
                              loading={xeroSpendSyncing}
                              onClick={handleXeroSpendSync}
                            >
                              Sync spend
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={xeroDisconnecting}
                              onClick={handleXeroDisconnect}
                            >
                              Disconnect
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => {
                              window.location.href = '/api/admin/xero/connect'
                            }}
                          >
                            Connect
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-4 text-xs text-text-dim">
            Status reflects whether each provider’s credentials are configured in this
            environment.
          </p>
        </CardContent>
      </Card>

      {/* Team */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Team</CardTitle>
          <Button size="sm" variant="secondary" icon={<UserPlus size={14} />}>
            Add Member
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {TEAM.map((member) => (
              <div key={member.email} className="flex items-center gap-4 px-6 py-4">
                <Avatar name={member.name} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text">{member.name}</p>
                  <p className="text-xs text-text-dim">{member.email}</p>
                </div>
                <Badge variant="upcoming">{member.role}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
