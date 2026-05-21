'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  X,
  Save,
  Undo2,
  Redo2,
  Loader2,
  Check,
  AlertCircle,
  Sparkles,
  Pointer,
} from 'lucide-react'
import { Button } from '@/components/ui-shadcn/button'
import { Input } from '@/components/ui-shadcn/input'
import { useEmailEditor } from '@/lib/hooks/useEmailEditor'
import { AiPromptPanel } from './AiPromptPanel'
import { EditorCanvas } from './EditorCanvas'
import { LeftSidebar } from './LeftSidebar'
import { PreviewSlideout } from './PreviewSlideout'
import { toast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { TemplateTheme } from '@/lib/templates/editor-types'

interface EmailEditorPageProps {
  templateId?: string
}

export function EmailEditorPage({ templateId }: EmailEditorPageProps) {
  const router = useRouter()
  const editor = useEmailEditor(templateId)
  const [mode, setMode] = useState<'build' | 'ai'>('build')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)

  const selectedBlock = editor.blocks.find((b) => b.id === editor.selectedBlockId) ?? null

  const handleClose = useCallback(() => {
    if (editor.hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Leave anyway?')) return
    }
    router.push('/dashboard/communications/templates')
  }, [editor.hasUnsavedChanges, router])

  const handleSendTest = useCallback(async () => {
    if (sendingTest) return
    setSendingTest(true)
    try {
      const res = await fetch('/api/templates/send-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          blocks: editor.blocks,
          subject: editor.settings.subject,
          theme: editor.settings.theme ?? null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({
          title: 'Test send failed',
          description: json.error || 'Unknown error',
          variant: 'destructive',
        })
        return
      }
      toast({
        title: 'Test email sent',
        description: `Check ${json.sent_to}`,
      })
    } catch (err) {
      toast({
        title: 'Test send failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSendingTest(false)
    }
  }, [editor.blocks, editor.settings.subject, editor.settings.theme, sendingTest])

  const handleThemeUpdate = useCallback(
    (updates: Partial<TemplateTheme>) => {
      const merged: TemplateTheme = { ...(editor.settings.theme ?? {}), ...updates }
      editor.updateSettings({ theme: merged })
    },
    [editor],
  )

  if (editor.isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <div className="flex items-center gap-3 text-[var(--color-text-muted)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading template…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--color-bg)] overflow-hidden">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 h-14 bg-white border-b border-[var(--color-border)] flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
          <div className="min-w-0 max-w-[280px]">
            <Input
              value={editor.settings.name}
              onChange={(e) => editor.updateSettings({ name: e.target.value })}
              className="border-none shadow-none focus-visible:ring-0 px-0 h-7 text-base font-medium font-[family-name:var(--font-heading)]"
              placeholder="Untitled Template"
            />
          </div>
          <SavedStatus
            isSaving={editor.isSaving}
            isAutoSaving={editor.isAutoSaving}
            hasUnsavedChanges={editor.hasUnsavedChanges}
            lastSavedAt={editor.lastSavedAt}
          />
        </div>

        {/* Build / AI mode toggle — pill switcher, matches IFG image 2/3 */}
        <div className="flex items-center gap-1 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-md p-0.5 mr-2">
          <button
            onClick={() => setMode('build')}
            className={cn(
              'flex items-center gap-1.5 px-3 h-7 rounded text-xs font-medium transition-colors',
              mode === 'build'
                ? 'bg-white text-[var(--color-text)] shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
            )}
          >
            <Pointer className="w-3.5 h-3.5" />
            Build
          </button>
          <button
            onClick={() => setMode('ai')}
            className={cn(
              'flex items-center gap-1.5 px-3 h-7 rounded text-xs font-medium transition-all',
              mode === 'ai'
                ? 'bg-[var(--color-gold)] text-white shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI
          </button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={editor.undo}
            disabled={!editor.canUndo}
            title="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={editor.redo}
            disabled={!editor.canRedo}
            title="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => editor.saveTemplate(false, false, true)}
            disabled={editor.isSaving}
            className="h-8"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Save Draft
          </Button>
          <Button
            size="sm"
            onClick={() => editor.saveTemplate(true, false, false)}
            disabled={editor.isSaving}
            className="h-8 bg-[var(--color-gold)] hover:bg-[var(--color-gold-dark)]"
          >
            {editor.isSaving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5 mr-1.5" />
            )}
            Save &amp; Exit
          </Button>
        </div>
      </div>

      {/* ── Body — two-column ────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">
        <aside className="w-[340px] border-r border-[var(--color-border)] bg-white flex flex-col min-h-0">
          {mode === 'build' ? (
            <LeftSidebar
              settings={editor.settings}
              onSettingsChange={editor.updateSettings}
              selectedBlock={selectedBlock}
              onBlockChange={(updates) => {
                if (selectedBlock) editor.updateBlock(selectedBlock.id, updates)
              }}
              onAddBlock={editor.addBlock}
            />
          ) : (
            <AiPromptPanel
              category={editor.settings.category}
              blocks={editor.blocks}
              subject={editor.settings.subject}
              theme={editor.settings.theme}
              templateId={templateId}
              onApply={(newBlocks, settings, opts) => {
                editor.replaceBlocks(newBlocks, settings, opts)
              }}
              onUpdateTheme={handleThemeUpdate}
              onCategoryChange={(c) => editor.updateSettings({ category: c })}
            />
          )}
        </aside>

        <main className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
          <EditorCanvas
            blocks={editor.blocks}
            theme={editor.settings.theme}
            selectedBlockId={editor.selectedBlockId}
            onSelectBlock={editor.setSelectedBlockId}
            onMoveBlock={editor.moveBlock}
            onDuplicateBlock={editor.duplicateBlock}
            onDeleteBlock={editor.deleteBlock}
          />
        </main>
      </div>

      {/* Slide-out preview — vertical PREVIEW tab on the right edge */}
      <PreviewSlideout
        blocks={editor.blocks}
        subject={editor.settings.subject}
        preheader={editor.settings.preheader}
        theme={editor.settings.theme}
        open={previewOpen}
        onToggle={() => setPreviewOpen((v) => !v)}
        onClose={() => setPreviewOpen(false)}
        onSendTest={handleSendTest}
        sendingTest={sendingTest}
      />
    </div>
  )
}

function SavedStatus({
  isSaving,
  isAutoSaving,
  hasUnsavedChanges,
  lastSavedAt,
}: {
  isSaving: boolean
  isAutoSaving: boolean
  hasUnsavedChanges: boolean
  lastSavedAt: Date | null
}) {
  if (isSaving) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-dim)]">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    )
  }
  if (isAutoSaving) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-dim)]">
        <Loader2 className="h-3 w-3 animate-spin" />
        Auto-saving…
      </span>
    )
  }
  if (hasUnsavedChanges) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--color-accent-warm)]">
        <AlertCircle className="h-3 w-3" />
        Unsaved
      </span>
    )
  }
  if (lastSavedAt) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-dim)]">
        <Check className="h-3 w-3" />
        Saved
      </span>
    )
  }
  return null
}
