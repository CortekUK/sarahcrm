// Shared types + helpers for the Time Tracking module (admin + staff).
//
// A "project" is an existing Event. Time is logged against a staff member's
// OWN accountability task; a task may be linked to an event; time rolls up
// Event → tasks → entries. Profitability = manual event revenue − staff cost,
// cost = Σ(hours × that staff member's hourly rate). All monetary values here
// are in POUNDS (event revenue is entered in pounds; rates are £/hour).

import type { Database } from '@/types/database'

export type TimeEntryRow = Database['public']['Tables']['time_entries']['Row']
export type StaffRateRow = Database['public']['Tables']['staff_rates']['Row']
export type EventProfitabilityRow =
  Database['public']['Tables']['event_profitability']['Row']

// Format a decimal hours value like "2.5h" (trims trailing zeros).
export function formatHours(hours: number | null | undefined): string {
  const h = Number(hours ?? 0)
  const rounded = Math.round(h * 100) / 100
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : String(rounded)}h`
}

// GBP formatter for values already in POUNDS (unlike lib/utils formatCurrency
// which expects pence).
export function formatPounds(pounds: number | null | undefined): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(pounds ?? 0))
}

// Hours between two ISO timestamps, rounded to 2 dp. Never negative.
export function hoursBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.round((ms / 3_600_000) * 100) / 100
}

// A running timer is a source='timer' row with no ended_at yet.
export function isRunningTimer(e: TimeEntryRow): boolean {
  return e.source === 'timer' && !e.ended_at
}

// Live elapsed "HH:MM:SS" for a running timer, given a "now" tick.
export function elapsedClock(startIso: string, nowMs: number): string {
  const secs = Math.max(0, Math.floor((nowMs - new Date(startIso).getTime()) / 1000))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

// Sum only the completed (non-running) entries' hours.
export function sumHours(entries: TimeEntryRow[]): number {
  const total = entries.reduce((acc, e) => acc + Number(e.hours ?? 0), 0)
  return Math.round(total * 100) / 100
}
