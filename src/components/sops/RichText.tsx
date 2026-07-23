'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { sanitizeSopHtml } from '@/lib/sops'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Quote,
  Link2,
  Eraser,
} from 'lucide-react'

// Shared prose styling for rendered SOP bodies (theme-token based, day+night).
const PROSE =
  'text-sm leading-relaxed text-text [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ' +
  '[&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-text [&_h1]:mt-3 [&_h1]:mb-1 ' +
  '[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-text [&_h2]:mt-3 [&_h2]:mb-1 ' +
  '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-text-muted [&_h3]:mt-2.5 [&_h3]:mb-1 ' +
  '[&_p]:my-1.5 [&_div]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5 ' +
  '[&_li]:my-0.5 [&_a]:text-gold [&_a]:underline [&_strong]:font-semibold ' +
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-text-muted [&_blockquote]:my-1.5 ' +
  '[&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_hr]:my-3 [&_hr]:border-border'

// Renders a sanitized rich-text HTML body. Sanitized on every render with
// isomorphic-dompurify (see sanitizeSopHtml) — never trusts stored HTML.
export function RichTextRenderer({
  html,
  className,
}: {
  html: string | null | undefined
  className?: string
}) {
  const clean = sanitizeSopHtml(html)
  if (!clean) {
    return <p className={cn('text-sm text-text-dim italic', className)}>No content yet.</p>
  }
  return (
    <div
      className={cn(PROSE, className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}

interface ToolbarBtn {
  icon: typeof Bold
  label: string
  run: () => void
}

// A lightweight contentEditable rich-text editor with a basic formatting
// toolbar. Emits HTML via onChange; the HTML is sanitized again on save and on
// render, so the editor output is never trusted raw.
export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write the procedure…',
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  // Sync incoming value only when it diverges from the live DOM (e.g. opening
  // the editor for a different SOP) — avoids clobbering the caret while typing.
  useEffect(() => {
    const el = ref.current
    if (el && el.innerHTML !== value) el.innerHTML = value || ''
  }, [value])

  function emit() {
    if (ref.current) onChange(ref.current.innerHTML)
  }

  function exec(command: string, arg?: string) {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    emit()
  }

  // The link modal steals focus from the editor, so we stash the current
  // selection when it opens and restore it before applying the link.
  function openLinkModal() {
    const sel = window.getSelection()
    savedRange.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null
    setLinkUrl('')
    setLinkOpen(true)
  }

  function applyLink() {
    const url = linkUrl.trim()
    setLinkOpen(false)
    if (!url) return
    ref.current?.focus()
    const sel = window.getSelection()
    if (sel && savedRange.current) {
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }
    document.execCommand('createLink', false, url)
    emit()
  }

  const buttons: ToolbarBtn[] = [
    { icon: Bold, label: 'Bold', run: () => exec('bold') },
    { icon: Italic, label: 'Italic', run: () => exec('italic') },
    { icon: Underline, label: 'Underline', run: () => exec('underline') },
    { icon: Heading2, label: 'Heading', run: () => exec('formatBlock', 'h2') },
    { icon: Heading3, label: 'Subheading', run: () => exec('formatBlock', 'h3') },
    { icon: List, label: 'Bulleted list', run: () => exec('insertUnorderedList') },
    { icon: ListOrdered, label: 'Numbered list', run: () => exec('insertOrderedList') },
    { icon: Quote, label: 'Quote', run: () => exec('formatBlock', 'blockquote') },
    {
      icon: Link2,
      label: 'Link',
      run: openLinkModal,
    },
    { icon: Eraser, label: 'Clear formatting', run: () => exec('removeFormat') },
  ]

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface overflow-hidden focus-within:border-gold focus-within:shadow-[0_0_0_3px_var(--color-gold-muted)] transition-[border-color,box-shadow] duration-200">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-2 px-1.5 py-1">
        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            title={b.label}
            aria-label={b.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={b.run}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-surface hover:text-text transition-colors"
          >
            <b.icon size={15} />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        data-placeholder={placeholder}
        className={cn(
          PROSE,
          'min-h-[220px] px-3.5 py-3 outline-none',
          'empty:before:content-[attr(data-placeholder)] empty:before:text-text-dim empty:before:pointer-events-none',
        )}
      />

      <Modal open={linkOpen} onClose={() => setLinkOpen(false)} title="Add link" size="sm">
        <div className="space-y-4">
          <Input
            label="Link URL"
            placeholder="https://…"
            value={linkUrl}
            autoFocus
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyLink()
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyLink}>Add link</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
