'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme, themeColors } from './ThemeContext'
import { useReveal } from './home/useReveal'
import { Download, FileText, ExternalLink } from 'lucide-react'

interface DocumentRow {
  id: string
  title: string
  file_url: string
}

interface ResourcesProps {
  /** Filter to documents tagged with this page_slug. Pass null to show
   *  every active document. */
  pageSlug?: string | null
  heading?: string
  subheading?: string
  /** Optional override label for the chip above the heading. */
  eyebrow?: string
}

// Filename → file extension (e.g. "Membership-Prospectus.pdf" → "PDF").
// Used for the small grey chip on each card.
function extFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').pop() ?? ''
    const dot = last.lastIndexOf('.')
    return dot >= 0 ? last.slice(dot + 1).toUpperCase() : 'FILE'
  } catch {
    return 'FILE'
  }
}

// Public "downloads / resources" section. Reads from the `documents` table
// filtered by `page_slug` so the same component renders on Memberships
// (prospectus, terms), Private Event Services (brochure), etc. Renders
// nothing when no matching documents exist — pages stay clean on a fresh
// install.
export function Resources({
  pageSlug,
  heading = 'Resources',
  subheading,
  eyebrow = 'Downloads',
}: ResourcesProps) {
  const { mode } = useTheme()
  const t = themeColors[mode].warm
  const reveal = useReveal(0.15)
  const [docs, setDocs] = useState<DocumentRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let q = supabase
        .from('documents')
        .select('id, title, file_url')
        .eq('is_active', true)
      if (pageSlug) q = q.eq('page_slug', pageSlug)
      const { data } = await q.order('created_at', { ascending: false }).limit(12)
      if (!cancelled) setDocs(data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [pageSlug])

  // Render nothing when there's no content — avoids an empty section banding
  // the page on first install.
  if (!docs || docs.length === 0) return null

  return (
    <section
      ref={reveal.ref}
      className="py-20 md:py-28 transition-colors duration-[400ms]"
      style={{ backgroundColor: t.bg }}
    >
      <div className="max-w-[1100px] mx-auto px-6 md:px-16 lg:px-24">
        <div className="text-center mb-12">
          <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
            {eyebrow}
          </span>
          <h2
            className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light leading-[1.2]"
            style={{ color: t.text }}
          >
            {heading}
          </h2>
          {subheading && (
            <p
              className="mt-4 max-w-xl mx-auto text-[0.95rem]"
              style={{ color: t.textMuted }}
            >
              {subheading}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {docs.map((doc) => (
            <a
              key={doc.id}
              href={doc.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 px-5 py-4 bg-white/60 hover:bg-white border transition-all duration-300"
              style={{ borderColor: t.border }}
            >
              <div
                className="w-11 h-11 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
                style={{ backgroundColor: 'rgba(184, 151, 90, 0.12)' }}
              >
                <FileText size={18} className="text-[#B8975A]" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: t.text }}
                  >
                    {doc.title}
                  </p>
                  <span
                    className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded"
                    style={{
                      color: t.textDim,
                      backgroundColor: 'rgba(0,0,0,0.04)',
                    }}
                  >
                    {extFromUrl(doc.file_url)}
                  </span>
                </div>
                <p
                  className="text-[11px] mt-0.5 font-[family-name:var(--font-label)] uppercase tracking-[0.15em] inline-flex items-center gap-1"
                  style={{ color: t.textDim }}
                >
                  Download
                  <ExternalLink size={10} />
                </p>
              </div>
              <Download
                size={16}
                className="text-[#B8975A] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
