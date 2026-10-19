// Google Calendar — free/busy lookup + call booking for the AI Website Concierge.
//
// Same auth model as gmail.ts / drive.ts: the service account IMPERSONATES a
// Workspace user via domain-wide delegation (see ./client.ts `jwtFor`).
//
// ⚠ NOT LIVE. The calendar scopes below are NOT yet granted to the service
// account's DWD entry, and every caller is gated behind
// CONCIERGE_BOOKING_ENABLED (default off — see src/lib/concierge/call-booking.ts).
// With the flag off, nothing imports this module at runtime and Google is
// never called. createBooking() sends Google Calendar invitations (emails) to
// the attendee, which is another reason it must stay behind the flag.
//
// Scopes the Workspace admin must add to the DWD entry before turning it on:
//   https://www.googleapis.com/auth/calendar.freebusy  — freebusy.query
//   https://www.googleapis.com/auth/calendar.events    — events.insert (+ attendees, Meet)
//
// Calendar ids are Workspace USER emails (e.g. sales@…, sarah@…). The booking
// is created on that user's primary calendar while impersonating them, so the
// team member is the organiser and the visitor is the attendee.

import { randomUUID } from 'crypto'
import { google } from 'googleapis'
import type { calendar_v3 } from 'googleapis'
import { jwtFor, GoogleError } from './client'
import {
  computeFreeSlots,
  DEFAULT_BUSINESS_HOURS,
  type BusinessHours,
  type BusyInterval,
  type FreeSlot,
} from './calendar-slots'

export const CALENDAR_FREEBUSY = 'https://www.googleapis.com/auth/calendar.freebusy'
export const CALENDAR_EVENTS = 'https://www.googleapis.com/auth/calendar.events'

export type { FreeSlot, BusinessHours } from './calendar-slots'

function calendarClient(scopes: string[], subject?: string): calendar_v3.Calendar {
  return google.calendar({ version: 'v3', auth: jwtFor(scopes, subject) })
}

// Free slots of `durationMins` across `calendarIds` inside business hours
// (default Mon–Fri 10:00–17:00 Europe/London). One freeBusy.query call.
//
// A calendar freeBusy can't read (errors[] in the response — not shared, not in
// the domain, typo) is treated as UNAVAILABLE, never as free, so a
// misconfiguration can only hide slots, not offer a time that's actually busy.
export async function getFreeSlots(
  calendarIds: string[],
  range: { start: Date; end: Date },
  durationMins: number,
  opts?: {
    hours?: Partial<BusinessHours>
    stepMins?: number
    mode?: 'any' | 'all'
    subject?: string // Workspace user to run the query as (default: GOOGLE_WORKSPACE_SUBJECT)
  },
): Promise<FreeSlot[]> {
  const ids = [...new Set(calendarIds.map((c) => c.trim()).filter(Boolean))]
  if (ids.length === 0) return []
  if (!(range.end > range.start)) return []

  const timeZone = opts?.hours?.timeZone ?? DEFAULT_BUSINESS_HOURS.timeZone
  const cal = calendarClient([CALENDAR_FREEBUSY], opts?.subject)

  let data: calendar_v3.Schema$FreeBusyResponse
  try {
    const res = await cal.freebusy.query({
      requestBody: {
        timeMin: range.start.toISOString(),
        timeMax: range.end.toISOString(),
        timeZone,
        items: ids.map((id) => ({ id })),
      },
    })
    data = res.data
  } catch (e) {
    const status = (e as { code?: number }).code
    throw new GoogleError(
      `Calendar free/busy failed: ${e instanceof Error ? e.message : 'unknown error'}`,
      typeof status === 'number' ? status : 502,
    )
  }

  const busyByCalendar: Record<string, BusyInterval[]> = {}
  const unavailable: string[] = []
  for (const id of ids) {
    const entry = data.calendars?.[id]
    if (!entry || (entry.errors && entry.errors.length > 0)) {
      unavailable.push(id)
      continue
    }
    busyByCalendar[id] = (entry.busy ?? [])
      .filter((b): b is { start: string; end: string } => !!b.start && !!b.end)
      .map((b) => ({ start: b.start, end: b.end }))
  }

  return computeFreeSlots({
    busyByCalendar,
    calendarIds: ids,
    rangeStart: range.start,
    rangeEnd: range.end,
    durationMins,
    stepMins: opts?.stepMins,
    hours: opts?.hours,
    mode: opts?.mode,
    unavailable,
  })
}

export interface BookingResult {
  eventId: string
  htmlLink: string | null
  meetUrl: string | null
  start: string
  end: string
  calendarId: string
}

// Creates the call on `calendarId`'s primary calendar (impersonating that
// user), with the visitor as an attendee and — where the Workspace supports
// it — a Google Meet link. sendUpdates:'all' means Google emails the visitor
// the invitation; callers MUST only reach this after the visitor explicitly
// confirmed the slot. If Meet creation is rejected, retries once without it.
export async function createBooking(args: {
  calendarId: string
  start: string // ISO
  end: string // ISO
  summary: string
  description?: string
  attendee: { email: string; name?: string }
  timeZone?: string
  withMeet?: boolean
}): Promise<BookingResult> {
  const timeZone = args.timeZone ?? DEFAULT_BUSINESS_HOURS.timeZone
  const cal = calendarClient([CALENDAR_EVENTS], args.calendarId)

  const baseBody: calendar_v3.Schema$Event = {
    summary: args.summary.slice(0, 250),
    description: args.description?.slice(0, 4000),
    start: { dateTime: args.start, timeZone },
    end: { dateTime: args.end, timeZone },
    attendees: [{ email: args.attendee.email, displayName: args.attendee.name }],
    guestsCanInviteOthers: false,
    reminders: { useDefault: true },
  }

  async function insert(withMeet: boolean) {
    return cal.events.insert({
      calendarId: 'primary',
      sendUpdates: 'all',
      conferenceDataVersion: withMeet ? 1 : 0,
      requestBody: withMeet
        ? {
            ...baseBody,
            conferenceData: {
              createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
            },
          }
        : baseBody,
    })
  }

  let event: calendar_v3.Schema$Event
  try {
    event = (await insert(args.withMeet !== false)).data
  } catch (e) {
    if (args.withMeet === false) {
      throw new GoogleError(`Calendar booking failed: ${e instanceof Error ? e.message : 'unknown error'}`, 502)
    }
    console.warn('[google/calendar] insert with Meet failed, retrying without:', e)
    try {
      event = (await insert(false)).data
    } catch (e2) {
      throw new GoogleError(`Calendar booking failed: ${e2 instanceof Error ? e2.message : 'unknown error'}`, 502)
    }
  }

  if (!event.id) throw new GoogleError('Calendar booking returned no event id.', 502)
  const meetUrl =
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ??
    null

  return {
    eventId: event.id,
    htmlLink: event.htmlLink ?? null,
    meetUrl,
    start: event.start?.dateTime ?? args.start,
    end: event.end?.dateTime ?? args.end,
    calendarId: args.calendarId,
  }
}
