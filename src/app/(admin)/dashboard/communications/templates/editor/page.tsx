'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { EmailEditorPage } from '@/components/templates/editor/EmailEditorPage'

function EditorPageContent() {
  const searchParams = useSearchParams()
  const templateId = searchParams.get('id') || undefined
  return <EmailEditorPage templateId={templateId} />
}

export default function EditorPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <EditorPageContent />
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
