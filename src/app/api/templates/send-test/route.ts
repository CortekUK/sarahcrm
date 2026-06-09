// Send a test email of the in-progress template to the logged-in admin.
//
// Used by the editor's "Send Test Email" button. The editor passes its
// current in-memory block tree + settings (blocks may not be saved yet),
// so we render here on the server and ship via Resend.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { renderBlocksToHTML } from '@/lib/templates/render-html'
import { replaceMergeTags } from '@/lib/utils-templates/merge-tags-core'
import type { EditorBlock, TemplateTheme } from '@/lib/templates/editor-types'

const SAMPLE_MERGE_DATA = {
  first_name: 'Charlotte',
  last_name: 'Hayes',
  email: '',
  phone: '+44 7700 900123',
  membership_tier: 'Tier 1',
  company_name: 'Hayes & Co.',
  event_name: 'Spring Salon Supper',
  event_date: 'Saturday, 4 April 2026',
  event_time: '7:00 PM',
  venue_name: 'The Connaught, Mayfair',
  dress_code: 'Smart casual',
  other_member_name: 'James Whitfield',
  introduction_note: 'I think you two will hit it off — both passionate about design and slow travel.',
  sender_name: 'Sarah Restrick',
  sender_title: 'Founder, The Club',
  sender_email: '',
  sender_phone: '',
  booking_link: 'https://theclub.example.com/book',
  month_name: 'March',
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!user.email) {
      return NextResponse.json(
        { error: 'Your account has no email address — cannot send test.' },
        { status: 400 },
      )
    }

    const body = await request.json()
    const blocks = (body.blocks || []) as EditorBlock[]
    const subject = String(body.subject || 'Test email')
    const theme = (body.theme ?? null) as TemplateTheme | null

    if (!Array.isArray(blocks) || blocks.length === 0) {
      return NextResponse.json(
        { error: 'Template has no content yet — add at least one block first.' },
        { status: 400 },
      )
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name, email, phone, job_title')
      .eq('id', user.id)
      .single()

    const fallbackName = user.email.split('@')[0]
    const fullName =
      `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() ||
      String(user.user_metadata?.full_name ?? '') ||
      fallbackName

    const data = {
      ...SAMPLE_MERGE_DATA,
      email: user.email,
      sender_name: fullName,
      sender_email: profile?.email || user.email,
      sender_phone: profile?.phone || '',
      sender_title: profile?.job_title || 'Founder, The Club',
    }

    const rawHtml = renderBlocksToHTML(blocks, theme)
    const html = replaceMergeTags(rawHtml, data)
    const renderedSubject = replaceMergeTags(subject, data)

    const resend = new Resend(apiKey)
    // Resolve the "from" the same way as the shared club-email sender, so a
    // verified domain set via RESEND_FROM_EMAIL is honoured here too. Reading
    // only FROM_EMAIL meant the test fell back to onboarding@resend.dev (which
    // Resend locks to the account owner's own address) whenever only
    // RESEND_FROM_EMAIL was configured.
    const fromEmail =
      process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL || 'onboarding@resend.dev'
    const fromName = process.env.RESEND_FROM_NAME || 'The Club'

    const result = await resend.emails.send({
      from: `${fromName} (Test) <${fromEmail}>`,
      to: [user.email],
      subject: `[TEST] ${renderedSubject}`,
      html,
    })

    if (result.error) {
      const message =
        typeof result.error === 'object' && result.error !== null && 'message' in result.error
          ? String((result.error as { message: unknown }).message)
          : 'Email failed'
      return NextResponse.json({ error: message }, { status: 502 })
    }

    return NextResponse.json({
      success: true,
      sent_to: user.email,
      resend_id: result.data?.id ?? null,
    })
  } catch (error) {
    console.error('Send test email error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send test' },
      { status: 500 },
    )
  }
}
