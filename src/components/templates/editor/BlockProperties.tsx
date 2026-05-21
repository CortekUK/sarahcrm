'use client'

import { useCallback } from 'react'
import { Input } from '@/components/ui-shadcn/input'
import { Textarea } from '@/components/ui-shadcn/textarea'
import { Label } from '@/components/ui-shadcn/label'
import { Switch } from '@/components/ui-shadcn/switch'
import { Slider } from '@/components/ui-shadcn/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui-shadcn/select'
import type {
  EditorBlock,
  TextBlockContent,
  ButtonBlockContent,
  ImageBlockContent,
  DividerBlockContent,
  SpacerBlockContent,
  SarahSignatureBlockContent,
  HTMLBlockContent,
  VideoBlockContent,
  SocialBlockContent,
} from '@/lib/templates/editor-types'

interface BlockPropertiesProps {
  block: EditorBlock | null
  onChange: (updates: Record<string, unknown>) => void
}

export function BlockProperties({ block, onChange }: BlockPropertiesProps) {
  const update = useCallback(
    (updates: Record<string, unknown>) => onChange(updates),
    [onChange],
  )

  if (!block) {
    return (
      <div className="p-4 text-center text-sm text-[var(--color-text-dim)]">
        Select a block on the canvas to edit its properties.
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      <div className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        {block.type.replace('_', ' ')} block
      </div>

      {block.type === 'text' && <TextProps block={block.content as TextBlockContent} update={update} />}
      {block.type === 'button' && <ButtonProps block={block.content as ButtonBlockContent} update={update} />}
      {block.type === 'image' && <ImageProps block={block.content as ImageBlockContent} update={update} />}
      {block.type === 'divider' && <DividerProps block={block.content as DividerBlockContent} update={update} />}
      {block.type === 'spacer' && <SpacerProps block={block.content as SpacerBlockContent} update={update} />}
      {block.type === 'sarah_signature' && (
        <SignatureProps block={block.content as SarahSignatureBlockContent} update={update} />
      )}
      {block.type === 'html' && <HtmlProps block={block.content as HTMLBlockContent} update={update} />}
      {block.type === 'video' && <VideoProps block={block.content as VideoBlockContent} update={update} />}
      {block.type === 'social' && <SocialProps block={block.content as SocialBlockContent} update={update} />}
      {block.type === 'columns' && (
        <div className="text-sm text-[var(--color-text-dim)]">Columns are edited via the AI panel — ask it to tweak the layout.</div>
      )}
    </div>
  )
}

function AlignmentSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="left">Left</SelectItem>
        <SelectItem value="center">Center</SelectItem>
        <SelectItem value="right">Right</SelectItem>
      </SelectContent>
    </Select>
  )
}

function PaddingControls({
  top,
  bottom,
  onChange,
}: {
  top: number
  bottom: number
  onChange: (p: { paddingTop?: number; paddingBottom?: number }) => void
}) {
  return (
    <>
      <div>
        <Label className="text-xs">Padding Top — {top}px</Label>
        <Slider
          value={[top]}
          min={0}
          max={80}
          step={2}
          onValueChange={(v) => onChange({ paddingTop: v[0] })}
        />
      </div>
      <div>
        <Label className="text-xs">Padding Bottom — {bottom}px</Label>
        <Slider
          value={[bottom]}
          min={0}
          max={80}
          step={2}
          onValueChange={(v) => onChange({ paddingBottom: v[0] })}
        />
      </div>
    </>
  )
}

function TextProps({ block, update }: { block: TextBlockContent; update: (u: Record<string, unknown>) => void }) {
  return (
    <>
      <div>
        <Label className="text-xs">Content (HTML allowed)</Label>
        <Textarea
          value={block.html}
          onChange={(e) => update({ html: e.target.value })}
          rows={6}
        />
      </div>
      <div>
        <Label className="text-xs">Alignment</Label>
        <AlignmentSelect value={block.alignment} onChange={(v) => update({ alignment: v })} />
      </div>
      <div>
        <Label className="text-xs">Font size</Label>
        <Select value={block.fontSize} onValueChange={(v) => update({ fontSize: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="small">Small</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="large">Large</SelectItem>
            <SelectItem value="xlarge">XLarge</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Background colour</Label>
        <Input
          type="text"
          value={block.backgroundColor ?? ''}
          placeholder="#FAFAF7"
          onChange={(e) => update({ backgroundColor: e.target.value || undefined })}
        />
      </div>
      <PaddingControls top={block.paddingTop} bottom={block.paddingBottom} onChange={update} />
    </>
  )
}

function ButtonProps({ block, update }: { block: ButtonBlockContent; update: (u: Record<string, unknown>) => void }) {
  return (
    <>
      <div>
        <Label className="text-xs">Label</Label>
        <Input value={block.text} onChange={(e) => update({ text: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">URL</Label>
        <Input value={block.url} onChange={(e) => update({ url: e.target.value })} placeholder="https://..." />
      </div>
      <div>
        <Label className="text-xs">Background colour</Label>
        <Input
          type="text"
          value={block.backgroundColor}
          onChange={(e) => update({ backgroundColor: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Text colour</Label>
        <Input
          type="text"
          value={block.textColor}
          onChange={(e) => update({ textColor: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Border radius — {block.borderRadius}px</Label>
        <Slider
          value={[block.borderRadius]}
          min={0}
          max={40}
          step={1}
          onValueChange={(v) => update({ borderRadius: v[0] })}
        />
      </div>
      <div>
        <Label className="text-xs">Width</Label>
        <Select value={block.width} onValueChange={(v) => update({ width: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="50">50%</SelectItem>
            <SelectItem value="75">75%</SelectItem>
            <SelectItem value="full">Full</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Alignment</Label>
        <AlignmentSelect value={block.alignment} onChange={(v) => update({ alignment: v })} />
      </div>
      <PaddingControls top={block.paddingTop} bottom={block.paddingBottom} onChange={update} />
    </>
  )
}

function ImageProps({ block, update }: { block: ImageBlockContent; update: (u: Record<string, unknown>) => void }) {
  return (
    <>
      <div>
        <Label className="text-xs">Source URL</Label>
        <Input value={block.src} onChange={(e) => update({ src: e.target.value })} placeholder="https://..." />
      </div>
      <div>
        <Label className="text-xs">Alt text</Label>
        <Input value={block.alt} onChange={(e) => update({ alt: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">Link URL (optional)</Label>
        <Input
          value={block.linkUrl ?? ''}
          onChange={(e) => update({ linkUrl: e.target.value || undefined })}
        />
      </div>
      <div>
        <Label className="text-xs">Width</Label>
        <Select value={block.width} onValueChange={(v) => update({ width: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="100">Full</SelectItem>
            <SelectItem value="75">Large (75%)</SelectItem>
            <SelectItem value="50">Medium (50%)</SelectItem>
            <SelectItem value="25">Small (25%)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Alignment</Label>
        <AlignmentSelect value={block.alignment} onChange={(v) => update({ alignment: v })} />
      </div>
      <PaddingControls top={block.paddingTop} bottom={block.paddingBottom} onChange={update} />
    </>
  )
}

function DividerProps({ block, update }: { block: DividerBlockContent; update: (u: Record<string, unknown>) => void }) {
  return (
    <>
      <div>
        <Label className="text-xs">Style</Label>
        <Select value={block.style} onValueChange={(v) => update({ style: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid</SelectItem>
            <SelectItem value="dashed">Dashed</SelectItem>
            <SelectItem value="dotted">Dotted</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Colour</Label>
        <Input value={block.color} onChange={(e) => update({ color: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">Thickness — {block.thickness}px</Label>
        <Slider
          value={[block.thickness]}
          min={1}
          max={8}
          step={1}
          onValueChange={(v) => update({ thickness: v[0] })}
        />
      </div>
      <div>
        <Label className="text-xs">Width</Label>
        <Select value={block.width} onValueChange={(v) => update({ width: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="100">100%</SelectItem>
            <SelectItem value="75">75%</SelectItem>
            <SelectItem value="50">50%</SelectItem>
            <SelectItem value="25">25%</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <PaddingControls top={block.paddingTop} bottom={block.paddingBottom} onChange={update} />
    </>
  )
}

function SpacerProps({ block, update }: { block: SpacerBlockContent; update: (u: Record<string, unknown>) => void }) {
  return (
    <div>
      <Label className="text-xs">Height — {block.height}px</Label>
      <Slider
        value={[block.height]}
        min={8}
        max={80}
        step={2}
        onValueChange={(v) => update({ height: v[0] })}
      />
    </div>
  )
}

function SignatureProps({
  block,
  update,
}: {
  block: SarahSignatureBlockContent
  update: (u: Record<string, unknown>) => void
}) {
  return (
    <>
      <ToggleRow label="Sign-off line" value={block.showSignOff ?? true} onChange={(v) => update({ showSignOff: v })} />
      {(block.showSignOff ?? true) && (
        <div>
          <Label className="text-xs">Sign-off text</Label>
          <Input
            value={block.signOff ?? 'Warm regards,'}
            onChange={(e) => update({ signOff: e.target.value })}
          />
        </div>
      )}
      <ToggleRow label="Name" value={block.showName} onChange={(v) => update({ showName: v })} />
      <ToggleRow label="Title" value={block.showTitle} onChange={(v) => update({ showTitle: v })} />
      <ToggleRow label="Email" value={block.showEmail} onChange={(v) => update({ showEmail: v })} />
      <ToggleRow label="Phone" value={block.showPhone} onChange={(v) => update({ showPhone: v })} />
      <ToggleRow label="Website" value={block.showWebsite} onChange={(v) => update({ showWebsite: v })} />
      <div>
        <Label className="text-xs">Alignment</Label>
        <AlignmentSelect value={block.alignment} onChange={(v) => update({ alignment: v })} />
      </div>
      <div>
        <Label className="text-xs">Variable details colour</Label>
        <Input
          value={block.textColor ?? ''}
          placeholder="default"
          onChange={(e) => update({ textColor: e.target.value || null })}
        />
      </div>
      <div>
        <Label className="text-xs">Brand line colour</Label>
        <Input
          value={block.companyTextColor ?? ''}
          placeholder="default"
          onChange={(e) => update({ companyTextColor: e.target.value || null })}
        />
      </div>
      <div>
        <Label className="text-xs">Confidentiality colour</Label>
        <Input
          value={block.confidentialityColor ?? ''}
          placeholder="default"
          onChange={(e) => update({ confidentialityColor: e.target.value || null })}
        />
      </div>
      <PaddingControls top={block.paddingTop} bottom={block.paddingBottom} onChange={update} />
    </>
  )
}

function HtmlProps({ block, update }: { block: HTMLBlockContent; update: (u: Record<string, unknown>) => void }) {
  return (
    <div>
      <Label className="text-xs">HTML (sanitised on save)</Label>
      <Textarea
        value={block.code}
        onChange={(e) => update({ code: e.target.value })}
        rows={10}
        className="font-mono text-xs"
      />
    </div>
  )
}

function VideoProps({ block, update }: { block: VideoBlockContent; update: (u: Record<string, unknown>) => void }) {
  return (
    <>
      <div>
        <Label className="text-xs">Video URL (YouTube / Vimeo / Loom)</Label>
        <Input value={block.url} onChange={(e) => update({ url: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">Alignment</Label>
        <AlignmentSelect value={block.alignment} onChange={(v) => update({ alignment: v })} />
      </div>
    </>
  )
}

function SocialProps({ block, update }: { block: SocialBlockContent; update: (u: Record<string, unknown>) => void }) {
  const platforms = block.platforms
  return (
    <>
      {(['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok', 'threads', 'flickr'] as const).map((key) => (
        <div key={key} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs capitalize">{key}</Label>
            <Switch
              checked={platforms[key]?.enabled ?? false}
              onCheckedChange={(v) =>
                update({
                  platforms: { ...platforms, [key]: { ...platforms[key], enabled: v } },
                })
              }
            />
          </div>
          {platforms[key]?.enabled && (
            <Input
              value={platforms[key]?.url ?? ''}
              placeholder="https://..."
              onChange={(e) =>
                update({
                  platforms: { ...platforms, [key]: { ...platforms[key], url: e.target.value } },
                })
              }
            />
          )}
        </div>
      ))}
      <div>
        <Label className="text-xs">Icon style</Label>
        <Select value={block.style} onValueChange={(v) => update({ style: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="monochrome">Monochrome</SelectItem>
            <SelectItem value="coloured">Coloured</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Alignment</Label>
        <AlignmentSelect value={block.alignment} onChange={(v) => update({ alignment: v })} />
      </div>
    </>
  )
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs">{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  )
}
