'use client'

// Contract canvas — a copy of the email EditorCanvas
// (src/components/templates/editor/EditorCanvas.tsx) with one addition: text
// blocks get an "Insert field" menu that drops a signature field or member
// merge tag exactly at the cursor. The menu never steals focus from the
// contentEditable (all mousedowns are prevented), so insertion happens at the
// live caret via execCommand. The email canvas file is left untouched.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { renderBlocksToHTML } from '@/lib/templates/render-html'
import { replaceMergeTags } from '@/lib/utils-templates/merge-tags-core'
import type {
  EditorBlock,
  TemplateTheme,
  TextBlockContent,
  ButtonBlockContent,
} from '@/lib/templates/editor-types'
import { DEFAULT_EMAIL_FONT, templateVariables } from '@/lib/templates/editor-types'
import { CONTRACT_FIELDS } from '@/lib/contracts/fields'
import { cn } from '@/lib/utils'
import {
  GripVertical,
  Copy,
  Trash2,
  Type,
  Image as ImageIcon,
  MousePointerClick,
  Minus,
  Move,
  Video,
  Share2,
  Code,
  Columns3,
  FileSignature,
  Paperclip,
  PenLine,
  ChevronDown,
} from 'lucide-react'

interface ContractCanvasProps {
  blocks: EditorBlock[]
  theme?: TemplateTheme | null
  selectedBlockId: string | null
  onSelectBlock: (id: string | null) => void
  onMoveBlock: (from: number, to: number) => void
  onDuplicateBlock: (id: string) => void
  onDeleteBlock: (id: string) => void
  onUpdateBlock: (id: string, updates: Partial<EditorBlock['content']>) => void
}

const SAMPLE_DATA = {
  first_name: 'Charlotte',
  last_name: 'Hayes',
  email: 'charlotte@example.com',
  phone: '+44 7700 900123',
  membership_tier: 'Tier 1',
  company_name: 'Hayes & Co.',
  sender_name: 'Sarah Restrick',
  sender_title: 'Founder, The Club',
  month_name: 'March',
  unsubscribe_url: '#',
}

interface VarItem {
  label: string
  value: string
}
const SIGNATURE_ITEMS: VarItem[] = CONTRACT_FIELDS.map((f) => ({ label: f.label, value: f.token }))
const MEMBER_ITEMS: VarItem[] = templateVariables
  .filter((v) => v.category === 'member')
  .map((v) => ({ label: v.label, value: v.value }))

const blockIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  text: Type,
  image: ImageIcon,
  button: MousePointerClick,
  divider: Minus,
  spacer: Move,
  video: Video,
  social: Share2,
  html: Code,
  columns: Columns3,
  sarah_signature: FileSignature,
  file: Paperclip,
}

const blockLabels: Record<string, string> = {
  text: 'Text',
  image: 'Image',
  button: 'Button',
  divider: 'Divider',
  spacer: 'Spacer',
  video: 'Video',
  social: 'Social',
  html: 'HTML',
  columns: 'Columns',
  sarah_signature: 'Signature',
  file: 'File',
}

export function ContractCanvas({
  blocks,
  theme,
  selectedBlockId,
  onSelectBlock,
  onMoveBlock,
  onDuplicateBlock,
  onDeleteBlock,
  onUpdateBlock,
}: ContractCanvasProps) {
  const renderedHtmls = useMemo(() => {
    return blocks.map((block) => {
      const html = renderBlocksToHTML([block], theme)
      const match = html.match(/<td class="club-content-cell"[^>]*>([\s\S]*?)<\/td>\s*<\/tr>\s*<tr>/)
      const inner = match ? match[1] : html
      return replaceMergeTags(inner, SAMPLE_DATA)
    })
  }, [blocks, theme])

  const isEmpty = blocks.length === 0

  return (
    <div className="max-w-[680px] mx-auto p-6">
      <div className="bg-white border border-[var(--color-border)] rounded-lg shadow-[var(--shadow-card)] overflow-hidden">
        <div
          className="px-5 py-6 text-center border-b border-[var(--color-border)]"
          style={{
            background: theme?.headerBgColor || '#FAFAF7',
            color: theme?.headerTextColor || '#2C2825',
          }}
        >
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 600 }}>The Club</div>
          <div
            style={{
              fontFamily: 'var(--font-label)',
              fontSize: 10,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.25em',
              color: 'var(--color-text-muted)',
              marginTop: 4,
            }}
          >
            by Sarah Restrick
          </div>
        </div>

        <DragDropContext
          onDragEnd={(result: DropResult) => {
            if (!result.destination) return
            if (result.source.index === result.destination.index) return
            onMoveBlock(result.source.index, result.destination.index)
          }}
        >
          <Droppable droppableId="contract-blocks">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                style={{ background: theme?.bodyBgColor || '#FFFFFF', padding: isEmpty ? '24px' : '20px 20px' }}
                className={snapshot.isDraggingOver ? 'bg-[var(--color-gold-muted)]/40' : ''}
              >
                {isEmpty && (
                  <div
                    className={cn(
                      'rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-center px-6 py-16 transition-colors',
                      snapshot.isDraggingOver
                        ? 'border-[var(--color-gold)] bg-[var(--color-gold-muted)]'
                        : 'border-[var(--color-border-hover)] bg-[var(--color-surface-2)]',
                    )}
                  >
                    <div className="w-14 h-14 rounded-full bg-[var(--color-gold-muted)] flex items-center justify-center mb-4">
                      <FileSignature className="w-6 h-6 text-[var(--color-gold)]" />
                    </div>
                    <p className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--color-text)]">
                      Build your contract
                    </p>
                    <p className="text-sm text-[var(--color-text-muted)] mt-1.5">
                      Add a text block, then use <span className="font-medium text-[var(--color-gold)]">Insert field</span> to drop in the signature field.
                    </p>
                    <p className="text-xs text-[var(--color-text-dim)] mt-3">
                      Or hit the <span className="font-medium text-[var(--color-gold)]">AI</span> toggle and describe the agreement you need.
                    </p>
                  </div>
                )}
                {blocks.map((block, i) => {
                  const Icon = blockIcons[block.type] ?? Type
                  const isSelected = selectedBlockId === block.id
                  return (
                    <Draggable key={block.id} draggableId={block.id} index={i}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          onClick={() => onSelectBlock(block.id)}
                          className={cn(
                            'group relative my-1 cursor-pointer rounded-md transition-all',
                            isSelected
                              ? 'ring-2 ring-[var(--color-gold)] ring-offset-2'
                              : 'hover:ring-1 hover:ring-[var(--color-border-hover)] hover:ring-offset-2',
                            dragSnapshot.isDragging && 'shadow-xl ring-2 ring-[var(--color-gold)] bg-white',
                          )}
                          style={{ ...dragProvided.draggableProps.style }}
                        >
                          <div
                            {...dragProvided.dragHandleProps}
                            className={cn(
                              'absolute -left-7 top-1/2 -translate-y-1/2 z-10 transition-opacity p-1 cursor-grab active:cursor-grabbing rounded hover:bg-[var(--color-surface-2)]',
                              isSelected || dragSnapshot.isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                            )}
                            onClick={(e) => e.stopPropagation()}
                            title="Drag to reorder"
                          >
                            <GripVertical className="w-4 h-4 text-[var(--color-text-muted)]" />
                          </div>

                          {isSelected && (
                            <div className="absolute -top-2.5 left-2 z-10 bg-[var(--color-gold)] text-white text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded">
                              {blockLabels[block.type] ?? block.type}
                            </div>
                          )}

                          {isSelected && !dragSnapshot.isDragging && (
                            <div className="absolute -top-2.5 right-2 z-10 flex items-center gap-0.5 bg-white border border-[var(--color-border)] shadow-sm rounded-md">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onDuplicateBlock(block.id)
                                }}
                                className="p-1 hover:bg-[var(--color-surface-2)]"
                                title="Duplicate"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onDeleteBlock(block.id)
                                }}
                                className="p-1 hover:bg-[var(--color-surface-2)] text-[var(--color-accent-warm)]"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}

                          {block.type === 'text' ? (
                            <InlineContractTextBlock
                              blockId={block.id}
                              content={block.content as TextBlockContent}
                              defaultFont={theme?.fontFamily || DEFAULT_EMAIL_FONT}
                              selected={isSelected}
                              onChange={(html) => onUpdateBlock(block.id, { html })}
                            />
                          ) : block.type === 'button' ? (
                            <InlineButtonBlock
                              content={block.content as ButtonBlockContent}
                              onChange={(text) => onUpdateBlock(block.id, { text })}
                            />
                          ) : (
                            <div
                              // eslint-disable-next-line react/no-danger
                              dangerouslySetInnerHTML={{ __html: renderedHtmls[i] }}
                            />
                          )}

                          {!isSelected && !dragSnapshot.isDragging && (
                            <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="bg-white/90 border border-[var(--color-border)] rounded p-1">
                                <Icon className="w-3 h-3 text-[var(--color-text-muted)]" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </Draggable>
                  )
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        <div
          className="px-5 py-5 text-center text-xs border-t border-[var(--color-border)]"
          style={{
            background: theme?.footerBgColor || '#F3F0EA',
            color: theme?.footerTextColor || '#6B6560',
          }}
        >
          <p style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 13 }}>
            The Club by Sarah Restrick
          </p>
          <p style={{ margin: '4px 0 0 0' }}>A private membership community</p>
        </div>
      </div>
    </div>
  )
}

function InlineContractTextBlock({
  blockId,
  content,
  defaultFont,
  selected,
  onChange,
}: {
  blockId: string
  content: TextBlockContent
  defaultFont: string
  selected: boolean
  onChange: (html: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const lastHtmlRef = useRef(content.html)
  const savedRangeRef = useRef<Range | null>(null)

  if (ref.current && content.html !== lastHtmlRef.current && ref.current.innerHTML !== content.html) {
    ref.current.innerHTML = content.html
    lastHtmlRef.current = content.html
  }

  const fontSize =
    content.fontSize === 'small' ? 14 : content.fontSize === 'large' ? 18 : content.fontSize === 'xlarge' ? 24 : 16

  const saveSelection = useCallback(() => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
    }
  }, [])

  const flush = useCallback(() => {
    if (!ref.current) return
    const next = ref.current.innerHTML
    if (next !== lastHtmlRef.current) {
      lastHtmlRef.current = next
      onChange(next)
    }
  }, [onChange])

  // Insert a token at the LIVE caret. The menu never steals focus (all its
  // mousedowns are prevented), so the caret is exactly where the user left it.
  const insertToken = useCallback(
    (token: string) => {
      const el = ref.current
      if (!el) return
      el.focus()
      const sel = window.getSelection()
      const saved = savedRangeRef.current
      const liveInside =
        sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer)
      if (!liveInside && saved && el.contains(saved.commonAncestorContainer)) {
        sel?.removeAllRanges()
        sel?.addRange(saved)
      } else if (!liveInside) {
        const r = document.createRange()
        r.selectNodeContents(el)
        r.collapse(false)
        sel?.removeAllRanges()
        sel?.addRange(r)
      }
      document.execCommand('insertText', false, token)
      saveSelection()
      flush()
    },
    [saveSelection, flush],
  )

  return (
    <div className="relative">
      <div
        ref={ref}
        data-ctext={blockId}
        contentEditable
        suppressContentEditableWarning
        onBlur={flush}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          textAlign: content.alignment,
          paddingTop: content.paddingTop,
          paddingBottom: content.paddingBottom,
          fontFamily: content.fontFamily || defaultFont,
          fontSize,
          lineHeight: 1.6,
          color: '#2C2825',
          backgroundColor: content.backgroundColor || undefined,
          outline: 'none',
          minHeight: 24,
          cursor: 'text',
        }}
        dangerouslySetInnerHTML={{ __html: content.html }}
      />
      {selected && <FieldMenu onInsert={insertToken} />}
    </div>
  )
}

// Bottom-right "Insert field" control with an upward menu. Every interactive
// element prevents mousedown so the contentEditable keeps focus + caret.
function FieldMenu({ onInsert }: { onInsert: (token: string) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div
      ref={rootRef}
      className="absolute bottom-2 right-2 z-20"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          setOpen((o) => !o)
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white/95 backdrop-blur-sm px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] shadow-sm hover:text-[var(--color-gold)] hover:border-[var(--color-gold)] transition-colors"
      >
        <PenLine className="w-3.5 h-3.5" />
        Insert field
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-64 rounded-lg border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)] p-1.5 max-h-72 overflow-y-auto">
          <MenuGroup title="Signature fields" hint="Filled by the member when signing" items={SIGNATURE_ITEMS} onInsert={onInsert} setOpen={setOpen} />
          <MenuGroup title="Member fields" hint="Filled from the recipient before sending" items={MEMBER_ITEMS} onInsert={onInsert} setOpen={setOpen} />
        </div>
      )}
    </div>
  )
}

function MenuGroup({
  title,
  hint,
  items,
  onInsert,
  setOpen,
}: {
  title: string
  hint: string
  items: VarItem[]
  onInsert: (token: string) => void
  setOpen: (v: boolean) => void
}) {
  return (
    <div className="mb-1 last:mb-0">
      <div className="px-2 pt-1.5 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{title}</p>
        <p className="text-[10px] text-[var(--color-text-dim)]">{hint}</p>
      </div>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            onInsert(it.value)
            setOpen(false)
          }}
          className="w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-[var(--color-surface-2)] group"
        >
          <span className="text-sm text-[var(--color-text)]">{it.label}</span>
          <span className="text-[10px] font-mono text-[var(--color-text-dim)] group-hover:text-[var(--color-gold)]">
            {it.value}
          </span>
        </button>
      ))}
    </div>
  )
}

function InlineButtonBlock({
  content,
  onChange,
}: {
  content: ButtonBlockContent
  onChange: (text: string) => void
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const lastTextRef = useRef(content.text)

  if (ref.current && content.text !== lastTextRef.current && ref.current.textContent !== content.text) {
    ref.current.textContent = content.text
    lastTextRef.current = content.text
  }

  const widthStyle: React.CSSProperties =
    content.width === 'full'
      ? { display: 'block', width: '100%', textAlign: 'center' }
      : { display: 'inline-block' }

  const handleBlur = useCallback(() => {
    if (!ref.current) return
    const next = ref.current.textContent ?? ''
    if (next !== lastTextRef.current) {
      lastTextRef.current = next
      onChange(next)
    }
  }, [onChange])

  return (
    <div
      style={{ textAlign: content.alignment, paddingTop: content.paddingTop, paddingBottom: content.paddingBottom }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span
        style={{
          ...widthStyle,
          backgroundColor: content.backgroundColor,
          color: content.textColor,
          padding: `${content.paddingY || 12}px ${content.paddingX || 24}px`,
          borderRadius: content.borderRadius,
          fontFamily: "'DM Sans', Arial, sans-serif",
          fontWeight: 500,
          fontSize: 14,
          letterSpacing: '0.3px',
          cursor: 'text',
        }}
      >
        <span ref={ref} contentEditable suppressContentEditableWarning onBlur={handleBlur} style={{ outline: 'none' }}>
          {content.text}
        </span>
      </span>
    </div>
  )
}
