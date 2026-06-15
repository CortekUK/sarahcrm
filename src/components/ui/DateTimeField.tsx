'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parse,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { Calendar, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Brand-styled date + time picker — a replacement for native
// <input type="datetime-local">, whose popup is unstyleable browser
// chrome. Value is the datetime-local string "YYYY-MM-DDTHH:mm" (the same
// format the event form already reads), or '' when empty.

const VALUE_FORMAT = "yyyy-MM-dd'T'HH:mm"

function parseValue(value: string | undefined | null): Date | null {
  if (!value) return null
  const d = parse(value, VALUE_FORMAT, new Date())
  return isNaN(d.getTime()) ? null : d
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

export function DateTimeField({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder = 'Select date & time',
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: string
  placeholder?: string
}) {
  const selected = useMemo(() => parseValue(value), [value])
  const [open, setOpen] = useState(false)
  // The month currently shown in the calendar grid.
  const [viewMonth, setViewMonth] = useState<Date>(selected ?? new Date())
  const ref = useRef<HTMLDivElement>(null)

  // Keep the view in sync when an external value lands (e.g. edit load).
  useEffect(() => {
    if (selected) setViewMonth(selected)
  }, [selected])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const hour = selected ? selected.getHours() : 9
  const minute = selected ? Math.round(selected.getMinutes() / 5) * 5 : 0

  function emit(next: Date) {
    onChange(format(next, VALUE_FORMAT))
  }

  function pickDay(day: Date) {
    const base = selected ?? new Date()
    const next = new Date(day)
    next.setHours(selected ? base.getHours() : 9, selected ? base.getMinutes() : 0, 0, 0)
    emit(next)
  }

  function setTime(h: number, m: number) {
    const base = selected ?? viewMonth
    const next = new Date(base)
    next.setHours(h, m, 0, 0)
    emit(next)
  }

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [viewMonth])

  const today = new Date()

  return (
    <div ref={ref} className="relative">
      {label && (
        <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-1.5">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-surface text-sm rounded-[var(--radius-md)] border text-left transition-colors',
          error ? 'border-accent-warm' : 'border-border hover:border-border-hover',
          open && 'border-gold shadow-[0_0_0_3px_var(--color-gold-muted)]',
        )}
      >
        <Calendar size={15} className="shrink-0 text-gold" />
        <span className={cn('flex-1 truncate', selected ? 'text-text' : 'text-text-dim')}>
          {selected ? format(selected, 'EEE d MMM yyyy · HH:mm') : placeholder}
        </span>
        {selected && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
            }}
            className="shrink-0 text-text-dim hover:text-accent-warm"
            aria-label="Clear"
          >
            <X size={14} />
          </span>
        )}
      </button>

      {hint && !error && <p className="mt-1 text-xs text-text-dim">{hint}</p>}
      {error && <p className="mt-1 text-xs text-accent-warm">{error}</p>}

      {open && (
        <div
          className="absolute z-50 mt-2 w-[300px] rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-lg)] p-3.5"
          style={{ background: 'var(--color-surface)' }}
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
                  onClick={() => pickDay(day)}
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

          {/* Time row */}
          <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
            <Clock size={14} className="text-gold shrink-0" />
            <select
              value={hour}
              onChange={(e) => setTime(Number(e.target.value), minute)}
              className="flex-1 px-2 py-1.5 bg-surface text-sm rounded-[var(--radius-md)] border border-border focus:border-gold focus:outline-none"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}
                </option>
              ))}
            </select>
            <span className="text-text-dim">:</span>
            <select
              value={minute}
              onChange={(e) => setTime(hour, Number(e.target.value))}
              className="flex-1 px-2 py-1.5 bg-surface text-sm rounded-[var(--radius-md)] border border-border focus:border-gold focus:outline-none"
            >
              {MINUTES.map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-1 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] bg-gold text-white hover:bg-gold-dark"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
