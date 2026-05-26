'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/lib/hooks/use-toast'
import { renderBlocksToHTML } from '@/lib/templates/render-html'
import {
  EditorBlock,
  BlockType,
  TemplateSettings,
  defaultTemplateSettings,
  defaultBlockContent,
} from '@/lib/templates/editor-types'

const AUTOSAVE_DEBOUNCE_MS = 2500
const HISTORY_COALESCE_MS = 600

interface HistoryState {
  stack: EditorBlock[][]
  index: number
  lastCommitAt: number
}

function generateId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function useEmailEditor(templateId?: string) {
  const router = useRouter()
  const supabase = createClient()

  const [blocks, setBlocks] = useState<EditorBlock[]>([])
  const [settings, setSettings] = useState<TemplateSettings>(defaultTemplateSettings)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(!!templateId)
  const [isSaving, setIsSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [isAutoSaving, setIsAutoSaving] = useState(false)

  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(
    templateId ?? null,
  )
  useEffect(() => {
    setActiveTemplateId(templateId ?? null)
  }, [templateId])

  // The current is_draft state of the loaded row, so Save & Exit can
  // detect when it needs to force-save (publish/unpublish) even if the
  // user made zero block edits.
  const [currentIsDraft, setCurrentIsDraft] = useState<boolean | null>(null)

  const savingRef = useRef(false)

  const [history, setHistory] = useState<HistoryState>({
    stack: [[]],
    index: 0,
    lastCommitAt: 0,
  })

  const markChanged = useCallback(() => {
    setHasUnsavedChanges(true)
  }, [])

  const commitHistory = useCallback((newBlocks: EditorBlock[]) => {
    setHistory((prev) => {
      const trimmed = prev.stack.slice(0, prev.index + 1)
      const head = trimmed[trimmed.length - 1]
      if (head && JSON.stringify(head) === JSON.stringify(newBlocks)) return prev
      const now = Date.now()
      const shouldCoalesce =
        trimmed.length > 0 && now - prev.lastCommitAt < HISTORY_COALESCE_MS
      if (shouldCoalesce) {
        const merged = [...trimmed.slice(0, -1), newBlocks]
        return { stack: merged, index: merged.length - 1, lastCommitAt: now }
      }
      const appended = [...trimmed, newBlocks]
      return { stack: appended, index: appended.length - 1, lastCommitAt: now }
    })
  }, [])

  useEffect(() => {
    if (templateId) {
      loadTemplate(templateId)
    } else {
      setHistory({ stack: [[]], index: 0, lastCommitAt: 0 })
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId])

  const loadTemplate = async (id: string) => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('email_templates')
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
          } catch (parseError) {
            console.error('Failed to parse body_json:', parseError)
            loadedBlocks = []
          }
        }
        let loadedTheme: TemplateSettings['theme'] = undefined
        if (data.theme && typeof data.theme === 'object') {
          loadedTheme = data.theme as TemplateSettings['theme']
        }
        const loadedSettings: TemplateSettings = {
          name: data.name || 'Untitled Template',
          subject: data.subject || '',
          preheader: data.preheader || '',
          fromNameType: (data.from_name_type === 'fixed' ? 'fixed' : 'sender'),
          fixedFromName: data.fixed_from_name || '',
          fixedFromEmail: data.fixed_from_email || '',
          category: (data.category || 'campaign') as TemplateSettings['category'],
          theme: loadedTheme,
        }
        setBlocks(loadedBlocks)
        setSettings(loadedSettings)
        setHistory({ stack: [loadedBlocks], index: 0, lastCommitAt: 0 })
        setCurrentIsDraft(Boolean(data.is_draft))
      }
    } catch (error) {
      console.error('Failed to load template:', error)
      toast({
        title: 'Failed to load template',
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
      const newBlock: EditorBlock = {
        id: generateId(),
        type,
        content: { ...defaultBlockContent[type] },
      }
      setBlocks((prev) => {
        const newBlocks =
          index !== undefined
            ? [...prev.slice(0, index), newBlock, ...prev.slice(index)]
            : [...prev, newBlock]
        commitHistory(newBlocks)
        return newBlocks
      })
      setSelectedBlockId(newBlock.id)
      markChanged()
    },
    [commitHistory, markChanged],
  )

  const replaceBlocks = useCallback(
    (
      newBlocks: EditorBlock[],
      partialSettings?: Partial<TemplateSettings>,
      opts: { commit?: boolean } = {},
    ) => {
      const merged = newBlocks.map((b) => ({ ...b, id: generateId() }))
      setBlocks(merged)
      if (partialSettings) setSettings((prev) => ({ ...prev, ...partialSettings }))
      if (opts.commit !== false) commitHistory(merged)
      setSelectedBlockId(null)
      markChanged()
    },
    [commitHistory, markChanged],
  )

  const addBlockFromModule = useCallback(
    (block: EditorBlock, index?: number) => {
      const newBlock: EditorBlock = { ...block, id: generateId() }
      setBlocks((prev) => {
        const newBlocks =
          index !== undefined
            ? [...prev.slice(0, index), newBlock, ...prev.slice(index)]
            : [...prev, newBlock]
        commitHistory(newBlocks)
        return newBlocks
      })
      setSelectedBlockId(newBlock.id)
      markChanged()
    },
    [commitHistory, markChanged],
  )

  const updateBlock = useCallback(
    (id: string, updates: Partial<EditorBlock['content']>) => {
      setBlocks((prev) => {
        const newBlocks = prev.map((block) =>
          block.id === id
            ? { ...block, content: { ...block.content, ...updates } }
            : block,
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
      const blockToDuplicate = blocks[blockIndex]
      const newBlock: EditorBlock = {
        id: generateId(),
        type: blockToDuplicate.type,
        content: { ...blockToDuplicate.content },
      }
      setBlocks((prev) => {
        const newBlocks = [
          ...prev.slice(0, blockIndex + 1),
          newBlock,
          ...prev.slice(blockIndex + 1),
        ]
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
    (updates: Partial<TemplateSettings>) => {
      setSettings((prev) => ({ ...prev, ...updates }))
      markChanged()
    },
    [markChanged],
  )

  const saveTemplate = useCallback(
    async (exit: boolean = false, silent: boolean = false, isDraft?: boolean) => {
      if (savingRef.current) {
        if (exit && !silent) return
        return
      }
      // If isDraft is explicitly passed and would flip the row's
      // current draft state, force the save even when there are no
      // content changes — that's the user clicking Publish / Save Draft
      // to flip the badge, which needs to hit the DB.
      const draftFlipPending =
        isDraft !== undefined &&
        currentIsDraft !== null &&
        isDraft !== currentIsDraft
      if (!hasUnsavedChanges && !silent && !draftFlipPending) {
        toast({ title: 'Already saved', description: 'No changes to save.' })
        if (exit) router.push('/dashboard/communications/templates')
        return
      }
      if (!hasUnsavedChanges && silent) return

      savingRef.current = true
      if (silent) setIsAutoSaving(true)
      else setIsSaving(true)

      try {
        const bodyHtml = renderBlocksToHTML(blocks, settings.theme)
        // Cast to unknown — EditorBlock has an open `content: Record<string, any>`
        // shape that doesn't formally satisfy the generated Json index-signature
        // type, but Postgres stores it as JSONB just fine.
        const bodyJson = blocks as unknown as import('@/types/database').Json

        const trimmedName = (settings.name ?? '').trim()
        const isDefaultName = !trimmedName || trimmedName === 'Untitled Template'
        const derivedName = (() => {
          if (!isDefaultName) return trimmedName
          const subject = (settings.subject ?? '').trim()
          if (subject) return subject.slice(0, 80)
          return 'Untitled Template'
        })()

        const templateData = {
          name: derivedName,
          subject: settings.subject ?? '',
          preheader: settings.preheader ?? '',
          from_name_type: settings.fromNameType,
          fixed_from_name: settings.fromNameType === 'fixed' ? settings.fixedFromName : null,
          fixed_from_email: settings.fromNameType === 'fixed' ? settings.fixedFromEmail : null,
          category: settings.category,
          theme: (settings.theme ?? null) as unknown as import('@/types/database').Json | null,
          body_html: bodyHtml,
          body_json: bodyJson,
          updated_at: new Date().toISOString(),
          ...(isDraft !== undefined ? { is_draft: isDraft } : {}),
        }

        if (activeTemplateId) {
          const { error } = await supabase
            .from('email_templates')
            .update(templateData)
            .eq('id', activeTemplateId)
          if (error) throw error
          if (!silent) {
            toast({ title: 'Template saved', description: `"${derivedName}" has been updated.` })
          }
        } else {
          const {
            data: { user },
          } = await supabase.auth.getUser()
          const { data, error } = await supabase
            .from('email_templates')
            .insert({ ...templateData, created_by_id: user?.id })
            .select('id')
            .single()
          if (error) throw error
          const newId: string | undefined = data?.id
          if (newId) {
            setActiveTemplateId(newId)
            router.replace(`/dashboard/communications/templates/editor?id=${newId}`)
          }
          if (!silent) {
            toast({ title: 'Template created', description: `"${derivedName}" has been saved.` })
          }
        }

        if (derivedName !== settings.name) {
          setSettings((prev) => ({ ...prev, name: derivedName }))
        }
        if (isDraft !== undefined) setCurrentIsDraft(isDraft)
        else if (currentIsDraft === null) setCurrentIsDraft(false) // newly created via Save & Exit defaults to published
        setHasUnsavedChanges(false)
        setLastSavedAt(new Date())
        if (exit) router.push('/dashboard/communications/templates')
      } catch (error) {
        console.error('[useEmailEditor.saveTemplate] failed:', error)
        if (!silent) {
          const e = error as { message?: string; details?: string; hint?: string; code?: string }
          const description = e.details || e.hint || e.message || 'An error occurred'
          toast({
            title: 'Failed to save template',
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
    [activeTemplateId, blocks, settings, supabase, router, hasUnsavedChanges, currentIsDraft],
  )

  useEffect(() => {
    if (!activeTemplateId) return
    if (!hasUnsavedChanges) return
    const handle = window.setTimeout(() => {
      saveTemplate(false, true)
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [hasUnsavedChanges, blocks, settings, activeTemplateId, saveTemplate])

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnsavedChanges])

  const closeEditor = useCallback(() => {
    if (hasUnsavedChanges) return false
    router.push('/dashboard/communications/templates')
    return true
  }, [hasUnsavedChanges, router])

  return {
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
    addBlockFromModule,
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
    saveTemplate,
    closeEditor,
  }
}
