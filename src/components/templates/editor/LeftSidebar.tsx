'use client'

import { useState } from 'react'
import { ChevronDown, Settings as SettingsIcon, LayoutGrid } from 'lucide-react'
import { Input } from '@/components/ui-shadcn/input'
import { Label } from '@/components/ui-shadcn/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui-shadcn/select'
import { cn } from '@/lib/utils'
import type {
  TemplateSettings,
  EditorBlock,
  BlockType,
} from '@/lib/templates/editor-types'
import { BlockLibrary } from './BlockLibrary'
import { BlockProperties } from './BlockProperties'

interface LeftSidebarProps {
  settings: TemplateSettings
  onSettingsChange: (updates: Partial<TemplateSettings>) => void
  selectedBlock: EditorBlock | null
  onBlockChange: (updates: Record<string, unknown>) => void
  onAddBlock: (type: BlockType) => void
}

// Accordion section helper — matches IFG's collapsible SETTINGS / BLOCKS
// pattern (image 2 of the spec).
function Section({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-[var(--color-border)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-[var(--color-surface-2)] transition-colors"
      >
        <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-text)]">
          <Icon className="w-3.5 h-3.5 text-[var(--color-gold)]" />
          {title}
        </span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-[var(--color-text-muted)] transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  )
}

export function LeftSidebar({
  settings,
  onSettingsChange,
  selectedBlock,
  onBlockChange,
  onAddBlock,
}: LeftSidebarProps) {
  return (
    <div className="overflow-y-auto h-full">
      <Section title="Settings" icon={SettingsIcon} defaultOpen>
        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-xs">Template name</Label>
            <Input
              value={settings.name}
              onChange={(e) => onSettingsChange({ name: e.target.value })}
              placeholder="Untitled Template"
            />
          </div>
          <div>
            <Label className="text-xs">Subject line</Label>
            <Input
              value={settings.subject}
              onChange={(e) => onSettingsChange({ subject: e.target.value })}
              placeholder="e.g. Your spot for Spring Salon Supper"
            />
            <p className="text-[10px] text-[var(--color-text-dim)] mt-1">
              Use {'{{first_name}}'} for merge tags
            </p>
          </div>
          <div>
            <Label className="text-xs">Preheader</Label>
            <Input
              value={settings.preheader}
              onChange={(e) => onSettingsChange({ preheader: e.target.value })}
              placeholder="Preview text shown in inbox"
            />
          </div>
          <div>
            <Label className="text-xs">From name</Label>
            <Select
              value={settings.fromNameType}
              onValueChange={(v: 'sender' | 'fixed') => onSettingsChange({ fromNameType: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sender">Current sender (Sarah)</SelectItem>
                <SelectItem value="fixed">Fixed name + email</SelectItem>
              </SelectContent>
            </Select>
            {settings.fromNameType === 'fixed' && (
              <div className="space-y-2 mt-2">
                <Input
                  value={settings.fixedFromName}
                  onChange={(e) => onSettingsChange({ fixedFromName: e.target.value })}
                  placeholder="From name"
                />
                <Input
                  value={settings.fixedFromEmail}
                  onChange={(e) => onSettingsChange({ fixedFromEmail: e.target.value })}
                  placeholder="from@example.com"
                />
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select
              value={settings.category}
              onValueChange={(v: 'automation' | 'campaign' | 'transactional') =>
                onSettingsChange({ category: v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="campaign">Campaign</SelectItem>
                <SelectItem value="automation">Automation</SelectItem>
                <SelectItem value="transactional">Transactional</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Section title="Blocks" icon={LayoutGrid} defaultOpen>
        <BlockLibrary onAdd={onAddBlock} />
      </Section>

      {selectedBlock && (
        <Section title={`Edit: ${selectedBlock.type.replace('_', ' ')}`} icon={SettingsIcon}>
          <BlockProperties block={selectedBlock} onChange={onBlockChange} />
        </Section>
      )}
    </div>
  )
}
