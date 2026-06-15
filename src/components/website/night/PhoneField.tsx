'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

// Phone input with a country dial-code picker — defaults to the UK (+44).
// Replaces the free-text contact field so applicants enter a real number
// with the correct region code. Emits "${dial} ${national}" (or '' when no
// number is typed, so "Required" validation still fires).

interface Country {
  code: string // ISO-2
  name: string
  dial: string // e.g. "+44"
  flag: string
}

// UK first (default), then common regions for an international members' club.
const COUNTRIES: Country[] = [
  { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
  { code: 'IE', name: 'Ireland', dial: '+353', flag: '🇮🇪' },
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  { code: 'AE', name: 'United Arab Emirates', dial: '+971', flag: '🇦🇪' },
  { code: 'FR', name: 'France', dial: '+33', flag: '🇫🇷' },
  { code: 'DE', name: 'Germany', dial: '+49', flag: '🇩🇪' },
  { code: 'CH', name: 'Switzerland', dial: '+41', flag: '🇨🇭' },
  { code: 'IT', name: 'Italy', dial: '+39', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', dial: '+34', flag: '🇪🇸' },
  { code: 'NL', name: 'Netherlands', dial: '+31', flag: '🇳🇱' },
  { code: 'BE', name: 'Belgium', dial: '+32', flag: '🇧🇪' },
  { code: 'PT', name: 'Portugal', dial: '+351', flag: '🇵🇹' },
  { code: 'SE', name: 'Sweden', dial: '+46', flag: '🇸🇪' },
  { code: 'NO', name: 'Norway', dial: '+47', flag: '🇳🇴' },
  { code: 'DK', name: 'Denmark', dial: '+45', flag: '🇩🇰' },
  { code: 'AT', name: 'Austria', dial: '+43', flag: '🇦🇹' },
  { code: 'MC', name: 'Monaco', dial: '+377', flag: '🇲🇨' },
  { code: 'LU', name: 'Luxembourg', dial: '+352', flag: '🇱🇺' },
  { code: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺' },
  { code: 'NZ', name: 'New Zealand', dial: '+64', flag: '🇳🇿' },
  { code: 'SG', name: 'Singapore', dial: '+65', flag: '🇸🇬' },
  { code: 'HK', name: 'Hong Kong', dial: '+852', flag: '🇭🇰' },
  { code: 'IN', name: 'India', dial: '+91', flag: '🇮🇳' },
  { code: 'ZA', name: 'South Africa', dial: '+27', flag: '🇿🇦' },
  { code: 'SA', name: 'Saudi Arabia', dial: '+966', flag: '🇸🇦' },
  { code: 'QA', name: 'Qatar', dial: '+974', flag: '🇶🇦' },
]

const DEFAULT = COUNTRIES[0]

// Split an existing value like "+44 7700 900123" into a country + national.
function splitValue(value: string): { country: Country; national: string } {
  const v = (value ?? '').trim()
  if (v.startsWith('+')) {
    // Longest dial-code match wins (so +1 doesn't shadow +44).
    const match = [...COUNTRIES]
      .sort((a, b) => b.dial.length - a.dial.length)
      .find((c) => v.startsWith(c.dial))
    if (match) return { country: match, national: v.slice(match.dial.length).trim() }
  }
  return { country: DEFAULT, national: v }
}

export function PhoneField({
  label = 'Contact number',
  value,
  onChange,
  error,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  const initial = useMemo(() => splitValue(value), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [country, setCountry] = useState<Country>(initial.country)
  const [national, setNational] = useState(initial.national)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Compose and emit. Empty national → '' so required-validation still fires.
  function emit(c: Country, n: string) {
    const digits = n.replace(/[^\d\s]/g, '').trim()
    onChange(digits ? `${c.dial} ${digits}` : '')
  }

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const filtered = query.trim()
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(query.trim().toLowerCase()) ||
          c.dial.includes(query.trim()),
      )
    : COUNTRIES

  return (
    <div ref={ref} className="relative">
      <label className="block font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze mb-3">
        {label}
      </label>
      <div className="flex items-center border-b border-graphite-line/80 focus-within:border-bronze transition-colors">
        {/* Country picker */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 py-3 pr-3 text-[15px] text-ivory hover:text-bronze-light transition-colors shrink-0"
        >
          <span className="text-[17px] leading-none">{country.flag}</span>
          <span className="tabular-nums">{country.dial}</span>
          <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
        {/* National number */}
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={national}
          onChange={(e) => {
            const n = e.target.value
            setNational(n)
            emit(country, n)
          }}
          placeholder="7700 900123"
          className="flex-1 px-0 py-3 bg-transparent focus:outline-none text-[15px] text-ivory placeholder:text-slate-dim"
        />
      </div>
      {error && <p className="mt-2 text-[12px] text-bronze-light italic">{error}</p>}

      {open && (
        <div className="absolute z-50 mt-2 left-0 w-[280px] max-h-[300px] overflow-hidden rounded-lg border border-bronze/40 bg-ink shadow-[0_24px_48px_rgba(0,0,0,0.6)]">
          <div className="p-2.5 border-b border-graphite-line/60">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-haze pointer-events-none"
              />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search country or code"
                className="w-full pl-8 pr-2 py-2 bg-graphite/50 border border-graphite-line/60 rounded text-[13px] text-ivory placeholder:text-slate-dim focus:outline-none focus:border-bronze/50"
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-[236px]" data-lenis-prevent>
            {filtered.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  setCountry(c)
                  emit(c, national)
                  setOpen(false)
                  setQuery('')
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[13.5px] transition-colors',
                  c.code === country.code
                    ? 'bg-bronze/15 text-ivory'
                    : 'text-ivory-soft hover:bg-bronze/10 hover:text-ivory',
                )}
              >
                <span className="text-[16px] leading-none">{c.flag}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="tabular-nums text-slate-haze">{c.dial}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3.5 py-4 text-[12.5px] text-slate-haze italic">No match.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
