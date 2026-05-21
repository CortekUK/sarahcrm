import { replaceMergeTags } from '@/lib/utils-templates/merge-tags-core'

// Sample merge-tag values used wherever the admin UI previews a template
// outside the editor's full canvas — list rows, modals, send results,
// etc. Kept here so a tweak (e.g. swap the sample member name) flows to
// every preview surface in one edit.
export const SAMPLE_PREVIEW_DATA: Record<string, string> = {
  first_name: 'Charlotte',
  last_name: 'Hayes',
  email: 'charlotte@example.com',
  phone: '+44 7700 900123',
  membership_tier: 'Tier 1',
  company_name: 'Hayes & Co.',
  event_name: 'Spring Salon Supper',
  event_date: 'Saturday, 4 April 2026',
  event_time: '7:00 PM',
  venue_name: 'The Connaught, Mayfair',
  dress_code: 'Smart casual',
  other_member_name: 'James Whitfield',
  introduction_note: 'I think you two will hit it off.',
  sender_name: 'Sarah Restrick',
  sender_title: 'Founder, The Club',
  sender_email: 'sarah@theclub.example.com',
  sender_phone: '',
  booking_link: 'https://theclub.example.com/book',
  month_name: 'March',
  unsubscribe_url: '#',
}

/**
 * Substitute merge tags with the sample dataset above. Used by admin
 * list rows / cells that show a template's name or subject — keeps raw
 * `{{event_name}}` tokens from leaking into the dashboard chrome.
 *
 * Returns an empty string for null/undefined inputs.
 */
export function previewMergeTags(text: string | null | undefined): string {
  if (!text) return ''
  return replaceMergeTags(text, SAMPLE_PREVIEW_DATA)
}
