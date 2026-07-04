'use client'

// Contract builder shell — a copy of EmailEditorPage adapted for contracts.
// Build mode uses the shared block canvas (via ContractCanvas) + ContractSidebar;
// AI mode uses ContractAiPanel to draft agreement content. The email editor is
// left untouched.

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, Save, Undo2, Redo2, Loader2, Check, AlertCircle, Sparkles, Pointer } from 'lucide-react'
import { Button } from '@/components/ui-shadcn/button'
import { Input } from '@/components/ui-shadcn/input'
import { useContractEditor } from './useContractEditor'
import { ContractSidebar } from './ContractSidebar'
import { ContractCanvas } from './ContractCanvas'
import { ContractAiPanel } from './ContractAiPanel'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { cn } from '@/lib/utils'
import type { TemplateTheme } from '@/lib/templates/editor-types'

interface ContractEditorPageProps {
  contractId?: string
}

const LIST_PATH = '/dashboard/communications/contracts'

export function ContractEditorPage({ contractId }: ContractEditorPageProps) {
  const router = useRouter()
  const editor = useContractEditor(contractId)
  const [mode, setMode] = useState<'build' | 'ai'>('build')
  const confirm = useConfirm()

  const selectedBlock = editor.blocks.find((b) => b.id === editor.selectedBlockId) ?? null

  const handleClose = useCallback(async () => {
    if (editor.hasUnsavedChanges) {
      const ok = await confirm({
        title: 'Leave without saving?',
        description: 'You have unsaved changes to this contract. Leaving now will discard them.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        tone: 'warning',
      })
      if (!ok) return
    }
    router.push(LIST_PATH)
  }, [editor.hasUnsavedChanges, router, confirm])

  const handleThemeUpdate = useCallback(
    (updates: Partial<TemplateTheme>) => {
      const merged: TemplateTheme = { ...(editor.settings.theme ?? {}), ...updates }
      editor.updateSettings({ theme: merged })
    },
    [editor],
  )

  if (editor.isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-graphite">
        <div className="flex items-center gap-3 text-ivory-soft">
          <Loader2 className="h-5 w-5 animate-spin text-bronze-light" />
          <span className="text-sm font-[family-name:var(--font-meta)] uppercase tracking-[0.22em]">
            Loading contract…
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-graphite text-ivory overflow-hidden">
      <div className="flex items-center justify-between px-4 h-14 bg-ink/80 backdrop-blur-sm border-b border-graphite-line/60 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-ivory-soft hover:text-bronze-light hover:bg-bronze/[0.08]"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="min-w-0 max-w-[280px]">
            <Input
              value={editor.settings.name}
              onChange={(e) => editor.updateSettings({ name: e.target.value })}
              className="border-none shadow-none focus-visible:ring-0 bg-transparent px-0 h-7 text-base font-medium font-[family-name:var(--font-display)] text-ivory placeholder:text-slate-haze"
              placeholder="Untitled contract"
            />
          </div>
          <SavedStatus
            isSaving={editor.isSaving}
            isAutoSaving={editor.isAutoSaving}
            hasUnsavedChanges={editor.hasUnsavedChanges}
            lastSavedAt={editor.lastSavedAt}
          />
        </div>

        <div className="flex items-center gap-1 bg-graphite/60 border border-graphite-line/60 rounded-md p-0.5 mr-2">
          <button
            onClick={() => setMode('build')}
            className={cn(
              'flex items-center gap-1.5 px-3 h-7 rounded text-xs font-medium transition-colors',
              mode === 'build' ? 'bg-bronze/15 text-bronze-light shadow-sm' : 'text-ivory-soft/75 hover:text-ivory',
            )}
          >
            <Pointer className="w-3.5 h-3.5" />
            Build
          </button>
          <button
            onClick={() => setMode('ai')}
            className={cn(
              'flex items-center gap-1.5 px-3 h-7 rounded text-xs font-medium transition-all',
              mode === 'ai' ? 'bg-bronze text-ink shadow-sm' : 'text-ivory-soft/75 hover:text-ivory',
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
            className="h-8 w-8 text-ivory-soft hover:text-bronze-light hover:bg-bronze/[0.08] disabled:opacity-40"
            onClick={editor.undo}
            disabled={!editor.canUndo}
            title="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-ivory-soft hover:text-bronze-light hover:bg-bronze/[0.08] disabled:opacity-40"
            onClick={editor.redo}
            disabled={!editor.canRedo}
            title="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-graphite-line/60 mx-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => editor.saveContract(false, false, true)}
            disabled={editor.isSaving}
            className="h-8 border-graphite-line/70 bg-transparent text-ivory-soft hover:border-bronze/55 hover:text-bronze-light hover:bg-bronze/[0.06]"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Save Draft
          </Button>
          <Button
            size="sm"
            onClick={() => editor.saveContract(true, false, false)}
            disabled={editor.isSaving}
            className="h-8 bg-bronze text-ink hover:bg-bronze-light"
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

      <div className="flex-1 flex min-h-0">
        <aside className="w-[340px] border-r border-graphite-line/60 bg-graphite flex flex-col min-h-0">
          {mode === 'build' ? (
            <ContractSidebar
              settings={editor.settings}
              onSettingsChange={editor.updateSettings}
              selectedBlock={selectedBlock}
              onBlockChange={(updates) => {
                if (selectedBlock) editor.updateBlock(selectedBlock.id, updates)
              }}
              onAddBlock={editor.addBlock}
            />
          ) : (
            <ContractAiPanel
              docType={editor.settings.docType}
              blocks={editor.blocks}
              theme={editor.settings.theme}
              contractId={editor.activeId ?? contractId}
              onApply={(newBlocks, settings, opts) => editor.replaceBlocks(newBlocks, settings, opts)}
              onUpdateTheme={handleThemeUpdate}
            />
          )}
        </aside>

        <main className="escape-night-admin flex-1 overflow-y-auto bg-[var(--color-bg)]">
          <ContractCanvas
            blocks={editor.blocks}
            theme={editor.settings.theme}
            selectedBlockId={editor.selectedBlockId}
            onSelectBlock={editor.setSelectedBlockId}
            onMoveBlock={editor.moveBlock}
            onDuplicateBlock={editor.duplicateBlock}
            onDeleteBlock={editor.deleteBlock}
            onUpdateBlock={editor.updateBlock}
          />
        </main>
      </div>
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
  if (isSaving || isAutoSaving) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-dim)]">
        <Loader2 className="h-3 w-3 animate-spin" />
        {isSaving ? 'Saving…' : 'Auto-saving…'}
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
