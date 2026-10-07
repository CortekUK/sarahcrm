// Display label for an `enrichment_source` value (the provider name written by
// enrichEnquiry / enrichMember). Client-safe: no imports, so admin screens can
// use it without pulling in the server-side providers.
//
// Known providers get their brand casing; anything else (including historical
// rows written by earlier providers) is shown with a capitalised first letter,
// so old data still renders cleanly.
const KNOWN_SOURCES: Record<string, string> = {
  clay: 'Clay',
  stub: 'Not configured',
}

export function formatEnrichmentSource(source: string | null | undefined): string | null {
  const s = source?.trim()
  if (!s) return null
  return KNOWN_SOURCES[s.toLowerCase()] ?? s.charAt(0).toUpperCase() + s.slice(1)
}
