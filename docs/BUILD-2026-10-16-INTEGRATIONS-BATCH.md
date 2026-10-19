# Integrations batch — 2026-10-16 (handover)

Seven post-roadmap items built by four parallel agents, reviewed by the orchestrator.
Status: BUILT, `tsc` clean, full `next build` passes (isolated copy). NOT committed.
**6 migrations written, NOT applied yet** (awaiting user go-ahead).
Safety during build: no emails sent, no Google Calendar calls, no live Stripe/Resend/Metricool/OpenAI calls.

Earlier same week (also uncommitted): Apollo → **Clay** enrichment (live, Search API, manual-only),
**Metricool** publisher (draft mode default, awaiting credentials), event spreadsheet import
(migration applied 2026-10-07). See `docs/MARKETING-AI-ENGINE.md`, `docs/SPONSORSHIP-INTELLIGENCE.md`.

## What was built
| # | Item | Key files | Switch |
|---|---|---|---|
| 1 | Concierge **call booking** (Google free/busy + booking) | `src/lib/google/calendar.ts`, `calendar-slots.ts`, `src/lib/concierge/call-booking.ts`, `src/app/api/concierge/chat/route.ts`, `ConciergeWidget.tsx` | `CONCIERGE_BOOKING_ENABLED` (OFF). Off = captures preferred times → enquiry `call_*` + "Call requested" task |
| 2 | **Sponsor follow-up sequences** + **reply tracking** (replaces Instantly) | `src/lib/sponsorship/outreach/{sequence,runner,replies,tracking,render}.ts`, outreach routes, `OutreachQueueView.tsx` | Daily automation sends only approved+scheduled+due steps; edits to approved step → back to draft. Reply-To = `SPONSOR_OUTREACH_REPLY_TO` (default `GOOGLE_WORKSPACE_SUBJECT`) |
| 3 | **Facebook** channel in Marketing engine | `src/lib/marketing/channels.ts`, `publish/metricool.ts`, generate route | via Metricool (draft by default) |
| 4 | **Direct Debit via Stripe (Bacs)** — additive, all existing methods untouched | `src/lib/billing/direct-debit.ts`, application setup/confirm/approve routes, portal billing, `supabase/functions/stripe-webhook/direct-debit.ts` | `NEXT_PUBLIC_STRIPE_BACS_DEBIT_ENABLED` (OFF) |
| 5 | **Blogs publish to website** after approval (+ unpublish) | `src/lib/marketing/publish/blog.ts`, `blog-content.ts`, `src/lib/cms/blog.ts`, `src/app/(public)/blog/*` | "Approve & publish to website"; in-app task notifies team (no email) |
| 6 | **Email open tracking** → Member Success "Not opening emails" | `src/app/api/webhooks/resend/route.ts`, `src/lib/members/email-engagement.ts`, members/success route + page | Silent until any open recorded |
| 7 | Concierge **suggests events** + asks **turnover** + never loses a lead | `src/lib/concierge/events.ts`, chat route | always on |

Shared new helper: `src/lib/notifications/in-app.ts` (`admin_notifications`, in-app only).

## Migrations (NOT applied) — `supabase/migrations/`
1. `20261016_marketing_facebook_blog_posts.sql` — channel check + `blog_posts` (public read published)
2. `20261016_public_events_completed.sql` — anon can read published/live/completed events (fixes empty Past Events for signed-out visitors — live bug)
3. `20261016_concierge_events_calls.sql` — `enquiries.call_*`, `concierge_conversations.call_state`, `admin_notifications`
4. `20261016_sponsor_outreach_sequences.sql` — sequence/schedule/tracking cols, `cancelled` status, `sponsor_prospects.replied_at`
5. `20261016_email_open_tracking.sql` — `email_log.opened_at/clicked_at`
6. `20261016_stripe_bacs_direct_debit.sql` — DD status cols on members/applications/payments
Apply via Management API (see memory `supabase-migration-reality`).

## To switch on later
- **Resend:** enable open + click tracking on `theclubgroup.co`; webhook events opened/clicked/bounced/delivered; set `RESEND_WEBHOOK_SECRET`.
- **Gmail sync master switch** (`app_settings.gmail_sync_config.enabled`) is OFF → reply detection needs it ON; Sarah's inbox must stay enabled.
- **Stripe Bacs:** activate in Dashboard; add webhook events `mandate.updated`, `checkout.session.async_payment_succeeded/failed`; redeploy `stripe-webhook` + `subscription-checkout` edge functions; set flag + rebuild.
- **Calendar booking:** DWD scopes `calendar.freebusy` + `calendar.events`; set `CONCIERGE_BOOKING_ENABLED=true` + `CONCIERGE_BOOKING_CALENDARS`.
- **Vercel env:** `CLAY_API_KEY`, `ENRICHMENT_PROVIDER=clay`, remove `APOLLO_API_KEY`; `METRICOOL_*` when ready; new flags above.

## Open items / QA must-tests
- Card approval: `approve` route expands `latest_invoice.payment_intent` under API `2026-02-25.clover` — may fail; test a card approval in Stripe test mode.
- Pre-existing: approval-created subscriptions lack `metadata.member_id` (sub updated/deleted webhooks don't match); failed-then-retried invoice not recorded as paid.
- `docs/knowledge/*` (help assistant KB) NOT yet updated for this batch — agents' proposed text pending merge.
- Clay decisions pending: mismatch safety check; clean Simon Myers' wrongly-enriched fields; UK default for cold sponsor search.
- PostgREST filters in outreach claim/domain match only mock-tested — verify once migrations applied.
