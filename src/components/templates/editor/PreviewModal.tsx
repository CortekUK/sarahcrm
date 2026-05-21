'use client'

import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui-shadcn/dialog'
import { Button } from '@/components/ui-shadcn/button'
import { Monitor, Smartphone } from 'lucide-react'
import { renderBlocksToHTML } from '@/lib/templates/render-html'
import { replaceMergeTags } from '@/lib/utils-templates/merge-tags-core'
import type { EditorBlock, TemplateTheme } from '@/lib/templates/editor-types'

interface PreviewModalProps {
  open: boolean
  onClose: () => void
  blocks: EditorBlock[]
  subject: string
  preheader: string
  theme?: TemplateTheme | null
}

const SAMPLE_DATA: Record<string, string> = {
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
  subject: '',
  unsubscribe_url: '#',
}

export function PreviewModal({ open, onClose, blocks, subject, preheader, theme }: PreviewModalProps) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')

  const html = useMemo(() => {
    const raw = renderBlocksToHTML(blocks, theme)
    return replaceMergeTags(raw, { ...SAMPLE_DATA, subject })
  }, [blocks, theme, subject])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl p-0 max-h-[90vh] overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Preview</DialogTitle>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                Subject: {subject || '(no subject)'}
                {preheader && ` · ${preheader}`}
              </p>
            </div>
            <div className="flex items-center gap-1 mr-8">
              <Button
                variant={device === 'desktop' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setDevice('desktop')}
              >
                <Monitor className="h-3.5 w-3.5 mr-1.5" />
                Desktop
              </Button>
              <Button
                variant={device === 'mobile' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setDevice('mobile')}
              >
                <Smartphone className="h-3.5 w-3.5 mr-1.5" />
                Mobile
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="bg-[var(--color-surface-2)] p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 70px)' }}>
          <div
            className="mx-auto bg-white shadow-md"
            style={{ width: device === 'mobile' ? 375 : '100%', maxWidth: device === 'mobile' ? 375 : 700 }}
          >
            <iframe
              title="Email preview"
              srcDoc={html}
              className="w-full"
              style={{ height: '70vh', border: 0 }}
              sandbox=""
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
