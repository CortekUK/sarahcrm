'use client'

import { useEffect, useState } from 'react'
import { toast } from '@/lib/hooks/use-toast'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ActiveToggle } from '@/components/admin/ActiveToggle'
import { DEFAULT_SYNC_CONFIG, type GmailSyncConfig } from '@/lib/google/sync-config'

// Admin control surface for the Gmail sync. Reads/writes the config through
// /api/admin/google/gmail/config. Everything defaults OFF — no inbox is read
// while the master switch is off.
export function EmailSyncSettings() {
  const [config, setConfig] = useState<GmailSyncConfig>(DEFAULT_SYNC_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/admin/google/gmail/config')
        const json = (await res.json()) as { ok?: boolean; config?: GmailSyncConfig }
        if (json.config) setConfig(json.config)
      } catch {
        /* leave defaults on load failure */
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  function setInboxEnabled(email: string, enabled: boolean) {
    setConfig((prev) => ({
      ...prev,
      inboxes: prev.inboxes.map((i) => (i.email === email ? { ...i, enabled } : i)),
    }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const months = Math.min(120, Math.max(1, Math.round(config.historyMonths || 0) || 1))
      const res = await fetch('/api/admin/google/gmail/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, historyMonths: months }),
      })
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error || 'Save failed')
      setConfig((prev) => ({ ...prev, historyMonths: months }))
      toast({ title: 'Email sync settings saved' })
    } catch (err) {
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Email Sync</CardTitle>
        <p className="text-sm text-text-muted mt-1">
          Pull email history from the club inboxes into each contact&apos;s timeline. This stays
          off until you enable it, and no inbox is read while the master switch is off or its own
          toggle is off.
        </p>
      </CardHeader>
      <CardContent>
        {/* Master switch */}
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-border">
          <div>
            <p className="text-sm font-medium text-text">Enable email sync</p>
            <p className="text-xs text-text-dim mt-0.5">
              Master switch — when off, nothing is synced regardless of the inbox toggles below.
            </p>
          </div>
          <ActiveToggle
            active={config.enabled}
            activeLabel="On"
            inactiveLabel="Off"
            disabled={loading}
            onChange={(next) => setConfig((prev) => ({ ...prev, enabled: next }))}
          />
        </div>

        {/* Inbox checklist */}
        <div className="pt-4">
          <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-3">
            Inboxes to sync
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {config.inboxes.map((inbox) => (
              <div
                key={inbox.email}
                className="flex items-center justify-between gap-3 p-3 border border-border rounded-[var(--radius-md)] bg-surface"
              >
                <div className="min-w-0">
                  <p className="text-sm text-text">{inbox.label}</p>
                  <p className="text-xs text-text-dim truncate">{inbox.email}</p>
                </div>
                <ActiveToggle
                  active={inbox.enabled}
                  activeLabel="On"
                  inactiveLabel="Off"
                  disabled={loading}
                  onChange={(next) => setInboxEnabled(inbox.email, next)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* History window + noise filter */}
        <div className="mt-5 flex flex-col sm:flex-row sm:items-start gap-5">
          <div className="w-full sm:w-48">
            <Input
              label="Sync history (months)"
              type="number"
              min={1}
              max={120}
              value={config.historyMonths}
              disabled={loading}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, historyMonths: Number(e.target.value) }))
              }
            />
          </div>
          <div className="flex items-center justify-between gap-3 sm:pt-6">
            <span className="text-sm text-text">Noise filter</span>
            <ActiveToggle
              active={config.noiseFilter}
              activeLabel="On"
              inactiveLabel="Off"
              disabled={loading}
              onChange={(next) => setConfig((prev) => ({ ...prev, noiseFilter: next }))}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} loading={saving} disabled={loading}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
