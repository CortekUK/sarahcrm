// ── Finance task auto-escalation ──────────────────────────────────────
// Module 6 of Team Accountability. Hooked into runAllAutomations() (the
// hourly automations cron). On each run, with the SERVICE-ROLE client:
//
//   1. For every ACTIVE finance task, ensure the current period's occurrence
//      exists (and the immediately-previous period's, so a just-passed
//      deadline is tracked) — created with the computed due_date.
//   2. For every PENDING occurrence whose due_date has passed, escalate by
//      time overdue, emailing each level ONCE and bumping escalation_level:
//        • overdue ≥ 0d & level < 1 → accountant        → level 1
//        • overdue ≥ 3d & level < 2 → Finance Director  → level 2
//        • overdue ≥ 7d & level < 3 → Sarah (final)     → level 3
//      Completed occurrences are skipped.
//
// IDEMPOTENT: escalation_level IS the ledger. A level is emailed only when the
// stored level is below it, and the new level is persisted immediately after
// the sends — so the hourly cron can never email the same level twice. (A
// severely-overdue occurrence first seen at ≥7 days will fire all applicable
// levels in one run — the deadlines really have passed — then never re-fire.)

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { renderClubEmail, sendClubEmail } from '@/lib/email/club-email'
import type { FlowResult } from './run'
import {
  ESCALATION_DAYS,
  contactForLevel,
  currentPeriods,
  daysLate,
  formatDate,
  formatPeriodLabel,
  todayDate,
  type Cadence,
  type FinanceOccurrenceRow,
  type FinanceTaskRow,
} from '@/lib/finance-tasks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, 'public', any>

export function financeAdminClient(): Admin {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// One escalation email.
function escalationEmail(
  task: FinanceTaskRow,
  occ: Pick<FinanceOccurrenceRow, 'period_label' | 'due_date'>,
  level: 1 | 2 | 3,
  overdue: number,
): { to: string; subject: string; html: string; detail: string } | null {
  const contact = contactForLevel(task, level)
  if (!contact.email) return null
  const name = contact.name || contact.role
  const periodH = formatPeriodLabel(occ.period_label)
  const due = formatDate(occ.due_date)
  const late = overdue <= 0 ? 'due today' : `${overdue} day${overdue === 1 ? '' : 's'} overdue`

  const escalationNote =
    level === 1
      ? 'This is the first reminder that the deliverable below is now due.'
      : level === 2
        ? 'This finance deliverable is still outstanding and is now being escalated to you as Finance Director.'
        : 'This finance deliverable remains outstanding after earlier reminders and is now being escalated to you directly.'

  return {
    to: contact.email,
    subject: `Overdue finance task — ${task.title} (${periodH})`,
    detail: `L${level} ${contact.role} · ${task.title} · ${occ.period_label} · ${late}`,
    html: renderClubEmail({
      eyebrow: 'Finance',
      heading: `${task.title} is ${overdue <= 0 ? 'due' : 'overdue'}.`,
      paragraphs: [
        `Hello ${name},`,
        escalationNote,
        `<strong style="color:#B8975A;">${task.title}</strong> for <strong style="color:#B8975A;">${periodH}</strong> was due on <strong style="color:#B8975A;">${due}</strong> and is currently <strong style="color:#B8975A;">${late}</strong>.`,
        `Please complete it as soon as possible. Once it is done, the team will mark it complete and these reminders will stop.`,
      ],
    }),
  }
}

export async function financeEscalation(admin: Admin, dryRun: boolean): Promise<FlowResult> {
  const today = todayDate()
  const items: FlowResult['items'] = []
  let sent = 0
  let failed = 0
  let created = 0

  // 1. Active finance task definitions.
  const { data: taskData } = await admin.from('finance_tasks').select('*').eq('active', true)
  const tasks = (taskData ?? []) as FinanceTaskRow[]
  if (tasks.length === 0) {
    return {
      flow: 'finance_escalation',
      label: 'Finance task escalation',
      candidates: 0,
      alreadyHandled: 0,
      pending: 0,
      sent: 0,
      failed: 0,
      items: [],
    }
  }
  const taskById = new Map(tasks.map((t) => [t.id, t]))

  // 2. Ensure current + previous occurrences exist for each active task.
  for (const t of tasks) {
    const createdDate = (t.created_at ?? '').slice(0, 10)
    const periods = currentPeriods(t.cadence as Cadence, t.due_day, today)
    for (const p of periods) {
      if (dryRun) continue
      // Never back-date: skip any period whose due date is before the task was
      // created — a task added today starts chasing from today onward.
      if (createdDate && p.dueDate < createdDate) continue
      // Idempotent create — the unique (finance_task_id, period_label) index
      // makes a duplicate a no-op.
      const { error } = await admin
        .from('finance_task_occurrences')
        .upsert(
          { finance_task_id: t.id, period_label: p.label, due_date: p.dueDate },
          { onConflict: 'finance_task_id,period_label', ignoreDuplicates: true },
        )
      if (!error) created++
    }
  }

  // 3. Load PENDING occurrences for these tasks. In dry-run, also synthesize
  //    the current/previous occurrences that don't yet exist so the preview
  //    reflects what a real run would create + escalate.
  const taskIds = tasks.map((t) => t.id)
  const { data: occData } = await admin
    .from('finance_task_occurrences')
    .select('*')
    .in('finance_task_id', taskIds)
    .eq('status', 'pending')
  const occurrences = (occData ?? []) as FinanceOccurrenceRow[]

  if (dryRun) {
    const seen = new Set(occurrences.map((o) => `${o.finance_task_id}:${o.period_label}`))
    for (const t of tasks) {
      const createdDate = (t.created_at ?? '').slice(0, 10)
      for (const p of currentPeriods(t.cadence as Cadence, t.due_day, today)) {
        if (createdDate && p.dueDate < createdDate) continue
        const key = `${t.id}:${p.label}`
        if (seen.has(key)) continue
        seen.add(key)
        occurrences.push({
          id: `preview:${key}`,
          finance_task_id: t.id,
          period_label: p.label,
          due_date: p.dueDate,
          status: 'pending',
          completed_at: null,
          completed_by: null,
          escalation_level: 0,
          last_notified_at: null,
          created_at: today,
          updated_at: today,
        } as FinanceOccurrenceRow)
      }
    }
  }

  let candidates = 0
  let alreadyHandled = 0

  // 4. Escalate each overdue pending occurrence.
  for (const occ of occurrences) {
    const task = taskById.get(occ.finance_task_id)
    if (!task) continue
    const overdue = daysLate(occ.due_date, today)
    if (overdue < ESCALATION_DAYS.accountant) {
      // Not yet due — nothing to do.
      continue
    }
    candidates++

    let level = occ.escalation_level
    const toSend: { level: 1 | 2 | 3 }[] = []
    if (overdue >= ESCALATION_DAYS.accountant && level < 1) {
      toSend.push({ level: 1 })
      level = 1
    }
    if (overdue >= ESCALATION_DAYS.director && level < 2) {
      toSend.push({ level: 2 })
      level = 2
    }
    if (overdue >= ESCALATION_DAYS.final && level < 3) {
      toSend.push({ level: 3 })
      level = 3
    }

    if (toSend.length === 0) {
      alreadyHandled++
      continue
    }

    if (dryRun) {
      for (const s of toSend) {
        const email = escalationEmail(task, occ, s.level, overdue)
        items.push({
          ref_id: `${occ.id}:L${s.level}`,
          to: email?.to ?? '',
          detail:
            email?.detail ??
            `L${s.level} · ${task.title} · ${occ.period_label} — no contact email set`,
          status: email ? 'would_send' : 'skipped_no_email',
        })
      }
      continue
    }

    // Real run: send each queued level, then persist the new level once.
    let anySentThisOcc = false
    for (const s of toSend) {
      const email = escalationEmail(task, occ, s.level, overdue)
      if (!email) {
        items.push({
          ref_id: `${occ.id}:L${s.level}`,
          to: '',
          detail: `L${s.level} · ${task.title} · ${occ.period_label} — no contact email set`,
          status: 'skipped_no_email',
        })
        continue
      }
      const r = await sendClubEmail({
        to: email.to,
        subject: email.subject,
        html: email.html,
        category: 'automation:finance_escalation',
      })
      if (r.sent) sent++
      else failed++
      anySentThisOcc = anySentThisOcc || r.sent
      items.push({
        ref_id: `${occ.id}:L${s.level}`,
        to: email.to,
        detail: email.detail,
        status: r.sent ? 'sent' : 'failed',
        error: r.error,
      })
    }

    // Persist the advanced level regardless (a missing contact email still
    // "consumes" that level so we don't retry it forever); stamp last_notified.
    await admin
      .from('finance_task_occurrences')
      .update({
        escalation_level: level,
        last_notified_at: anySentThisOcc ? new Date().toISOString() : occ.last_notified_at,
      })
      .eq('id', occ.id)
  }

  return {
    flow: 'finance_escalation',
    label: 'Finance task escalation',
    candidates: candidates + (dryRun ? 0 : created),
    alreadyHandled,
    pending: dryRun ? items.length : sent + failed,
    sent,
    failed,
    items,
  }
}
