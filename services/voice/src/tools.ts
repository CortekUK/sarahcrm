// The receptionist's tools. All of them only update the in-memory capture for
// this call — nothing is written to the CRM until the call ends (finalize.ts),
// so a dropped call can never leave half an enquiry behind and a caller can't
// trigger repeated writes by talking. `create_enquiry` therefore just flags
// that the caller wants their details passed on; the enquiry is filed once,
// after hang-up, with everything captured.
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import { normaliseE164, speakablePhone } from './phone.js'
import {
  CALL_TEAMS,
  ESCALATION_CATEGORIES,
  INTERESTS,
  type CallCapture,
  type CallTeam,
  type EscalationCategory,
  type Interest,
} from './types.js'

const nullableString = (description: string) => ({ type: ['string', 'null'], description })

export const TOOL_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'save_caller_details',
      description:
        "Record details the caller has given. Call it whenever you learn something new; send only the fields you learnt (others null). Never invent values. Phone: the caller ID is already known — only send a phone if they give a different number, and set phone_confirmed true once they confirm the number to call back on.",
      parameters: {
        type: 'object',
        properties: {
          first_name: nullableString('Caller first name'),
          last_name: nullableString('Caller surname'),
          phone: nullableString('A different callback number the caller gave (any format)'),
          phone_confirmed: { type: ['boolean', 'null'], description: 'True once the caller confirms the callback number' },
          email: nullableString('Email address, spelled back and confirmed'),
          company: nullableString('Company / organisation'),
          role: nullableString('Their role or job title'),
          interest: { type: ['string', 'null'], enum: [...INTERESTS, null], description: 'What they are calling about' },
          turnover_band: nullableString("Approximate annual company turnover in the caller's words, e.g. '£1–5m'"),
          notes: nullableString('The message / what they want, in one or two sentences'),
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_callback',
      description:
        'The caller wants a call back from the team or Sarah. Capture when suits them. This does NOT book anything — the team will confirm a time personally.',
      parameters: {
        type: 'object',
        properties: {
          preferred_time_text: nullableString("When suits them, in their words, e.g. 'Thursday afternoon after 2'"),
          preferred_time_iso: nullableString(
            'ISO 8601 date-time with UK offset ONLY when the caller gave a specific day and time (e.g. 2026-10-30T14:00:00+00:00); otherwise null',
          ),
          team: { type: 'string', enum: [...CALL_TEAMS], description: "sales = membership/general/sponsorship/concierge; events = events/private events/venue; sarah ONLY if they asked for Sarah by name" },
          reason: nullableString('What the call is about'),
        },
        required: ['team'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_enquiry',
      description:
        "The caller would like their enquiry passed to the team (membership, an event, sponsorship, concierge…). Call once you have at least their name and what they're after. It is filed for the team after the call.",
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'One or two sentences: what they want' },
        },
        required: ['summary'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_escalation',
      description:
        'Flag the call for a team member: complaints, payments or billing, cancellations, press/media, legal, safeguarding, anything sensitive or that you cannot help with.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: [...ESCALATION_CATEGORIES] },
          reason: { type: 'string', description: 'Short neutral description of the issue' },
        },
        required: ['category', 'reason'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'end_call',
      description:
        'Hang up after you have said a warm goodbye in this same reply. Use when the caller has finished, says goodbye, or the call cannot usefully continue.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: "e.g. 'caller finished', 'caller said goodbye'" },
        },
        required: ['reason'],
        additionalProperties: false,
      },
    },
  },
]

export type ToolName = 'save_caller_details' | 'request_callback' | 'create_enquiry' | 'mark_escalation' | 'end_call'

export interface ToolContext {
  now: Date
  callerId: string | null // E.164 from Twilio
}

export interface ToolOutcome {
  /** JSON string returned to the model as the tool result. */
  result: string
  /** Short line for the admin transcript ("Details saved: name, company"). */
  event: string
  /** The model asked to hang up. */
  end: boolean
}

const MAX_FIELD = 300

function str(v: unknown, max = MAX_FIELD): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}

function isEmail(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)
}

function oneOf<T extends string>(list: readonly T[], v: unknown): T | null {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null
}

/** Accept a model-produced ISO time only when it parses, is in the future and within 90 days. */
export function parsePreferredIso(v: unknown, now: Date): string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const t = Date.parse(v)
  if (!Number.isFinite(t)) return null
  if (t <= now.getTime() || t > now.getTime() + 90 * 24 * 3600 * 1000) return null
  return new Date(t).toISOString()
}

function parseArgs(raw: string): Record<string, unknown> | null {
  try {
    const v = raw.trim() ? JSON.parse(raw) : {}
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * Apply one tool call to the capture (mutates it). Never throws: bad JSON or
 * an unknown tool returns an error result the model can recover from.
 */
export function applyToolCall(capture: CallCapture, name: string, rawArgs: string, ctx: ToolContext): ToolOutcome {
  const args = parseArgs(rawArgs)
  if (!args) {
    return { result: JSON.stringify({ ok: false, error: 'Arguments were not valid JSON.' }), event: `${name}: invalid arguments`, end: false }
  }

  switch (name as ToolName) {
    case 'save_caller_details': {
      const saved: string[] = []
      const set = <K extends keyof CallCapture>(key: K, value: CallCapture[K] | null, label: string) => {
        if (value === null || value === undefined) return
        capture[key] = value as CallCapture[K]
        saved.push(label)
      }
      set('firstName', str(args.first_name, 80), 'first name')
      set('lastName', str(args.last_name, 80), 'surname')
      set('company', str(args.company, 160), 'company')
      set('role', str(args.role, 120), 'role')
      set('turnoverBand', str(args.turnover_band, 80), 'turnover')
      set('notes', str(args.notes, 1000), 'message')
      const interest = oneOf<Interest>(INTERESTS, args.interest)
      set('interest', interest, 'interest')

      const warnings: string[] = []
      const email = str(args.email, 200)
      if (email) {
        const clean = email.replace(/\s+/g, '').toLowerCase()
        if (isEmail(clean)) set('email', clean, 'email')
        else warnings.push('That email address does not look complete — please check it with the caller.')
      }
      const phoneRaw = str(args.phone, 40)
      if (phoneRaw) {
        const e164 = normaliseE164(phoneRaw)
        if (e164) {
          capture.phone = e164
          capture.phoneConfirmed = false
          saved.push('phone')
        } else warnings.push('That phone number does not look complete — please check it with the caller.')
      }
      if (args.phone_confirmed === true) {
        capture.phone = capture.phone ?? ctx.callerId
        capture.phoneConfirmed = !!capture.phone
        if (capture.phone) saved.push('phone confirmed')
      }

      return {
        result: JSON.stringify({
          ok: true,
          saved,
          warnings,
          callback_number: speakablePhone(capture.phone ?? ctx.callerId),
          callback_number_confirmed: capture.phoneConfirmed,
        }),
        event: saved.length ? `Details saved: ${saved.join(', ')}` : 'Details: nothing new',
        end: false,
      }
    }

    case 'request_callback': {
      const team = oneOf<CallTeam>(CALL_TEAMS, args.team) ?? 'sales'
      const preferredText = str(args.preferred_time_text, 200)
      const preferredAt = parsePreferredIso(args.preferred_time_iso, ctx.now)
      capture.callback = {
        requestedAt: capture.callback?.requestedAt ?? ctx.now.toISOString(),
        preferredText: preferredText ?? capture.callback?.preferredText ?? null,
        preferredAt: preferredAt ?? capture.callback?.preferredAt ?? null,
        team,
        reason: str(args.reason, 300) ?? capture.callback?.reason ?? null,
      }
      return {
        result: JSON.stringify({
          ok: true,
          note: 'Call-back request noted. Nothing is booked: tell the caller the team will call to confirm a time. Never promise a specific slot.',
          has_name: !!capture.firstName,
          callback_number: speakablePhone(capture.phone ?? ctx.callerId),
          callback_number_confirmed: capture.phoneConfirmed,
        }),
        event: `Call back requested (${team})${preferredText ? `: ${preferredText}` : ''}`,
        end: false,
      }
    }

    case 'create_enquiry': {
      const summary = str(args.summary, 1000)
      capture.enquiryRequested = true
      if (summary && !capture.notes) capture.notes = summary
      const missing = [!capture.firstName && 'name', !capture.interest && 'what they are interested in'].filter(Boolean)
      return {
        result: JSON.stringify({
          ok: true,
          note: 'The enquiry will be passed to the team when the call ends.',
          missing,
        }),
        event: 'Enquiry requested',
        end: false,
      }
    }

    case 'mark_escalation': {
      const category = oneOf<EscalationCategory>(ESCALATION_CATEGORIES, args.category) ?? 'other'
      const reason = str(args.reason, 500) ?? 'Needs a team member'
      capture.escalation = { category, reason }
      return {
        result: JSON.stringify({
          ok: true,
          note: 'Flagged for a team member. Reassure the caller someone will call them back; do not try to resolve it yourself. Make sure you have their name and callback number.',
        }),
        event: `Escalated (${category}): ${reason}`,
        end: false,
      }
    }

    case 'end_call': {
      capture.endRequested = { reason: str(args.reason, 200) ?? 'caller finished' }
      return { result: JSON.stringify({ ok: true }), event: 'Call ended by the assistant', end: true }
    }

    default:
      return { result: JSON.stringify({ ok: false, error: `Unknown tool ${name}` }), event: `Unknown tool ${name}`, end: false }
  }
}
