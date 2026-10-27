'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { Calendar, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SelectMenu } from './SelectMenu'

// Brand-styled date + time picker — a replacement for native
// <input type="datetime-local">, whose popup is unstyleable browser
// chrome. Value is the datetime-local string "YYYY-MM-DDTHH:mm" (the same
// format the event form already reads), or '' when empty.

const VALUE_FORMAT = "yyyy-MM-dd'T'HH:mm"
const DATE_FORMAT = 'yyyy-MM-dd'

function parseValue(value: string | undefined | null, fmt: string): Date | null {
  if (!value) return null
  const d = parse(value, fmt, new Date())
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
  placeholder,
  dateOnly = false,
  min,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: string
  placeholder?: string
  // Date-only mode: no time row, value is "yyyy-MM-dd", picking a day closes.
  dateOnly?: boolean
  // Disable days before this date.
  min?: Date
}) {
  const fmt = dateOnly ? DATE_FORMAT : VALUE_FORMAT
  const ph = placeholder ?? (dateOnly ? 'Select date' : 'Select date & time')
  const minDay = useMemo(() => (min ? startOfDay(min) : null), [min])
  // Datetime mode: the earliest selectable moment, rounded UP to the 5-minute
  // grid — nothing before it can be picked (past days, hours or minutes).
  const minTime = useMemo(() => {
    if (!min || dateOnly) return null
    const d = new Date(min)
    d.setSeconds(0, 0)
    const rem = d.getMinutes() % 5
    if (rem) d.setMinutes(d.getMinutes() + (5 - rem))
    return d
  }, [min, dateOnly])
  const selected = useMemo(() => parseValue(value, fmt), [value, fmt])
  const [open, setOpen] = useState(false)
  // The calendar renders in a portal with fixed positioning so a scrolling
  // parent (e.g. a Modal body) can't clip it; flips above the field when
  // there isn't room below and stays inside the viewport horizontally.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
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
      const t = e.target as Node
      if (ref.current?.contains(t) || popRef.current?.contains(t)) return
      // The hour/minute SelectMenu lists render in their own portal.
      if (t instanceof Element && t.closest('[data-radix-popper-content-wrapper]')) return
      setOpen(false)
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

  // Place the portal popover against the trigger; re-place on scroll/resize.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    function place() {
      const trigger = triggerRef.current
      const pop = popRef.current
      if (!trigger) return
      const r = trigger.getBoundingClientRect()
      const ph = pop?.offsetHeight ?? 380
      const pw = pop?.offsetWidth ?? 300
      const gap = 8
      const below = window.innerHeight - r.bottom
      const top =
        below >= ph + gap || r.top < ph + gap
          ? Math.min(r.bottom + gap, Math.max(gap, window.innerHeight - ph - gap))
          : r.top - ph - gap
      const left = Math.min(Math.max(gap, r.left), Math.max(gap, window.innerWidth - pw - gap))
      setPos({ top, left })
    }
    place()
    // Second pass once the popover has its real size.
    const raf = requestAnimationFrame(place)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  const hour = selected ? selected.getHours() : 9
  const minute = selected ? Math.round(selected.getMinutes() / 5) * 5 : 0

  function emit(next: Date) {
    // Never emit a time before the minimum — snap to the earliest allowed.
    const safe = minTime && next < minTime ? minTime : next
    onChange(format(safe, fmt))
  }

  // On the minimum's day, hours/minutes before it are disabled.
  const onMinDay = !!(minTime && selected && isSameDay(selected, minTime))
  const hourDisabled = (h: number) => onMinDay && h < minTime!.getHours()
  const minuteDisabled = (h: number, m: number) =>
    onMinDay && (h < minTime!.getHours() || (h === minTime!.getHours() && m < minTime!.getMinutes()))

  function pickDay(day: Date) {
    if (minDay && isBefore(startOfDay(day), minDay)) return
    if (dateOnly) {
      emit(startOfDay(day))
      setOpen(false)
      return
    }
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
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((v) => !v)
        }}
        className={cn(
          'w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-surface text-sm rounded-[var(--radius-md)] border text-left transition-colors',
          error ? 'border-accent-warm' : 'border-border hover:border-border-hover',
          open && 'border-gold shadow-[0_0_0_3px_var(--color-gold-muted)]',
        )}
      >
        <Calendar size={15} className="shrink-0 text-gold" />
        <span className={cn('flex-1 truncate', selected ? 'text-text' : 'text-text-dim')}>
          {selected ? format(selected, dateOnly ? 'EEE d MMM yyyy' : 'EEE d MMM yyyy · HH:mm') : ph}
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

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popRef}
          className="fixed z-[60] w-[300px] max-w-[calc(100vw-16px)] rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-lg)] p-3.5"
          style={{
            background: 'var(--color-surface)',
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            visibility: pos ? 'visible' : 'hidden',
          }}
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
              const disabled = minDay ? isBefore(startOfDay(day), minDay) : false
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={disabled}
                  onClick={() => pickDay(day)}
                  className={cn(
                    'h-8 rounded-[var(--radius-md)] text-[12.5px] transition-colors',
                    disabled
                      ? 'text-text-dim/30 cursor-not-allowed'
                      : isSelected
                        ? 'bg-gold text-white font-medium'
                        : inMonth
                          ? 'text-text hover:bg-gold-muted'
                          : 'text-text-dim/60 hover:bg-surface-2',
                    !isSelected && isToday && !disabled && 'ring-1 ring-gold/50',
                  )}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>

          {/* Time row — branded SelectMenu popups (no native <select>). */}
          {!dateOnly && (
          <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
            <Clock size={14} className="text-gold shrink-0" />
            <div className="flex-1 min-w-0">
            <SelectMenu
              size="sm"
              ariaLabel="Hour"
              value={String(hour)}
              onValueChange={(v) => setTime(Number(v), minute)}
              options={HOURS.map((h) => ({
                value: String(h),
                label: String(h).padStart(2, '0'),
                disabled: hourDisabled(h),
              }))}
            />
            </div>
            <span className="text-text-dim">:</span>
            <div className="flex-1 min-w-0">
            <SelectMenu
              size="sm"
              ariaLabel="Minute"
              value={String(minute)}
              onValueChange={(v) => setTime(hour, Number(v))}
              options={MINUTES.map((m) => ({
                value: String(m),
                label: String(m).padStart(2, '0'),
                disabled: minuteDisabled(hour, m),
              }))}
            />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-1 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] bg-gold text-white hover:bg-gold-dark"
            >
              Done
            </button>
          </div>
          )}
        </div>,
        // Portal into the nearest theme root (admin night/day, chat) so the
        // calendar keeps the page's colours; fall back to <body>.
        ref.current?.closest<HTMLElement>('.theme-night-admin, .chat-theme') ?? document.body,
      )}
    </div>
  )
}
