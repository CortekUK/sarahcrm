'use client'

// /dashboard/communications/compose?application=<id>[&template=<id>]
//
// The email designer in compose mode: write a one-off email to a membership
// applicant with the full editor (blocks, AI, preview, send-test), optionally
// starting from a saved template, then Send. Nothing is saved as a template.

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { EmailEditorPage } from '@/components/templates/editor/EmailEditorPage'

interface Applicant {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
}

function ComposeContent() {
  const router = useRouter()
  const params = useSearchParams()
  const applicationId = params.get('application') ?? ''
  const templateId = params.get('template') || undefined

  const [applicant, setApplicant] = useState<Applicant | null>(null)
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!applicationId) {
      setError('No application selected.')
      return
    }
    void supabase
      .from('membership_applications')
      .select('id, email, first_name, last_name')
      .eq('id', applicationId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) setError('Application not found.')
        else if (!data.email) setError('This application has no email address.')
        else setApplicant(data as Applicant)
      })
    void supabase
      .from('email_templates')
      .select('id, name')
      .order('name')
      .then(({ data }) => setTemplates((data ?? []) as { id: string; name: string }[]))
  }, [applicationId])

  const backHref = `/dashboard/applications?open=${applicationId}`

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 text-ivory-soft">
        <p className="text-sm">{error}</p>
        <button className="text-xs text-bronze-light hover:underline" onClick={() => router.push('/dashboard/applications')}>
          Back to applications
        </button>
      </div>
    )
  }
  if (!applicant) return <LoadingFallback />

  return (
    <EmailEditorPage
      key={templateId ?? 'blank'}
      templateId={templateId}
      compose={{
        applicationId: applicant.id,
        email: applicant.email!,
        name: `${applicant.first_name ?? ''} ${applicant.last_name ?? ''}`.trim(),
        backHref,
        templates,
        onPickTemplate: (id) =>
          router.replace(
            `/dashboard/communications/compose?application=${applicant.id}${id ? `&template=${id}` : ''}`,
          ),
      }}
    />
  )
}

export default function ComposePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ComposeContent />
    </Suspense>
  )
}

function LoadingFallback() {
  return (
    <div className="h-screen flex items-center justify-center">
      <div className="flex items-center gap-3 text-[var(--color-text-muted)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading editor…</span>
      </div>
    </div>
  )
}
