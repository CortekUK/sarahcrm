'use client'

import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Themed, PORTALED select built on Radix (shadcn foundation). Unlike the
// absolute-positioned ui/Select, its dropdown renders in a portal so it never
// clips inside a scrolling modal body or an overflow-auto table. Matches the
// warm/gold theme.
//
// NOTE: Radix disallows an empty-string option value — use a sentinel like
// 'none' for "unassigned" and map it back to '' in the caller.

interface Option {
  value: string
  label: string
}

export function SelectMenu({
  value,
  onValueChange,
  options,
  placeholder,
  label,
  className,
  size = 'md',
  ariaLabel,
}: {
  value: string
  onValueChange: (value: string) => void
  options: Option[]
  placeholder?: string
  label?: string
  className?: string
  size?: 'sm' | 'md'
  ariaLabel?: string
}) {
  const trigger =
    size === 'sm'
      ? 'px-2.5 py-1.5 text-xs'
      : 'px-3.5 py-2.5 text-sm'

  return (
    <div className={label ? 'space-y-1.5' : undefined}>
      {label && (
        <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
          {label}
        </label>
      )}
      <Select.Root value={value} onValueChange={onValueChange}>
        <Select.Trigger
          aria-label={ariaLabel ?? label}
          className={cn(
            'inline-flex w-full items-center justify-between gap-2 bg-surface text-text rounded-[var(--radius-md)] border border-border outline-none text-left transition-colors',
            'data-[state=open]:border-gold data-[state=open]:shadow-[0_0_0_3px_var(--color-gold-muted)] focus:border-gold',
            trigger,
            className,
          )}
        >
          <Select.Value placeholder={placeholder} />
          <Select.Icon>
            <ChevronDown size={15} strokeWidth={1.6} className="text-text-dim" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={4}
            className="z-[100] min-w-[var(--radix-select-trigger-width)] max-h-72 overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-lg)]"
          >
            <Select.Viewport className="p-1">
              {options.map((o) => (
                <Select.Item
                  key={o.value}
                  value={o.value}
                  className={cn(
                    'relative flex cursor-pointer select-none items-center rounded-[var(--radius-md)] py-2 pl-3 pr-8 text-sm text-text outline-none',
                    'data-[highlighted]:bg-surface-2 data-[state=checked]:text-gold data-[state=checked]:font-medium',
                  )}
                >
                  <Select.ItemText>{o.label}</Select.ItemText>
                  <Select.ItemIndicator className="absolute right-2 inline-flex">
                    <Check size={14} strokeWidth={2} className="text-gold" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  )
}
