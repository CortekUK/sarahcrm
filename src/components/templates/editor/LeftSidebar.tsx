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
import { EMAIL_FONTS } from '@/lib/templates/editor-types'
import { BlockLibrary } from './BlockLibrary'
import { BlockProperties } from './BlockProperties'

interface LeftSidebarProps {
  settings: TemplateSettings
  onSettingsChange: (updates: Partial<TemplateSettings>) => void
  selectedBlock: EditorBlock | null
  onBlockChange: (updates: Record<string, unknown>) => void
  onAddBlock: (type: BlockType) => void
}

// Accordion section helper — collapsible SETTINGS / BLOCKS pattern.
// Night-themed: bronze hairline borders, ivory titles, bronze-light
// icons that brighten on hover.
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
    <div className="border-b border-graphite-line/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-bronze/[0.05] transition-colors group"
      >
        <span className="flex items-center gap-2.5 font-[family-name:var(--font-meta)] text-[10.5px] font-medium uppercase tracking-[0.28em] text-ivory group-hover:text-bronze-light transition-colors">
          <Icon className="w-3.5 h-3.5 text-bronze-light" />
          {title}
        </span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-ivory-soft/60 group-hover:text-bronze-light transition-all',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
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
            <Label className="text-xs">Default font</Label>
            <Select
              value={settings.theme?.fontFamily || 'default'}
              onValueChange={(v) =>
                onSettingsChange({
                  theme: { ...settings.theme, fontFamily: v === 'default' ? undefined : v },
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Brand default (DM Sans)</SelectItem>
                {EMAIL_FONTS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-[var(--color-text-dim)] mt-1">
              Applies to the whole email; individual text blocks can override it.
            </p>
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
