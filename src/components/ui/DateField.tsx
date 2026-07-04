'use client'

import { useMemo, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Themed, PORTALED date picker (date-only) built on Radix Popover (shadcn
// foundation) + date-fns. Renders in a portal so the calendar never clips
// inside a scrolling modal. Value is a "yyyy-MM-dd" string, '' when empty.

const FMT = 'yyyy-MM-dd'
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function parseVal(v: string | null | undefined): Date | null {
  if (!v) return null
  const d = parse(v, FMT, new Date())
  return isNaN(d.getTime()) ? null : d
}

export function DateField({
  label,
  value,
  onChange,
  placeholder = 'Select date',
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const selected = useMemo(() => parseVal(value), [value])
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState<Date>(selected ?? new Date())

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [viewMonth])

  const today = new Date()

  function pick(day: Date) {
    onChange(format(startOfDay(day), FMT))
    setOpen(false)
  }

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
          {label}
        </label>
      )}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={cn(
              'w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-surface text-sm rounded-[var(--radius-md)] border text-left transition-colors',
              open
                ? 'border-gold shadow-[0_0_0_3px_var(--color-gold-muted)]'
                : 'border-border hover:border-border-hover',
            )}
          >
            <Calendar size={15} className="shrink-0 text-gold" />
            <span className={cn('flex-1 truncate', selected ? 'text-text' : 'text-text-dim')}>
              {selected ? format(selected, 'EEE d MMM yyyy') : placeholder}
            </span>
            {selected && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange('')
                }}
                className="shrink-0 text-text-dim hover:text-accent-warm"
              >
                <X size={14} />
              </span>
            )}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="z-[100] w-[300px] rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-lg)] p-3.5"
          >
            {/* Month header */}
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, -1))}
                className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-md)] text-text-muted hover:bg-surface-2 hover:text-text"
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="font-[family-name:var(--font-heading)] text-[15px] text-text">
                {format(viewMonth, 'MMMM yyyy')}
              </span>
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-md)] text-text-muted hover:bg-surface-2 hover:text-text"
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Weekday row */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="text-center text-[10px] font-medium uppercase tracking-[0.08em] text-text-dim py-1"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {gridDays.map((day) => {
                const isSelected = selected && isSameDay(day, selected)
                const inMonth = isSameMonth(day, viewMonth)
                const isToday = isSameDay(day, today)
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => pick(day)}
                    className={cn(
                      'h-8 rounded-[var(--radius-md)] text-[12.5px] transition-colors',
                      isSelected
                        ? 'bg-gold text-white font-medium'
                        : inMonth
                          ? 'text-text hover:bg-gold-muted'
                          : 'text-text-dim/60 hover:bg-surface-2',
                      !isSelected && isToday && 'ring-1 ring-gold/50',
                    )}
                  >
                    {format(day, 'd')}
                  </button>
                )
              })}
            </div>

            {/* Footer */}
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                className="text-xs text-text-muted hover:text-accent-warm"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => pick(new Date())}
                className="text-xs font-medium text-gold hover:text-gold-dark"
              >
                Today
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
