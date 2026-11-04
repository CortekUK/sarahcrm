// CRM source tags for every website form (brief: "Forms and CRM capture").
//
// Plain constants — no 'use client' — so BOTH the public form components and
// the server intake route (/api/enquiries/intake) import the same list. The
// intake accepts exactly these strings as `source` (plus the legacy slugs the
// contact form / concierge chat / phone agent already send).
//
// Each tag carries:
//   inbox     — who is notified (the brief's "Notify" column). null = no email
//               (Newsletter) / 'admins' = the existing notify-all-admins path
//               (Testimonial → moderation queue).
//   intent    — the enquiries.intent value it files under (owner routing,
//               lead scoring and the admin filter keep working unchanged).
//   ackTitle / nextStep — the auto-acknowledgement copy.

export const FORM_SOURCES = [
  'Web – Membership',
  'Web – PITCH Founder',
  'Web – PITCH Investor',
  'Web – PITCH Sponsor',
  'Web – Event Request (Private)',
  'Web – Event Request (Corporate)',
  'Web – Sponsorship',
  'Web – Harrods',
  'Web/App – Event',
  'Web – Testimonial',
  'Web – Newsletter',
] as const

export type FormSource = (typeof FORM_SOURCES)[number]

export const INBOX = {
  membership: 'membership@theclubgroup.co',
  sarah: 'sarah@theclubgroup.co',
  events: 'events@theclubgroup.co',
} as const

interface SourceMeta {
  inbox: string | 'admins' | null
  intent: 'general' | 'membership' | 'event' | 'private_event' | 'concierge' | 'sponsorship' | 'venue' | 'press'
  /** Short label used in the notification subject. */
  label: string
  /** Acknowledgement email: what we received. */
  ackTitle: string
  /** Acknowledgement email + thank-you state: the suggested next step. */
  nextStep: string
}

export const SOURCE_META: Record<FormSource, SourceMeta> = {
  'Web – Membership': {
    inbox: INBOX.membership,
    intent: 'membership',
    label: 'Membership application',
    ackTitle: 'We’ve received your membership application.',
    nextStep: 'Next step: book a one-to-one with Sarah to set your objectives. The membership team will be in touch to arrange it.',
  },
  'Web – PITCH Founder': {
    inbox: INBOX.sarah,
    intent: 'general',
    label: 'PITCH founder application',
    ackTitle: 'We’ve received your application to pitch.',
    nextStep: 'Next step: the founder questionnaire and light due diligence. We’ll be in touch to take you through it.',
  },
  'Web – PITCH Investor': {
    inbox: INBOX.sarah,
    intent: 'general',
    label: 'PITCH Investor Panel application',
    ackTitle: 'We’ve received your Investor Panel application.',
    nextStep: 'Next step: confirming your investor classification, plus standard ID and AML checks. We’ll be in touch shortly.',
  },
  'Web – PITCH Sponsor': {
    inbox: INBOX.sarah,
    intent: 'sponsorship',
    label: 'PITCH partnership enquiry',
    ackTitle: 'We’ve received your PITCH partnership enquiry.',
    nextStep: 'Next step: a conversation with Sarah about the partnership that fits your objectives.',
  },
  'Web – Event Request (Private)': {
    inbox: INBOX.events,
    intent: 'private_event',
    label: 'Private event request',
    ackTitle: 'We’ve received your event request.',
    nextStep: 'Next step: the events team will call to talk through your brief, then send a proposal.',
  },
  'Web – Event Request (Corporate)': {
    inbox: INBOX.events,
    intent: 'private_event',
    label: 'Corporate event request',
    ackTitle: 'We’ve received your corporate event request.',
    nextStep: 'Next step: the events team will call to talk through your brief, then send a proposal.',
  },
  'Web – Sponsorship': {
    inbox: INBOX.events,
    intent: 'sponsorship',
    label: 'Sponsorship enquiry',
    ackTitle: 'We’ve received your sponsorship enquiry.',
    nextStep: 'Next step: a call to set your objectives and match you to the right events.',
  },
  'Web – Harrods': {
    inbox: INBOX.events,
    intent: 'sponsorship',
    label: 'London Series enquiry',
    ackTitle: 'We’ve received your London Series enquiry.',
    nextStep: 'Next step: the team will be in touch personally. Invitations are by approval.',
  },
  'Web/App – Event': {
    inbox: INBOX.events,
    intent: 'event',
    label: 'Event booking / invitation request',
    ackTitle: 'We’ve received your request.',
    nextStep: 'Next step: the events team will confirm your places personally.',
  },
  'Web – Testimonial': {
    inbox: 'admins',
    intent: 'general',
    label: 'Testimonial',
    ackTitle: 'Thank you for sharing your experience.',
    nextStep: 'Next step: we review every story before it appears on the site.',
  },
  'Web – Newsletter': {
    inbox: null,
    intent: 'general',
    label: 'Newsletter sign-up',
    ackTitle: 'You’re on the list.',
    nextStep: 'Next step: look out for the next letter from Sarah.',
  },
}

export function isFormSource(v: unknown): v is FormSource {
  return typeof v === 'string' && (FORM_SOURCES as readonly string[]).includes(v)
}

// ── Private uploads (PITCH deck / financials / cap table) ────────────
export const FORM_UPLOAD_BUCKET = 'form-uploads'
export const FORM_UPLOAD_MAX_BYTES = 20 * 1024 * 1024
export const FORM_UPLOAD_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}
/** Upload "slots" a form may use. Path = `<slot>/<uuid>/<safe-name>.<ext>`. */
export const FORM_UPLOAD_SLOTS = ['pitch-deck', 'pitch-financials', 'pitch-cap-table'] as const
export type FormUploadSlot = (typeof FORM_UPLOAD_SLOTS)[number]
export const FORM_UPLOAD_PATH_RE =
  /^(pitch-deck|pitch-financials|pitch-cap-table)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(pdf|pptx|xlsx|docx)$/
