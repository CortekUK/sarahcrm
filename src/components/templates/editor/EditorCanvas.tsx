'use client'

import { useMemo } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { renderBlocksToHTML } from '@/lib/templates/render-html'
import { replaceMergeTags } from '@/lib/utils-templates/merge-tags-core'
import type { EditorBlock, TemplateTheme } from '@/lib/templates/editor-types'
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
} from 'lucide-react'

interface EditorCanvasProps {
  blocks: EditorBlock[]
  theme?: TemplateTheme | null
  selectedBlockId: string | null
  onSelectBlock: (id: string | null) => void
  onMoveBlock: (from: number, to: number) => void
  onDuplicateBlock: (id: string) => void
  onDeleteBlock: (id: string) => void
}

const SAMPLE_DATA = {
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

export function EditorCanvas({
  blocks,
  theme,
  selectedBlockId,
  onSelectBlock,
  onMoveBlock,
  onDuplicateBlock,
  onDeleteBlock,
}: EditorCanvasProps) {
  // Render each block individually so we can wrap with selection overlays.
  // Use renderBlocksToHTML for a single-element array to keep visuals identical
  // to what the recipient will see, then strip the chrome wrappers.
  const renderedHtmls = useMemo(() => {
    return blocks.map((block) => {
      const html = renderBlocksToHTML([block], theme)
      // Pull out just the body cell content (between the inner content cell and the footer)
      const match = html.match(/<td class="club-content-cell"[^>]*>([\s\S]*?)<\/td>\s*<\/tr>\s*<tr>/)
      const inner = match ? match[1] : html
      return replaceMergeTags(inner, SAMPLE_DATA)
    })
  }, [blocks, theme])

  const isEmpty = blocks.length === 0

  return (
    <div className="max-w-[680px] mx-auto p-6">
      <div className="bg-white border border-[var(--color-border)] rounded-lg shadow-[var(--shadow-card)] overflow-hidden">
        {/* The email-style header strip */}
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

        {/* Block list — drag-and-drop */}
        <DragDropContext
          onDragEnd={(result: DropResult) => {
            if (!result.destination) return
            if (result.source.index === result.destination.index) return
            onMoveBlock(result.source.index, result.destination.index)
          }}
        >
          <Droppable droppableId="canvas-blocks">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                style={{ background: theme?.bodyBgColor || '#FFFFFF', padding: isEmpty ? '24px' : '20px 20px' }}
                className={snapshot.isDraggingOver ? 'bg-[var(--color-gold-muted)]/40' : ''}
              >
                {/* Empty-state drop zone — matches IFG's "Drag blocks here…" */}
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
                      <Columns3 className="w-6 h-6 text-[var(--color-gold)]" />
                    </div>
                    <p className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--color-text)]">
                      Drag blocks here to build your email
                    </p>
                    <p className="text-sm text-[var(--color-text-muted)] mt-1.5">
                      Or click a block in the sidebar to add it
                    </p>
                    <p className="text-xs text-[var(--color-text-dim)] mt-3">
                      Or hit the <span className="font-medium text-[var(--color-gold)]">AI</span> toggle and tell the assistant what you want.
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
                          style={{
                            ...dragProvided.draggableProps.style,
                          }}
                        >
                          {/* Drag handle — visible on hover or when selected */}
                          <div
                            {...dragProvided.dragHandleProps}
                            className={cn(
                              'absolute -left-7 top-1/2 -translate-y-1/2 z-10 transition-opacity p-1 cursor-grab active:cursor-grabbing rounded hover:bg-[var(--color-surface-2)]',
                              isSelected || dragSnapshot.isDragging
                                ? 'opacity-100'
                                : 'opacity-0 group-hover:opacity-100',
                            )}
                            onClick={(e) => e.stopPropagation()}
                            title="Drag to reorder"
                          >
                            <GripVertical className="w-4 h-4 text-[var(--color-text-muted)]" />
                          </div>

                          {/* Block label badge */}
                          {isSelected && (
                            <div className="absolute -top-2.5 left-2 z-10 bg-[var(--color-gold)] text-white text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded">
                              {blockLabels[block.type] ?? block.type}
                            </div>
                          )}

                          {/* Block controls */}
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

                          {/* Block content */}
                          <div
                            // eslint-disable-next-line react/no-danger
                            dangerouslySetInnerHTML={{ __html: renderedHtmls[i] }}
                          />

                          {/* Icon overlay on hover for empty-ish blocks */}
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

        {/* Footer strip */}
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
          <p style={{ margin: '4px 0 8px 0' }}>A private membership community</p>
          <p style={{ margin: 0 }}>
            <a
              href="#"
              style={{
                color: theme?.footerLinkColor || 'var(--color-gold)',
                textDecoration: 'none',
              }}
            >
              Unsubscribe
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
