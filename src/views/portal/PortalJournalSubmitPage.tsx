'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Check, Send } from 'lucide-react'
import {
  PortalButton,
  PortalCard,
  PortalField,
  PortalInput,
  PortalPageHeader,
  PortalTextarea,
} from '@/components/portal/PortalChrome'

// Members submit an article for the Journal's Members' Editorial. It goes
// to Sarah for approval (status 'pending_review') and is only ever shown to
// The Club Members once published. Server route: /api/portal/journal/submit.

export function PortalJournalSubmitPage() {
  const [title, setTitle] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [body, setBody] = useState('')
  const [hero, setHero] = useState('')
  const [website, setWebsite] = useState('') // honeypot
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim() || !body.trim()) {
      setError('Please add a title and your article.')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/portal/journal/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, excerpt, body, hero_image_url: hero, website }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) {
        setError(json.error || 'We could not send your article. Please try again.')
        return
      }
      setSent(true)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-[820px] mx-auto px-6 lg:px-10 py-12 lg:py-16">
      <PortalPageHeader
        eyebrow="The Journal · Members' Editorial"
        title="Write for the Journal."
        subtitle="Share news, a win, an offer or a view with The Club Members. Sarah reviews every article before it goes live, and Members' Editorial is only ever shown to The Club Members."
      />

      {sent ? (
        <PortalCard className="p-8 lg:p-10 text-center">
          <div className="w-12 h-12 mx-auto rounded-full border border-bronze/40 bg-bronze/10 flex items-center justify-center mb-6">
            <Check size={18} strokeWidth={1.75} className="text-bronze-light" />
          </div>
          <p className="font-[family-name:var(--font-display)] text-[24px] text-ivory">Thank you. Your article is with Sarah.</p>
          <p className="mt-3 font-[family-name:var(--font-editorial)] italic text-[15px] text-ivory-soft">
            We&rsquo;ll be in touch if anything needs changing before it&rsquo;s published.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <PortalButton
              variant="secondary"
              onClick={() => {
                setTitle('')
                setExcerpt('')
                setBody('')
                setHero('')
                setSent(false)
              }}
            >
              Write another
            </PortalButton>
            <Link
              href="/journal"
              className="inline-flex items-center gap-2 rounded-full border border-transparent px-6 py-3 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-ivory-soft hover:text-bronze-light"
            >
              Read the Journal <ArrowUpRight size={13} strokeWidth={1.5} />
            </Link>
          </div>
        </PortalCard>
      ) : (
        <PortalCard className="p-6 lg:p-9">
          <form onSubmit={onSubmit} className="space-y-8" noValidate>
            <PortalField label="Title">
              <PortalInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
            </PortalField>
            <PortalField label="Summary (optional)" hint="One or two sentences shown on the Journal card.">
              <PortalTextarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} maxLength={600} />
            </PortalField>
            <PortalField
              label="Your article"
              hint="Plain text is fine. Leave a blank line between paragraphs; **bold**, *italic* and ## headings work too."
            >
              <PortalTextarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} maxLength={20000} required />
            </PortalField>
            <PortalField label="Image link (optional)" hint="An https:// link to a photo you own or have permission to use.">
              <PortalInput type="url" value={hero} onChange={(e) => setHero(e.target.value)} placeholder="https://" />
            </PortalField>
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="hidden"
              aria-hidden
            />
            {error && (
              <p role="alert" className="text-[13px] italic text-accent-warm">
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <PortalButton type="submit" loading={sending} icon={<Send size={13} strokeWidth={1.5} />}>
                Send to Sarah for approval
              </PortalButton>
            </div>
          </form>
        </PortalCard>
      )}
    </div>
  )
}
