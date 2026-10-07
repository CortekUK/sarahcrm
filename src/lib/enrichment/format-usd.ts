// Compact USD formatter for enrichment figures (e.g. Clay's
// total_funding_amount_range_usd): 705000000 → "$705M", 1250000000 → "$1.25B".
// Browser-safe: no imports, so admin screens can use it directly.
//
// Up to 3 significant digits, trailing zeros dropped ("$1.5B", not "$1.50B").
// Returns null for anything that isn't a finite, non-negative number so callers
// can simply skip the row.
const UNITS: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
]

export function formatUsdCompact(value: unknown): string | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n) || n < 0) return null
  // Smallest-unit-last; a value that rounds up to 1000 of a unit (999.6M)
  // is shown in the next unit up instead ("$1B", not "$1000M").
  for (let i = 0; i < UNITS.length; i++) {
    const [size, suffix] = UNITS[i]
    if (n < size) continue
    const scaled = Number((n / size).toPrecision(3))
    if (scaled >= 1000 && i > 0) return `$${Number((scaled / 1000).toPrecision(3))}${UNITS[i - 1][1]}`
    return `$${scaled}${suffix}`
  }
  const whole = Math.round(n)
  return whole >= 1000 ? '$1K' : `$${whole}`
}
