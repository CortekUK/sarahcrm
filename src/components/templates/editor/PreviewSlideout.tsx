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
          'fixed right-0 top-1/2 -translate-y-1/2 z-30 flex items-center gap-1.5 px-2 py-6 rounded-l-md bg-bronze text-ink shadow-lg hover:bg-bronze-light transition-all',
          open && 'translate-x-full opacity-0 pointer-events-none',
        )}
        aria-label="Open preview"
      >
        <span className="font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.28em] [writing-mode:vertical-rl] rotate-180">
          Preview
        </span>
      </button>

      {/* Slide-out preview pane — dark chrome, the inbox card inside
          stays light because that's what the email actually looks like. */}
      <div
        className={cn(
          'fixed right-0 top-14 bottom-0 z-40 flex flex-col bg-graphite border-l border-graphite-line/60 shadow-[0_30px_60px_-12px_rgba(0,0,0,0.7)] transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{ width: 'min(720px, 60vw)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-graphite-line/55 bg-ink/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="font-[family-name:var(--font-meta)] text-[10.5px] font-medium uppercase tracking-[0.28em] text-bronze-light">
              Preview
            </span>
            <div className="flex items-center gap-0.5 bg-graphite/60 border border-graphite-line/55 rounded-md p-0.5">
              <button
                onClick={() => setDevice('desktop')}
                className={cn(
                  'p-1.5 rounded-sm transition-colors',
                  device === 'desktop'
                    ? 'bg-bronze text-ink'
                    : 'text-ivory-soft/75 hover:text-ivory hover:bg-bronze/[0.08]',
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
                    ? 'bg-bronze text-ink'
                    : 'text-ivory-soft/75 hover:text-ivory hover:bg-bronze/[0.08]',
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
              className="h-8 border-graphite-line/70 bg-transparent text-ivory-soft hover:border-bronze/55 hover:text-bronze-light hover:bg-bronze/[0.06] disabled:opacity-40"
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
              className="h-8 w-8 text-ivory-soft hover:text-bronze-light hover:bg-bronze/[0.08]"
              onClick={onClose}
              title="Hide preview"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Test-as picker */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-graphite-line/55 bg-graphite/60">
          <span className="font-[family-name:var(--font-meta)] text-[9.5px] font-medium uppercase tracking-[0.28em] text-bronze-light/85">
            Test as
          </span>
          <Select value={testAs} onValueChange={setTestAs}>
            <SelectTrigger className="h-8 w-[200px] border-graphite-line/60 bg-ink/50 text-ivory hover:border-bronze/55">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-graphite border-graphite-line/60 text-ivory">
              {Object.entries(TEST_PROFILE_LABELS).map(([key, label]) => (
                <SelectItem
                  key={key}
                  value={key}
                  className="text-ivory focus:bg-bronze/[0.08] focus:text-bronze-light"
                >
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Inbox-style email preview — the surrounding gutter is a
            soft graphite-2 so the white inbox card lifts off it; the
            card itself is white because that's how the email renders
            in a real inbox. */}
        <div className="flex-1 overflow-y-auto bg-graphite-2/60 p-6">
          <div
            className="mx-auto bg-white shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] rounded-md overflow-hidden"
            style={{ maxWidth: device === 'mobile' ? 380 : 700 }}
          >
            {/* From / To / Subject header (like a real inbox) */}
            <div className="px-5 py-4 border-b border-[#E5E0D8] bg-white">
              <p className="text-xs text-[#6B6560] mb-1">
                <span className="text-[#A09A93]">From:</span> {fromName}
              </p>
              <p className="text-xs text-[#6B6560] mb-2">
                <span className="text-[#A09A93]">To:</span> {toEmail}
              </p>
              <p className="text-sm font-medium text-[#2C2825]">{previewSubject}</p>
              {preheader && (
                <p className="text-xs text-[#A09A93] mt-1 italic">
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
