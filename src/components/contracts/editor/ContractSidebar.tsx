'use client'

// Contract builder sidebar — a slim copy of the email LeftSidebar. Drops the
// email-only settings (subject / preheader / from-name / category) and adds a
// document-type selector + a hint about inserting signature fields. Reuses the
// shared BlockLibrary and BlockProperties untouched.

import { useState } from 'react'
import { ChevronDown, Settings as SettingsIcon, LayoutGrid, PenLine } from 'lucide-react'
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
import type { EditorBlock, BlockType } from '@/lib/templates/editor-types'
import { EMAIL_FONTS } from '@/lib/templates/editor-types'
import type { ContractSettings } from '@/lib/contracts/editor-types'
import { CONTRACT_DOC_TYPES } from '@/lib/contracts/editor-types'
import { BlockLibrary } from '@/components/templates/editor/BlockLibrary'
import { BlockProperties } from '@/components/templates/editor/BlockProperties'

interface ContractSidebarProps {
  settings: ContractSettings
  onSettingsChange: (updates: Partial<ContractSettings>) => void
  selectedBlock: EditorBlock | null
  onBlockChange: (updates: Record<string, unknown>) => void
  onAddBlock: (type: BlockType) => void
}

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

export function ContractSidebar({
  settings,
  onSettingsChange,
  selectedBlock,
  onBlockChange,
  onAddBlock,
}: ContractSidebarProps) {
  return (
    <div className="overflow-y-auto h-full">
      <Section title="Settings" icon={SettingsIcon} defaultOpen>
        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-xs">Contract name</Label>
            <Input
              value={settings.name}
              onChange={(e) => onSettingsChange({ name: e.target.value })}
              placeholder="Untitled contract"
            />
          </div>
          <div>
            <Label className="text-xs">Document type</Label>
            <Select value={settings.docType} onValueChange={(v) => onSettingsChange({ docType: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTRACT_DOC_TYPES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Default font</Label>
            <Select
              value={settings.theme?.fontFamily || 'default'}
              onValueChange={(v) =>
                onSettingsChange({ theme: { ...settings.theme, fontFamily: v === 'default' ? undefined : v } })
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
          </div>
        </div>
      </Section>

      <Section title="Signature fields" icon={PenLine} defaultOpen>
        <p className="text-[11px] leading-relaxed text-ivory-soft/70">
          Select a text block on the canvas, place your cursor, then click{' '}
          <span className="text-bronze-light font-medium">Insert variable</span> to drop in a
          Signature, Initials, Printed name or Date field — the member fills these when they sign.
        </p>
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
