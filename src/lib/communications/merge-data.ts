// Build the per-recipient merge-tag dictionary for the email send pipeline.
//
// This is the bridge between the database (members, profiles, events,
// introductions) and the {{tag}} tokens an email template contains. The same
// dictionary shape is consumed by `replaceMergeTags` in
// `lib/utils-templates/merge-tags-core.ts`.
//
// Keeping this in one place means the send pipeline, preview API, and any
// future automation runner all produce identical substitutions — a bug in the
// resolver shows up in one spot, not three.

import type { MergeTagData } from '@/lib/utils-templates/merge-tags-core'

export interface MemberRow {
  id: string
  membership_tier: string | null
  company_name: string | null
  profile: ProfileRow | null
}

export interface ProfileRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  job_title: string | null
  company_name: string | null
}

export interface EventRow {
  id: string
  title: string
  venue_name: string | null
  start_date: string
  end_date: string | null
}

export interface IntroductionRow {
  id: string
  member_a_id: string
  member_b_id: string
  match_reason: string | null
  // We hydrate the OTHER party (whichever member is not the recipient)
  other_member?: MemberRow | null
}

export interface SenderProfile {
  full_name: string
  title: string
  email: string
  phone: string
  booking_link: string
}

// The default sender used when the admin who initiated the send doesn't have
// a full profile filled in. Sarah is the public face of The Club, so falling
// back to her name keeps emails from looking unsigned.
export const DEFAULT_SENDER: SenderProfile = {
  full_name: 'Sarah Restrick',
  title: 'Founder, The Club',
  email: 'sarah@theclub.example.com',
  phone: '',
  booking_link: 'https://theclub.example.com/book',
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

function formatEventDate(iso: string): string {
  try {
    const d = new Date(iso)
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d)
  } catch {
    return iso
  }
}

function formatEventTime(iso: string): string {
  try {
    const d = new Date(iso)
    return new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d)
  } catch {
    return ''
  }
}

function fullName(p: ProfileRow | null | undefined): string {
  if (!p) return ''
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
}

/**
 * Resolve the merge-tag dictionary for a single recipient.
 *
 * Tags reflect the template builder's catalogue:
 *   Member:        first_name, last_name, email, phone, membership_tier, company_name
 *   Event:         event_name, event_date, event_time, venue_name, dress_code
 *   Introduction:  other_member_name, introduction_note
 *   Sender:        sender_name, sender_title, sender_email, sender_phone, booking_link
 *   Misc:          month_name, unsubscribe_url
 *
 * When a tag has no real value the entry is left UNSET (not empty string), so
 * `{{tag|fallback}}` syntax picks up the fallback as designed.
 */
export function buildMergeData(opts: {
  member: MemberRow
  event?: EventRow | null
  introduction?: IntroductionRow | null
  sender?: SenderProfile
  unsubscribeUrl?: string
}): MergeTagData {
  const { member, event, introduction, sender = DEFAULT_SENDER, unsubscribeUrl } = opts
  const profile = member.profile
  const data: MergeTagData = {}

  // Member
  if (profile?.first_name) data.first_name = profile.first_name
  if (profile?.last_name) data.last_name = profile.last_name
  if (profile?.email) data.email = profile.email
  if (profile?.phone) data.phone = profile.phone
  if (member.membership_tier) {
    // Tier values in the DB are 'tier_1' / 'tier_2' / 'tier_3' — present them
    // in a friendlier "Tier 1" form for the inbox.
    data.membership_tier = member.membership_tier.replace(/^tier_/, 'Tier ')
  }
  if (member.company_name || profile?.company_name) {
    data.company_name = member.company_name ?? profile?.company_name ?? ''
  }

  // Event
  if (event) {
    data.event_name = event.title
    if (event.start_date) {
      data.event_date = formatEventDate(event.start_date)
      data.event_time = formatEventTime(event.start_date)
    }
    if (event.venue_name) data.venue_name = event.venue_name
  }

  // Introduction — uses whichever member is NOT the recipient
  if (introduction?.other_member?.profile) {
    const otherName = fullName(introduction.other_member.profile)
    if (otherName) data.other_member_name = otherName
    if (introduction.match_reason) data.introduction_note = introduction.match_reason
  }

  // Sender
  data.sender_name = sender.full_name
  data.sender_title = sender.title
  data.sender_email = sender.email
  if (sender.phone) data.sender_phone = sender.phone
  data.booking_link = sender.booking_link

  // Misc
  data.month_name = MONTH_NAMES[new Date().getMonth()]
  data.unsubscribe_url = unsubscribeUrl ?? '#'

  return data
}
