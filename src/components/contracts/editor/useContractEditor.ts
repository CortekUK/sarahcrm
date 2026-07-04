'use client'

// Contract editor state — a copy of useEmailEditor (src/lib/hooks/useEmailEditor.ts)
// retargeted at the `contract_templates` table and the slimmer ContractSettings.
// Kept separate so the email template editor is completely untouched.

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/lib/hooks/use-toast'
import { renderBlocksToHTML } from '@/lib/templates/render-html'
import {
  EditorBlock,
  BlockType,
  defaultBlockContent,
} from '@/lib/templates/editor-types'
import { ContractSettings, defaultContractSettings } from '@/lib/contracts/editor-types'
import type { Json } from '@/types/database'

const AUTOSAVE_DEBOUNCE_MS = 2500
const HISTORY_COALESCE_MS = 600
const LIST_PATH = '/dashboard/communications/contracts'
const EDITOR_PATH = '/dashboard/communications/contracts/editor'

interface HistoryState {
  stack: EditorBlock[][]
  index: number
  lastCommitAt: number
}

function generateId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function useContractEditor(contractId?: string) {
  const router = useRouter()
  const supabase = createClient()

  const [blocks, setBlocks] = useState<EditorBlock[]>([])
  const [settings, setSettings] = useState<ContractSettings>(defaultContractSettings)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(!!contractId)
  const [isSaving, setIsSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [isAutoSaving, setIsAutoSaving] = useState(false)

  const [activeId, setActiveId] = useState<string | null>(contractId ?? null)
  useEffect(() => {
    setActiveId(contractId ?? null)
  }, [contractId])

  const [currentIsDraft, setCurrentIsDraft] = useState<boolean | null>(null)
  const savingRef = useRef(false)

  const [history, setHistory] = useState<HistoryState>({ stack: [[]], index: 0, lastCommitAt: 0 })

  const markChanged = useCallback(() => setHasUnsavedChanges(true), [])

  const commitHistory = useCallback((newBlocks: EditorBlock[]) => {
    setHistory((prev) => {
      const trimmed = prev.stack.slice(0, prev.index + 1)
      const head = trimmed[trimmed.length - 1]
      if (head && JSON.stringify(head) === JSON.stringify(newBlocks)) return prev
      const now = Date.now()
      const shouldCoalesce = trimmed.length > 0 && now - prev.lastCommitAt < HISTORY_COALESCE_MS
      if (shouldCoalesce) {
        const merged = [...trimmed.slice(0, -1), newBlocks]
        return { stack: merged, index: merged.length - 1, lastCommitAt: now }
      }
      const appended = [...trimmed, newBlocks]
      return { stack: appended, index: appended.length - 1, lastCommitAt: now }
    })
  }, [])

  useEffect(() => {
    if (contractId) {
      loadContract(contractId)
    } else {
      setHistory({ stack: [[]], index: 0, lastCommitAt: 0 })
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId])

  const loadContract = async (id: string) => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('contract_templates')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      if (data) {
        let loadedBlocks: EditorBlock[] = []
        if (data.body_json) {
          try {
            loadedBlocks =
              typeof data.body_json === 'string'
                ? JSON.parse(data.body_json)
                : (data.body_json as unknown as EditorBlock[])
          } catch {
            loadedBlocks = []
          }
        }
        const loadedTheme =
          data.theme && typeof data.theme === 'object'
            ? (data.theme as ContractSettings['theme'])
            : undefined
        setBlocks(loadedBlocks)
        setSettings({
          name: data.name || 'Untitled contract',
          docType: data.doc_type || 'contract',
          theme: loadedTheme,
        })
        setHistory({ stack: [loadedBlocks], index: 0, lastCommitAt: 0 })
        setCurrentIsDraft(Boolean(data.is_draft))
      }
    } catch (error) {
      toast({
        title: 'Failed to load contract',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const undo = useCallback(() => {
    if (history.index <= 0) return
    const newIndex = history.index - 1
    setBlocks(history.stack[newIndex])
    setHistory({ ...history, index: newIndex, lastCommitAt: 0 })
    markChanged()
  }, [history, markChanged])

  const redo = useCallback(() => {
    if (history.index >= history.stack.length - 1) return
    const newIndex = history.index + 1
    setBlocks(history.stack[newIndex])
    setHistory({ ...history, index: newIndex, lastCommitAt: 0 })
    markChanged()
  }, [history, markChanged])

  const addBlock = useCallback(
    (type: BlockType, index?: number) => {
      const newBlock: EditorBlock = { id: generateId(), type, content: { ...defaultBlockContent[type] } }
      setBlocks((prev) => {
        const newBlocks =
          index !== undefined ? [...prev.slice(0, index), newBlock, ...prev.slice(index)] : [...prev, newBlock]
        commitHistory(newBlocks)
        return newBlocks
      })
      setSelectedBlockId(newBlock.id)
      markChanged()
    },
    [commitHistory, markChanged],
  )

  const replaceBlocks = useCallback(
    (newBlocks: EditorBlock[], partialSettings?: Partial<ContractSettings>, opts: { commit?: boolean } = {}) => {
      const merged = newBlocks.map((b) => ({ ...b, id: generateId() }))
      setBlocks(merged)
      if (partialSettings) setSettings((prev) => ({ ...prev, ...partialSettings }))
      if (opts.commit !== false) commitHistory(merged)
      setSelectedBlockId(null)
      markChanged()
    },
    [commitHistory, markChanged],
  )

  const updateBlock = useCallback(
    (id: string, updates: Partial<EditorBlock['content']>) => {
      setBlocks((prev) => {
        const newBlocks = prev.map((block) =>
          block.id === id ? { ...block, content: { ...block.content, ...updates } } : block,
        )
        commitHistory(newBlocks)
        return newBlocks
      })
      markChanged()
    },
    [commitHistory, markChanged],
  )

  const deleteBlock = useCallback(
    (id: string) => {
      setBlocks((prev) => {
        const newBlocks = prev.filter((block) => block.id !== id)
        commitHistory(newBlocks)
        return newBlocks
      })
      if (selectedBlockId === id) setSelectedBlockId(null)
      markChanged()
    },
    [selectedBlockId, commitHistory, markChanged],
  )

  const duplicateBlock = useCallback(
    (id: string) => {
      const blockIndex = blocks.findIndex((block) => block.id === id)
      if (blockIndex === -1) return
      const b = blocks[blockIndex]
      const newBlock: EditorBlock = { id: generateId(), type: b.type, content: { ...b.content } }
      setBlocks((prev) => {
        const newBlocks = [...prev.slice(0, blockIndex + 1), newBlock, ...prev.slice(blockIndex + 1)]
        commitHistory(newBlocks)
        return newBlocks
      })
      setSelectedBlockId(newBlock.id)
      markChanged()
    },
    [blocks, commitHistory, markChanged],
  )

  const moveBlock = useCallback(
    (fromIndex: number, toIndex: number) => {
      setBlocks((prev) => {
        const newBlocks = [...prev]
        const [removed] = newBlocks.splice(fromIndex, 1)
        newBlocks.splice(toIndex, 0, removed)
        commitHistory(newBlocks)
        return newBlocks
      })
      markChanged()
    },
    [commitHistory, markChanged],
  )

  const updateSettings = useCallback(
    (updates: Partial<ContractSettings>) => {
      setSettings((prev) => ({ ...prev, ...updates }))
      markChanged()
    },
    [markChanged],
  )

  const saveContract = useCallback(
    async (exit: boolean = false, silent: boolean = false, isDraft?: boolean) => {
      if (savingRef.current) return
      const draftFlipPending =
        isDraft !== undefined && currentIsDraft !== null && isDraft !== currentIsDraft
      if (!hasUnsavedChanges && !silent && !draftFlipPending) {
        toast({ title: 'Already saved', description: 'No changes to save.' })
        if (exit) router.push(LIST_PATH)
        return
      }
      if (!hasUnsavedChanges && silent) return

      savingRef.current = true
      if (silent) setIsAutoSaving(true)
      else setIsSaving(true)

      try {
        const bodyHtml = renderBlocksToHTML(blocks, settings.theme)
        const bodyJson = blocks as unknown as Json
        const trimmedName = (settings.name ?? '').trim()
        const derivedName = trimmedName || 'Untitled contract'

        const data = {
          name: derivedName,
          doc_type: settings.docType,
          theme: (settings.theme ?? null) as unknown as Json | null,
          body_html: bodyHtml,
          body_json: bodyJson,
          updated_at: new Date().toISOString(),
          ...(isDraft !== undefined ? { is_draft: isDraft } : {}),
        }

        if (activeId) {
          const { error } = await supabase.from('contract_templates').update(data).eq('id', activeId)
          if (error) throw error
          if (!silent) toast({ title: 'Contract saved', description: `"${derivedName}" has been updated.` })
        } else {
          const {
            data: { user },
          } = await supabase.auth.getUser()
          const { data: inserted, error } = await supabase
            .from('contract_templates')
            .insert({ ...data, created_by_id: user?.id })
            .select('id')
            .single()
          if (error) throw error
          const newId: string | undefined = inserted?.id
          if (newId) {
            setActiveId(newId)
            router.replace(`${EDITOR_PATH}?id=${newId}`)
          }
          if (!silent) toast({ title: 'Contract created', description: `"${derivedName}" has been saved.` })
        }

        if (derivedName !== settings.name) setSettings((prev) => ({ ...prev, name: derivedName }))
        if (isDraft !== undefined) setCurrentIsDraft(isDraft)
        else if (currentIsDraft === null) setCurrentIsDraft(false)
        setHasUnsavedChanges(false)
        setLastSavedAt(new Date())
        if (exit) router.push(LIST_PATH)
      } catch (error) {
        if (!silent) {
          const e = error as { message?: string; details?: string; hint?: string; code?: string }
          const description = e.details || e.hint || e.message || 'An error occurred'
          toast({
            title: 'Failed to save contract',
            description: e.code ? `${description} (${e.code})` : description,
            variant: 'destructive',
          })
        }
      } finally {
        savingRef.current = false
        setIsSaving(false)
        setIsAutoSaving(false)
      }
    },
    [activeId, blocks, settings, supabase, router, hasUnsavedChanges, currentIsDraft],
  )

  useEffect(() => {
    if (!activeId) return
    if (!hasUnsavedChanges) return
    const handle = window.setTimeout(() => saveContract(false, true), AUTOSAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [hasUnsavedChanges, blocks, settings, activeId, saveContract])

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnsavedChanges])

  return {
    activeId,
    blocks,
    settings,
    selectedBlockId,
    isLoading,
    isSaving,
    isAutoSaving,
    hasUnsavedChanges,
    lastSavedAt,
    setSelectedBlockId,
    addBlock,
    replaceBlocks,
    updateBlock,
    deleteBlock,
    duplicateBlock,
    moveBlock,
    updateSettings,
    undo,
    redo,
    canUndo: history.index > 0,
    canRedo: history.index < history.stack.length - 1,
    saveContract,
  }
}
