'use client'

import { useMemo, useState } from 'react'
import { Monitor, Smartphone, Send, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui-shadcn/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui-shadcn/select'
import { renderBlocksToHTML } from '@/lib/templates/render-html'
import { replaceMergeTags } from '@/lib/utils-templates/merge-tags-core'
import { cn } from '@/lib/utils'
import type { EditorBlock, TemplateTheme } from '@/lib/templates/editor-types'

interface PreviewSlideoutProps {
  blocks: EditorBlock[]
  subject: string
  preheader: string
  theme?: TemplateTheme | null
  open: boolean
  onToggle: () => void
  onClose: () => void
  onSendTest: () => void
  sendingTest: boolean
}

// Three sample-data profiles so the user can preview the email as it'd
// land for different member types — mirrors IFG's "TEST AS" dropdown.
const TEST_PROFILES: Record<string, Record<string, string>> = {
  charlotte: {
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
  },
  james: {
    first_name: 'James',
    last_name: 'Whitfield',
    email: 'james@example.com',
    phone: '+44 7700 900456',
    membership_tier: 'Tier 2',
    company_name: 'Whitfield Capital',
    event_name: 'Autumn Founders Retreat',
    event_date: 'Friday, 18 October 2026',
    event_time: '6:30 PM',
    venue_name: 'Soho Farmhouse',
    dress_code: 'Black tie optional',
    other_member_name: 'Charlotte Hayes',
    introduction_note: 'Both interested in slow travel — should be a great connection.',
    sender_name: 'Sarah Restrick',
    sender_title: 'Founder, The Club',
    sender_email: 'sarah@theclub.example.com',
    sender_phone: '',
    booking_link: 'https://theclub.example.com/book',
    month_name: 'October',
    unsubscribe_url: '#',
  },
  olivia: {
    first_name: 'Olivia',
    last_name: 'Pearce',
    email: 'olivia@example.com',
    phone: '',
    membership_tier: 'Tier 3',
    company_name: '',
    event_name: 'Members Tasting Evening',
    event_date: 'Thursday, 11 June 2026',
    event_time: '8:00 PM',
    venue_name: '34 Mayfair',
    dress_code: 'Smart',
    other_member_name: 'James Whitfield',
    introduction_note: '',
    sender_name: 'Sarah Restrick',
    sender_title: 'Founder, The Club',
    sender_email: 'sarah@theclub.example.com',
    sender_phone: '',
    booking_link: 'https://theclub.example.com/book',
    month_name: 'June',
    unsubscribe_url: '#',
  },
}

const TEST_PROFILE_LABELS: Record<string, string> = {
  charlotte: 'Charlotte Hayes',
  james: 'James Whitfield',
  olivia: 'Olivia Pearce',
}

export function PreviewSlideout({
  blocks,
  subject,
  preheader,
  theme,
  open,
  onToggle,
  onClose,
  onSendTest,
  sendingTest,
}: PreviewSlideoutProps) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [testAs, setTestAs] = useState<string>('charlotte')

  const html = useMemo(() => {
    const raw = renderBlocksToHTML(blocks, theme)
    const data = { ...TEST_PROFILES[testAs], subject }
    return replaceMergeTags(raw, data)
  }, [blocks, theme, subject, testAs])

  const profile = TEST_PROFILES[testAs]
  const fromName = profile.sender_name
  const toEmail = profile.email || `${testAs}@example.com`
  const previewSubject = replaceMergeTags(subject || 'Enter your subject line…', {
    ...profile,
  })

  return (
    <>
      {/* Vertical tab handle pinned to the right edge */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'fixed right-0 top-1/2 -translate-y-1/2 z-30 flex items-center gap-1.5 px-2 py-6 rounded-l-md bg-[var(--color-gold)] text-white shadow-lg hover:bg-[var(--color-gold-dark)] transition-all',
          open && 'translate-x-full opacity-0 pointer-events-none',
        )}
        aria-label="Open preview"
      >
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] [writing-mode:vertical-rl] rotate-180">
          Preview
        </span>
      </button>

      {/* Slide-out preview pane */}
      <div
        className={cn(
          'fixed right-0 top-14 bottom-0 z-40 flex flex-col bg-white border-l border-[var(--color-border)] shadow-2xl transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{ width: 'min(720px, 60vw)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
              Preview
            </span>
            <div className="flex items-center gap-0.5 bg-white border border-[var(--color-border)] rounded-md p-0.5">
              <button
                onClick={() => setDevice('desktop')}
                className={cn(
                  'p-1.5 rounded-sm transition-colors',
                  device === 'desktop'
                    ? 'bg-[var(--color-gold)] text-white'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]',
                )}
                title="Desktop"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setDevice('mobile')}
                className={cn(
                  'p-1.5 rounded-sm transition-colors',
                  device === 'mobile'
                    ? 'bg-[var(--color-gold)] text-white'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]',
                )}
                title="Mobile"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onSendTest}
              disabled={sendingTest || blocks.length === 0}
              className="h-8"
            >
              {sendingTest ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1.5" />
              )}
              Send test
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
              title="Hide preview"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Test-as picker */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--color-border)]">
          <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--color-text-muted)]">
            Test as
          </span>
          <Select value={testAs} onValueChange={setTestAs}>
            <SelectTrigger className="h-8 w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TEST_PROFILE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Inbox-style email preview */}
        <div className="flex-1 overflow-y-auto bg-[var(--color-surface-2)] p-6">
          <div
            className="mx-auto bg-white shadow-md rounded-md overflow-hidden"
            style={{ maxWidth: device === 'mobile' ? 380 : 700 }}
          >
            {/* From / To / Subject header (like a real inbox) */}
            <div className="px-5 py-4 border-b border-[var(--color-border)] bg-white">
              <p className="text-xs text-[var(--color-text-muted)] mb-1">
                <span className="text-[var(--color-text-dim)]">From:</span> {fromName}
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mb-2">
                <span className="text-[var(--color-text-dim)]">To:</span> {toEmail}
              </p>
              <p className="text-sm font-medium text-[var(--color-text)]">{previewSubject}</p>
              {preheader && (
                <p className="text-xs text-[var(--color-text-dim)] mt-1 italic">
                  {replaceMergeTags(preheader, profile)}
                </p>
              )}
            </div>

            {/* Rendered email body */}
            <iframe
              title="Email preview"
              srcDoc={html}
              className="w-full block"
              style={{ height: '70vh', border: 0 }}
              sandbox=""
            />
          </div>
        </div>
      </div>
    </>
  )
}
