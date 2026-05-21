'use client'

import {
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
} from 'lucide-react'
import type { BlockType } from '@/lib/templates/editor-types'

interface BlockLibraryProps {
  onAdd: (type: BlockType) => void
}

const ITEMS: { type: BlockType; label: string; description: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'text', label: 'Text', description: 'Paragraph copy', Icon: Type },
  { type: 'button', label: 'Button', description: 'Call-to-action', Icon: MousePointerClick },
  { type: 'image', label: 'Image', description: 'Photo or graphic', Icon: ImageIcon },
  { type: 'divider', label: 'Divider', description: 'Section break', Icon: Minus },
  { type: 'spacer', label: 'Spacer', description: 'Vertical space', Icon: Move },
  { type: 'sarah_signature', label: 'Signature', description: 'Sarah Restrick sign-off', Icon: FileSignature },
  { type: 'columns', label: 'Columns', description: '2 or 3 columns', Icon: Columns3 },
  { type: 'social', label: 'Social', description: 'Social icons', Icon: Share2 },
  { type: 'video', label: 'Video', description: 'YouTube / Vimeo', Icon: Video },
  { type: 'html', label: 'HTML', description: 'Custom HTML', Icon: Code },
]

export function BlockLibrary({ onAdd }: BlockLibraryProps) {
  return (
    <div className="pt-1">
      <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--color-text-dim)] mb-2">
        Content
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {ITEMS.map((item) => (
          <button
            key={item.type}
            onClick={() => onAdd(item.type)}
            className="flex flex-col items-start gap-1 p-2.5 rounded-md border border-[var(--color-border)] bg-white hover:border-[var(--color-gold)] hover:bg-[var(--color-gold-muted)] transition-colors text-left group"
          >
            <item.Icon className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-gold)]" />
            <span className="text-xs font-medium text-[var(--color-text)] leading-tight">{item.label}</span>
            <span className="text-[10px] text-[var(--color-text-dim)] leading-tight">{item.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
