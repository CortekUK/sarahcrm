'use client'

import { useState, useCallback, useEffect, type ReactNode } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Reorderable {
  id: string
  display_order: number
}

interface SortableListProps<T extends Reorderable> {
  items: T[]
  /** Called once after a drop. Receives the new full ordering (including new
   *  display_order values) so the caller can persist + reflect. */
  onReorder: (next: T[]) => Promise<void> | void
  /** Render each row. The renderer's outer element should NOT include its
   *  own onClick that conflicts with drag-handle interactions. */
  renderItem: (item: T, dragHandleProps: object) => ReactNode
  /** Optional extra class on the droppable wrapper. */
  className?: string
}

// Drag-to-reorder wrapper for admin list tables. Owns the dnd state, gives
// the caller a {drag handle props} bag to attach to its grip icon, and
// after a drop emits the rewritten list with new display_order values.
//
// The reorder is OPTIMISTIC — the visible order updates instantly, then the
// caller persists in the background. On a persist failure the caller should
// re-fetch or revert.
export function SortableList<T extends Reorderable>({
  items,
  onReorder,
  renderItem,
  className,
}: SortableListProps<T>) {
  const [localItems, setLocalItems] = useState<T[] | null>(null)
  const visible = localItems ?? items

  // Reset local override whenever the upstream items change shape (count,
  // identities). Without this, optimistic ordering would stick even after
  // the server returned a different list (e.g. after delete or insert).
  useEffect(() => {
    setLocalItems(null)
  }, [items])

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return
      if (result.source.index === result.destination.index) return
      const next = [...visible]
      const [moved] = next.splice(result.source.index, 1)
      next.splice(result.destination.index, 0, moved)
      const rewritten = next.map((item, i) => ({ ...item, display_order: i }))
      setLocalItems(rewritten)
      Promise.resolve(onReorder(rewritten)).catch(() => {
        // Revert on persistence failure
        setLocalItems(null)
      })
    },
    [visible, onReorder],
  )

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="sortable-list">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className={className}>
            {visible.map((item, i) => (
              <Draggable key={item.id} draggableId={item.id} index={i}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    className={cn(
                      'transition-shadow',
                      dragSnapshot.isDragging &&
                        'bg-surface-2 shadow-[var(--shadow-lg)] ring-1 ring-gold/40',
                    )}
                  >
                    {renderItem(item, dragProvided.dragHandleProps ?? {})}
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  )
}

// Reusable grip-handle icon — used inside renderItem to attach the drag
// handle props. Pulled out so every page's drag handle has identical
// styling (subtle, gold on hover, with grab cursor).
export function DragHandle({ dragHandleProps }: { dragHandleProps: object }) {
  return (
    <div
      {...dragHandleProps}
      className="text-text-dim hover:text-gold transition-colors cursor-grab active:cursor-grabbing p-1 -ml-1"
      title="Drag to reorder"
    >
      <GripVertical size={14} />
    </div>
  )
}
