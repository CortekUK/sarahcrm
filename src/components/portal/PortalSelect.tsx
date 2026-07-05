'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// Themed dropdown for the member portal. The native <select> renders as
// a grey OS control that breaks the night/editorial palette, so this is
// a small headless button + list styled to match the portal's
// underline fields (bg-transparent, graphite-line bottom border, bronze
// on focus/hover). Controlled — pair it with react-hook-form's
// Controller so the existing submit logic keeps working unchanged.

interface PortalSelectProps {
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  placeholder?: string
  id?: string
}

export function PortalSelect({ value, onChange, options, placeholder = 'Select…', id }: PortalSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-0 py-3 bg-transparent border-b transition-colors text-left text-[14.5px]',
          open ? 'border-bronze' : 'border-graphite-line/80 hover:border-bronze/60',
          value ? 'text-ivory' : 'text-slate-dim',
        )}
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown
          size={15}
          strokeWidth={1.5}
          className={cn('shrink-0 text-slate-haze transition-transform duration-300', open && 'rotate-180 text-bronze')}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-20 left-0 right-0 mt-2 max-h-64 overflow-y-auto border border-bronze/35 bg-graphite shadow-[0_20px_45px_-14px_rgba(0,0,0,0.7)] py-1.5"
        >
          {options.map((opt) => {
            const active = opt === value
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(opt)
                  setOpen(false)
                }}
                className={cn(
                  'w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-[13.5px] transition-colors',
                  active
                    ? 'text-bronze-light bg-bronze/[0.08]'
                    : 'text-ivory-soft hover:text-ivory hover:bg-bronze/[0.06]',
                )}
              >
                <span className="truncate">{opt}</span>
                {active && <Check size={13} strokeWidth={2} className="shrink-0 text-bronze" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
