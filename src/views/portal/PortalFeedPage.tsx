'use client'

// Member portal → Feed. The Club-wide feed as a full-width themed surface
// under the 72px portal header: a centred column with a quiet title, the
// sticky "Share an update…" composer (sticks just below the header) and the
// infinite list. No hero card — the feed IS the page.

import { FeedView } from '@/views/feed/FeedView'

export function PortalFeedPage() {
  return (
    <FeedView
      groupId={null}
      className="min-h-[calc(100dvh-72px)] border-t border-border"
      stickyClassName="top-[72px]"
      header={
        <div className="mb-3 px-1">
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-text sm:text-[28px]">Club feed</h1>
          <p className="mt-1 text-sm text-text-muted">News, wins and photos from members across The Club.</p>
        </div>
      }
    />
  )
}
