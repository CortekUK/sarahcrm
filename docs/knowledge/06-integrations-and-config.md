# The Club by Sarah Restrick — Integrations, Config & Ops Map

Scope: external integrations, environment variables, config files, `scripts/`,
cron jobs, webhooks, email, deployment. Read-only survey of
`/Users/apple/Ghulam/sarahcrm`. No secret values are reproduced anywhere below
— only variable names, purposes, and file locations.

---

## 1. Third-party integrations

| Integration | Purpose | Status | Key files | Env vars |
|---|---|---|---|---|
| **OpenAI** | Powers nearly all AI features: email/template AI-generation, Gmail draft-reply, Gmail extraction (entity/task extraction from synced mail), Chief-of-Staff daily report, Handover report, Introductions "why" rationale, marketing copy generation + audio transcription, member tag suggestions, scorecards summary, sponsor proposal/ROI writeups, sponsorship deck parsing + match scoring + outreach drafts, concierge chatbot, contract AI-generation, automations run (AI-assisted flows), newsletter generation | **Live** | `src/app/api/admin/google/gmail/draft-reply/route.ts`, `.../gmail/extract/route.ts`, `src/app/api/admin/handover/report/route.ts`, `src/app/api/admin/introductions/why/route.ts`, `src/app/api/admin/marketing/generate/route.ts`, `.../marketing/transcribe/route.ts`, `src/app/api/admin/members/[id]/suggest-tags/route.ts`, `src/app/api/admin/scorecards/summary/route.ts`, `src/app/api/admin/sponsors/proposal/route.ts`, `.../sponsors/roi/route.ts`, `src/app/api/admin/sponsorship/deck/parse/route.ts`, `.../sponsorship/match/route.ts`, `.../sponsorship/outreach/draft/route.ts`, `src/app/api/concierge/chat/route.ts`, `src/app/api/contracts/ai-generate/route.ts`, `src/app/api/templates/ai-generate/route.ts`, `src/lib/automations/run.ts`, `src/lib/chief-of-staff/generate.ts`, `src/lib/marketing/newsletter.ts` | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_MODEL_TEMPLATE_AI` |
| **Stripe** | Membership subscription billing, event ticket checkout, card-on-file charge/hold for bookings, Stripe Elements card capture on the membership-application form | **Live** | `src/lib/stripe/client.ts` (browser `loadStripe` singleton), `src/app/api/events/checkout/route.ts`, `src/app/api/events/book/route.ts`, `src/app/api/membership-application/setup/route.ts`, `.../confirm/route.ts`, `src/app/api/admin/bookings/decision/route.ts`, `src/app/api/admin/members/cancel/route.ts`, plus `scripts/provision-stripe-tiers.py`, `scripts/backfill-member-stripe.mjs` | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_RESTRICTED_KEY`, `STRIPE_WEBHOOK_SECRET` |
| **Resend** | All transactional/branded emails (invites, bookings, applications, introductions, sponsorship outreach, admin notifications, automations, template test-sends, campaigns) | **Live** | `src/lib/email/club-email.ts` (shared shell + `sendClubEmail`), `src/lib/email/admin-notify.ts`, `src/lib/email/invite.ts`, `src/app/api/webhooks/resend/route.ts` (inbound), `src/app/api/communications/send-template/route.ts`, `src/app/api/templates/send-test/route.ts`, `src/app/api/admin/sponsors/invite/route.ts`, `src/app/api/admin/campaigns/send/route.ts` | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`, `FROM_EMAIL` (legacy/fallback from-address), `RESEND_WEBHOOK_SECRET` |
| **Google Workspace (Gmail + Drive)** | Service-account + domain-wide-delegation (DWD) impersonation of Workspace mailboxes: unified Inbox sync (read), AI extraction, draft-reply creation (write draft only, never auto-send), Drive file browse/import into the media library | **Live** (Gmail sync/backfill/drafts, Drive browse/import); **Blocked** — Directory API (auto-listing real Workspace mailboxes) tested live and returned `401 unauthorized_client` (DWD scope not granted); Inbox currently uses a hardcoded 7-inbox list instead | `src/lib/google/client.ts` (JWT/service-account config), `src/lib/google/gmail.ts`, `src/lib/google/drive.ts`, `src/lib/google/sync-config.ts`, `src/lib/google/sync-core.ts`, `src/lib/google/match.ts`, `src/lib/google/noise.ts`, `src/lib/google/media-access.ts`, `src/app/api/admin/google/gmail/*`, `src/app/api/admin/google/drive/*`, `src/app/api/cron/gmail-sync/route.ts`, `src/app/api/cron/gmail-backfill/route.ts` | `GOOGLE_SA_KEY_BASE64`, `GOOGLE_SA_CLIENT_EMAIL`, `GOOGLE_SA_CLIENT_ID`, `GOOGLE_WORKSPACE_SUBJECT`, `GOOGLE_DRIVE_FOLDER_ID` |
| **DocuSign (eSignature)** | Contract/document signature requests, envelope status tracking, admin consent (JWT/OAuth) flow, real-time status push via Connect webhook | **Live** (sandbox/demo by default; prod requires swapping base/oauth URLs) | `src/lib/docusign/client.ts`, `src/lib/docusign/reconcile.ts`, `src/app/api/admin/docusign/consent/route.ts`, `src/app/api/admin/signatures/{send,status,view,void}/route.ts`, `src/app/api/docusign/webhook/route.ts` (inbound), `src/app/api/contracts/ai-generate/route.ts` | `DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_USER_ID`, `DOCUSIGN_ACCOUNT_ID`, `DOCUSIGN_PRIVATE_KEY`, `DOCUSIGN_BASE_PATH`, `DOCUSIGN_OAUTH_BASE`, `DOCUSIGN_REDIRECT_URI`, `DOCUSIGN_CONNECT_SECRET`, `DOCUSIGN_WEBHOOK_URL` |
| **Xero (accounting)** | OAuth2-connected accounting sync: contacts, invoices, revenue, spend | **Live** (once an admin completes OAuth) — connection state is persisted in `app_settings.xero_oauth`, checked live by the Settings → Integrations status card | `src/lib/xero/client.ts`, `src/lib/xero/contacts.ts`, `src/lib/xero/invoices.ts`, `src/lib/xero/revenue.ts`, `src/lib/xero/spend.ts`, `src/app/api/admin/xero/{connect,disconnect,sync-contacts,sync-invoices,sync-spend}/route.ts`, `src/app/api/xero/callback/route.ts` (inbound OAuth redirect) | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`, `XERO_SCOPES` |
| **WhatsApp Business (Meta Cloud API)** | Send/receive WhatsApp messages, admin-triggered sends, inbound webhook for delivery/read status + inbound messages | **Partially built, blocked on client**: send + webhook plumbing exist, but the full AI WhatsApp assistant (event/ticket enquiries, concierge, Stripe payment links) is **deferred/not built**. Blocked on client obtaining a verified WhatsApp Business Account + Meta Business Verification (see §Pending below) | `src/lib/whatsapp/client.ts` (phone normalization + shared sender + `whatsapp_log`), `src/app/api/admin/whatsapp/send/route.ts`, `src/app/api/whatsapp/webhook/route.ts` (inbound, public, no admin gate — Meta calls it directly) | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_WABA_ID` |
| **Clay (enrichment)** | Lead enrichment for enquiries + members (admin Enrich buttons) and sponsor discovery for Sponsorship Intelligence (cold company search + decision-maker search) — the platform's only enrichment provider | **Live** via Clay's **Public Search API** (synchronous: create a search, then run it; no webhooks or Clay tables). Enrichment is **manual only** — the public enquiry form no longer auto-enriches — because every search spends Clay's per-period **search quota** (not credits). Company results give name/domain/industry/LinkedIn/description plus size and revenue **buckets** (no website URL — derived as https://domain). People results give name/title/LinkedIn but **no email and no seniority** (seniority is derived from the job title). Quota exhausted (HTTP 402) shows as `upgrade_required`; HTTP 429 is retried automatically | `src/lib/enrichment/clay.ts` (provider), `src/lib/enrichment/clay-client.ts` (HTTP), `src/lib/enrichment/clay-query.ts` + `clay-constants.ts` (query builder + Clay enums), `src/lib/enrichment/provider.ts` (interface), `src/lib/enrichment/index.ts` (factory/dispatch), `src/lib/enrichment/enrich.ts`, `src/lib/enrichment/enrich-member.ts` | `CLAY_API_KEY`, `ENRICHMENT_PROVIDER` (optional, defaults to `clay`) |
| **Metricool (social publishing)** | Auto-publish approved marketing posts to Instagram/Facebook/LinkedIn | **Stubbed, blocked (client)**: requires Metricool Advanced plan (API access). `MetricoolPublisher.publish()` deliberately `throw`s "NotImplemented" so it can never silently no-op; swap from `MockPublisher` is a one-line change once the API token/userId/blogId arrive | `src/lib/marketing/publish/index.ts` (publisher factory), `src/lib/marketing/publish/metricool.ts` (documented stub), `src/lib/marketing/publish/mock.ts`, `src/lib/marketing/publish/types.ts` | none configured yet (planned: Metricool API token, `userId`, `blogId` — not yet in codebase) |
| **Twilio / telephony** | AI phone receptionist + onboarding-call recorder | **Not built** (deferred). No code, no env vars present. Design sketch lives in `docs/AI-OPERATIONAL-AGENTS.md` | — | — |
| **GoCardless** | Direct-debit collection | **Not wired**: member records track direct-debit status manually; no SDK/API calls exist. Only referenced defensively in the integrations-status check | `src/app/api/admin/integrations/status/route.ts` (checks presence only) | `GOCARDLESS_ACCESS_TOKEN` / `GC_ACCESS_TOKEN` (either satisfies the "connected" check; unused elsewhere) |

### Integration status source of truth
`src/app/api/admin/integrations/status/route.ts` (admin-only GET) reports live
connection status for the Settings → Integrations UI by checking for actual
credential presence (never printing secret values): Stripe (key prefix
`sk_live`/`rk_live` → "Live mode" else "Test mode"), GoCardless (env presence
only, unused), Xero (reads `app_settings.xero_oauth` for a stored
`access_token`/`tenant_name`), Resend (key presence + from-domain).

---

## 2. Environment variables — definitive list

Source: `.env.local.example` (partial/illustrative) + `grep process.env.` across
`src/` and `scripts/` + variable **names** present in the gitignored `.env`
(values not read/printed).

### Public (exposed to browser, `NEXT_PUBLIC_*`)
| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (RLS-scoped client) |
| `NEXT_PUBLIC_APP_URL` | Canonical app base URL, used to build absolute links in emails/redirects |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe.js publishable key for Elements (card capture) |

### Server-only secrets
| Var | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin Supabase client (bypasses RLS) — used in nearly every API route via `createAdminClient` |
| `SUPABASE_ACCESS_TOKEN` | Supabase **Management API** token — used only by one-off `scripts/*.mjs` (migrations, seeding, verification), never by the running app |
| `OPENAI_API_KEY` | OpenAI API auth |
| `OPENAI_MODEL` | Default model id override for general AI calls |
| `OPENAI_MODEL_TEMPLATE_AI` | Model id override specifically for the template AI builder |
| `RESEND_API_KEY` | Resend transactional email API |
| `RESEND_FROM_EMAIL` | Primary from-address for branded emails |
| `RESEND_FROM_NAME` | Display name for the from-address |
| `FROM_EMAIL` | Legacy/fallback from-address (used if `RESEND_FROM_EMAIL` unset) |
| `RESEND_WEBHOOK_SECRET` | Svix signing secret to verify inbound Resend webhook (optional — if unset, webhook still processes with a logged warning) |
| `STRIPE_SECRET_KEY` | Stripe server-side secret key |
| `STRIPE_RESTRICTED_KEY` | Stripe restricted-scope key (present in `.env`; narrower-permission alternative) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification (present in `.env`; no `src/app/api/webhooks/stripe` route found — see Gap below) |
| `DOCUSIGN_INTEGRATION_KEY` | DocuSign Integration Key (client id GUID) |
| `DOCUSIGN_USER_ID` | DocuSign API username/user id GUID |
| `DOCUSIGN_ACCOUNT_ID` | DocuSign API account id GUID |
| `DOCUSIGN_PRIVATE_KEY` | RSA private key (PEM) for JWT auth |
| `DOCUSIGN_BASE_PATH` | DocuSign REST base (demo vs prod) |
| `DOCUSIGN_OAUTH_BASE` | DocuSign OAuth host (demo vs prod) |
| `DOCUSIGN_REDIRECT_URI` | OAuth consent redirect target |
| `DOCUSIGN_CONNECT_SECRET` | Shared secret verifying inbound DocuSign Connect webhook (`?t=` query param) |
| `DOCUSIGN_WEBHOOK_URL` | Optional override for the derived webhook URL sent to DocuSign |
| `XERO_CLIENT_ID` | Xero OAuth2 client id |
| `XERO_CLIENT_SECRET` | Xero OAuth2 client secret |
| `XERO_REDIRECT_URI` | Xero OAuth2 redirect target |
| `XERO_SCOPES` | Xero OAuth2 scopes requested |
| `WHATSAPP_ACCESS_TOKEN` | Meta Cloud API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta Cloud API sending phone number id |
| `WHATSAPP_API_VERSION` | Graph API version string used in Cloud API calls |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification handshake token (`hub.verify_token`) |
| `WHATSAPP_WABA_ID` | WhatsApp Business Account id (present in `.env`) |
| `CLAY_API_KEY` | Clay Public API key (sent as the `clay-api-key` header). Set = Clay enrichment/discovery on; unset = no-op stub |
| `ENRICHMENT_PROVIDER` | Optional override, defaults to `clay`. Any other value (e.g. `stub`) pauses all Clay usage |
| `GOOGLE_SA_KEY_BASE64` | Base64-encoded full Google service-account JSON key |
| `GOOGLE_SA_CLIENT_EMAIL` | Service account email (informational/logging) |
| `GOOGLE_SA_CLIENT_ID` | 21-digit client id registered for domain-wide delegation |
| `GOOGLE_WORKSPACE_SUBJECT` | Default Workspace mailbox to impersonate |
| `GOOGLE_DRIVE_FOLDER_ID` | Drive folder surfaced in the CRM media library |
| `CRON_SECRET` | Bearer token Vercel Cron sends to authenticate `/api/cron/*` routes |
| `SITE_URL` | Alternate/legacy site base URL (present in `.env`; overlaps with `NEXT_PUBLIC_APP_URL`) |
| `GOCARDLESS_ACCESS_TOKEN` / `GC_ACCESS_TOKEN` | Either satisfies a "GoCardless connected" presence check; no live SDK integration |
| `DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD` | Local dev admin account credentials, consumed by `scripts/provision-dev-accounts.mjs` |
| `DEV_MEMBER_EMAIL` / `DEV_MEMBER_PASSWORD` | Local dev member account credentials, same script |

**Note:** `.env.local.example` only documents Supabase/OpenAI/Resend/DocuSign/Clay —
it is stale relative to the actual `.env` and the code's `process.env.*`
reads. Stripe, Xero, WhatsApp, Google Workspace, and `CRON_SECRET`
are all live in code/`.env` but undocumented in the example file.

---

## 3. Config files

| File | Purpose / notable settings |
|---|---|
| `next.config.ts` | `experimental.viewTransition: true`; `serverExternalPackages: ['jsdom', 'isomorphic-dompurify']` (kept out of the webpack bundle — jsdom reads a data file via its own `__dirname`, which webpack bundling would break, causing an ENOENT on `browser/default-stylesheet.css`); `eslint.ignoreDuringBuilds: true` (lint failures don't fail the build); `typescript.ignoreBuildErrors: false` (type errors DO fail the build); `images.remotePatterns` allow-list: `images.unsplash.com`, `plus.unsplash.com`, `*.supabase.co`, `img.youtube.com`, `i.ytimg.com`, `res.cloudinary.com` (hero video poster + other CDN media, ~10GB/mo free tier) |
| `vercel.json` | `framework: nextjs`; 4 cron jobs (see §5 below) |
| `tsconfig.json` | Target `ES2022`, `strict: true`, `moduleResolution: bundler`, path alias `@/*` → `./src/*`; excludes `node_modules` and `supabase` |
| `postcss.config.mjs` | Single plugin: `@tailwindcss/postcss` (Tailwind v4 CSS-first config, no separate `tailwind.config.js`) |
| `.gitignore` | Ignores `.env`/`.env.local`/`.vercel`; Google service-account key patterns (`*.json.key`, `*service-account*.json`, `the-club-by-sarah-restrick-*.json`, `gcp-*.json`, `credentials*.json`); `public/hero-video.mp4` (hosted on Cloudinary instead, avoids 99MB blob in git history); `.claude/`; `tsconfig.tsbuildinfo`; several **local-only docs excluded from git**: `docs/PENDING-INTEGRATIONS-AND-COMMS.md`, `docs/PLATFORM-USER-JOURNEY-TRAINING.md`, `docs/The-Club-Platform-Guide.{html,pdf}`, `The-Club-V2-Review.pdf` |
| `package.json` | `engines.node: "22.x"`; `pnpm.overrides.jsdom: "^26.1.0"` (forced jsdom version, related to the `serverExternalPackages` workaround above); scripts: `dev` (`next dev`), `build` (`next build`), `start` (`next start`), `lint` (`next lint`) — **no `test` script exists** |

### Notable dependencies (`package.json`)
| Package | Used for |
|---|---|
| `next` 15, `react`/`react-dom` 19 | Core framework |
| `@supabase/ssr`, `@supabase/supabase-js` | Supabase client (server + browser) |
| `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js` | Payments |
| `resend` | Transactional email |
| `openai` | AI features |
| `googleapis` | Gmail/Drive service-account access |
| `@tanstack/react-query` | Client data fetching/caching |
| `zustand` | Client state |
| `zod` | Schema validation |
| `react-hook-form` + `@hookform/resolvers` | Forms |
| Radix UI primitives (`@radix-ui/react-*`) | Headless UI primitives underlying house `ui/` components |
| `tailwindcss` v4 + `@tailwindcss/postcss` | Styling |
| `recharts` | Charts (scorecards, dashboards) |
| `gsap` + `@gsap/react`, `lenis` | Animation / smooth scroll |
| `html2canvas`, `html-to-image`, `jspdf` | Client-side image/PDF export (e.g. contracts, graphics) |
| `isomorphic-dompurify` | HTML sanitization (server-side, requires the `serverExternalPackages` workaround) |
| `mammoth` | `.docx` parsing (likely contract/deck ingestion) |
| `pdfjs-dist` | PDF parsing (sponsorship deck parse) |
| `xlsx` | Spreadsheet import/export (member import) |
| `qrcode` | QR code generation |
| `canvas-confetti` | UI celebration effect |
| `@hello-pangea/dnd` | Drag-and-drop (pipeline/kanban views) |
| `cmdk`, `sonner`, `next-themes` | Command palette, toasts, theme switching |

---

## 4. `scripts/` — inventory

All scripts read Supabase credentials from `.env.local` (falling back to
`.env`); none are wired into CI or `package.json` — all are run manually with
`node scripts/<file>.mjs` (or `python3`/`bash` for the two non-JS ones).

| Script | What it does | Destructive? |
|---|---|---|
| `apply-accountability-migration.mjs` | Applies the Team Accountability schema migration via Supabase Management API (raw SQL over HTTP) | Idempotent per header comment; writes schema — **not safe to run against wrong project** |
| `apply-daily-handover-migration.mjs` | Applies the Daily Handover migration via Management API | Idempotent (per header) |
| `apply-finance-tasks-migration.mjs` | Applies Finance Tasks / Accountant Auto-Escalation migration | Idempotent (per header) |
| `apply-migrations.mjs` | One-off: applies membership-application migrations | Schema-altering |
| `apply-scorecards-migration.mjs` | Applies Weekly Scorecards migration | Idempotent (per header) |
| `apply-sop-library-migration.mjs` | Applies SOP Library (Module 7) migration | Idempotent (per header) |
| `apply-time-tracking-migration.mjs` | Applies Time Tracking migration | Idempotent (per header) |
| `backfill-member-stripe.mjs` | One-off: for active members missing Stripe ids, looks up Stripe customer/subscription by email and links + inserts an initial payment row | Writes member/payment data — one-off/backfill, run after webhook fixes |
| `check-tiers.mjs` | Read-only check of `membership_tiers` data via Management API | Safe (read-only) |
| `check-video-gallery.mjs` | Read-only check of video gallery data | Safe (read-only) |
| `migrate-hero-cms.mjs` | Extends `hero_slides` schema (adds media/CTA columns) + seeds initial rows from hardcoded copy | Schema-altering + seeds data (nullable columns, additive) |
| `migrate-membership-plans.mjs` | Creates `membership_plans` table + seeds the 3 public plans (Individual/Business/Corporate); idempotent via `ON CONFLICT (slug)` upsert | Schema-altering, idempotent |
| `provision-dev-accounts.mjs` | Creates/repairs the two dev accounts (`DEV_ADMIN_*`, `DEV_MEMBER_*`) via direct Supabase Auth REST calls; ensures profile + member rows | Idempotent (resets password if user exists); **writes real auth users** |
| `provision-stripe-tiers.py` | One-shot: creates a Stripe Product + recurring Price for each membership tier missing a `stripe_price_id`, writes ids back to `membership_tiers` | Creates live/test Stripe objects; skips tiers already provisioned (safe to re-run) |
| `push-supabase-auth-config.mjs` | Pushes the branded "Invite user" email template + URL allow-list to the Supabase project via Management API | Overwrites live Supabase Auth email template config |
| `seed-about-videos.mjs` | Seeds `video_gallery` with Sarah's 4 YouTube videos (titles fetched live via YouTube oEmbed) | Seeds demo/real content data |
| `seed-event-galleries.mjs` | Adds `gallery_urls` to 3 past events using existing `/public/gallery/*.png` placeholders | Seeds demo data |
| `seed-events.mjs` | Seeds `public.events` with placeholder evenings | **Demo/placeholder data** — meant to be replaced via admin |
| `seed-galleries.mjs` | Seeds `galleries`, `gallery_photos`, `video_gallery` at scale for `/gallery` pages | Demo/placeholder data |
| `seed-hero-extras.mjs` | Top-up: seeds heroes for 3 pages missed by the original hero CMS rollout (club-rules, privacy-policy, one-london-road) | Idempotent, additive |
| `seed-placeholder-testimonials.mjs` | Seeds 3 placeholder testimonials for the homepage; re-running **deletes and re-inserts** rows matched by well-known placeholder names | Destructive to its own placeholder rows only (real testimonials with different names unaffected) |
| `seed-private-events.mjs` | Seeds `curated_experiences` + scoped `video_gallery` rows for `/private-event-services` | Demo/placeholder data |
| `seed-sarah-admin.mjs` | One-off: seeds/repairs an extra admin account (`admin@sarahrestrick.com`) using the service-role key; resets password if the user already exists | **Writes a real admin auth user**; run manually only |
| `verify-events-data.mjs` | Read-only check of events data via Management API | Safe (read-only) |
| `verify-supabase.mjs` | Read-only Supabase connectivity/config verification | Safe (read-only) |
| `seed-users.sh` | Bash script that creates 28 demo auth users via the Supabase Auth Admin REST API | **⚠️ Contains a hardcoded Supabase service-role JWT literal in the script file itself** (not read from `.env`) — this is a committed secret; flag for rotation/removal regardless of whether it targets a dev or prod project |

**Security finding:** `scripts/seed-users.sh` embeds a live-looking
`SERVICE_KEY` (a Supabase service-role JWT) directly in the script source
rather than reading it from environment/`.env.local` like every other script.
If this file is or was committed to git, that key should be treated as
compromised and rotated.

---

## 5. Cron jobs (`vercel.json` + `src/app/api/cron/*`)

All cron routes: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`,
`maxDuration = 60`. Auth: Vercel Cron sends `Authorization: Bearer
<CRON_SECRET>` automatically when `CRON_SECRET` is set; the same routes also
accept an authenticated admin session (for manual/dry-run triggering from the
Automations page).

| Path | Schedule | What it does | File |
|---|---|---|---|
| `/api/cron/automations` | `0 * * * *` (hourly) | Runs `runAllAutomations()` — the daily heartbeat for automated email flows (applications, bookings, finance escalation, etc.). Actually fires the real batch only once/day, at an admin-configured UK send-hour (`app_settings.daily_send_hour`, default 7); every other hourly tick is a no-op check. Idempotent — each flow skips already-handled recipients so re-running same-day is safe. Supports `?dryRun=true` for preview-only (no sends) | `src/app/api/cron/automations/route.ts` |
| `/api/cron/gmail-sync` | `*/15 * * * *` | Incrementally syncs configured inboxes into `gmail_messages` (per-inbox cursor). Fully config-gated by `app_settings.gmail_sync_config` (master switch + inbox list) — reads nothing and returns `{skipped:true}` if disabled | `src/app/api/cron/gmail-sync/route.ts` |
| `/api/cron/gmail-backfill` | `*/5 * * * *` | Resumable historical backfill: pages each enabled inbox back `historyMonths` months, storing+matching messages (no AI extraction, to control cost). Progress persisted in `app_settings.gmail_backfill_state` per inbox so a run resumes where it left off; budgeted to ~200 messages/invocation (`RUN_BUDGET`) to stay under `maxDuration` | `src/app/api/cron/gmail-backfill/route.ts` |
| `/api/admin/google/gmail/extract` | `30 * * * *` (hourly, offset :30) | AI extraction pass over synced Gmail messages (OpenAI) — pulls entities/tasks from mail | `src/app/api/admin/google/gmail/extract/route.ts` |

---

## 6. Webhooks (inbound)

| Endpoint | Provider | Verification | What it mutates |
|---|---|---|---|
| `POST /api/webhooks/resend` | Resend | Svix signature (`svix-id`/`svix-timestamp`/`svix-signature` HMAC-SHA256 against `RESEND_WEBHOOK_SECRET`, base64 key). **If the secret is unset, the route still processes and only logs a warning** (deliberate — works before secret is wired up) | Updates delivery/engagement state (`opened_at`, `clicked_at`, bounce, etc.) on both `communications` and `email_log` tables, matched by `resend_message_id`. Idempotent — only sets timestamp fields when currently null |
| `POST /api/docusign/webhook?t=<secret>` | DocuSign Connect | Shared secret in query string (`?t=`) compared to `DOCUSIGN_CONNECT_SECRET`; skipped if unset. Always ACKs 200 to avoid DocuSign retry storms | Calls `syncSignatureRequest()` (`src/lib/docusign/reconcile.ts`) to reconcile envelope status/signed-PDF filing from `event`/`envelopeId` in the push payload |
| `GET/POST /api/whatsapp/webhook` | Meta Cloud API (WhatsApp) | GET: handshake — `hub.verify_token` must equal `WHATSAPP_VERIFY_TOKEN`. POST: **no signature verification implemented** (public, no admin gate — Meta calls it directly); always returns 200 quickly, never throws | Writes delivery/read status + inbound message data to `whatsapp_log` (mapped statuses: delivered/read/failed/sent) |
| `GET /api/xero/callback` | Xero (OAuth2 redirect, not a push webhook) | httpOnly cookie `xero_oauth_state` compared to the `state` query param (CSRF), plus requires an authenticated admin session | Exchanges `code` for tokens, fetches tenant via `getConnections()`, persists tokens + tenant name into `app_settings.xero_oauth` (never puts tokens in the redirect URL) |

**Gap:** `.env` defines `STRIPE_WEBHOOK_SECRET` but no
`src/app/api/webhooks/stripe` (or similarly named) route was found anywhere
under `src/app/api/**`. Stripe events (subscription lifecycle, payment
success/failure) do not appear to have a dedicated inbound webhook handler —
worth confirming whether this is genuinely absent or handled synchronously
inline in the checkout/booking routes instead.

---

## 7. Email (Resend)

**Shared infrastructure:**
- `src/lib/email/club-email.ts` — `renderClubEmail()` (branded cream+gold HTML
  shell shared by every email) and `sendClubEmail()` (the single Resend sender:
  posts to `https://api.resend.com/emails`; from-address is
  `RESEND_FROM_NAME <RESEND_FROM_EMAIL>` falling back to `FROM_EMAIL`; returns
  `{sent:false, error:'Resend not configured'}` gracefully if unconfigured
  rather than throwing).
- `src/lib/email/admin-notify.ts` — `notifyAdmins()`: sends the branded shell
  to every `profiles` row with `role='admin'`; best-effort/swallows errors so
  it never breaks the triggering member-facing flow.
- `src/lib/email/invite.ts` — onboarding credential emails: issues a temporary
  password directly in a branded email (member signs in at `/login`), rather
  than Supabase's built-in magic-link/set-password flow.

**Callers of `sendClubEmail` (i.e., every point a transactional email fires):**
| File | Fires when |
|---|---|
| `src/app/api/admin/applications/reject/route.ts` | Membership application rejected |
| `src/app/api/admin/bookings/decision/route.ts` | Booking approved/rejected (guest or member) |
| `src/app/api/admin/enquiries/reply/route.ts` | Admin replies to an enquiry |
| `src/app/api/admin/introductions/reject/route.ts` | Introduction request rejected |
| `src/app/api/admin/introductions/send/route.ts` | Introduction sent to a member |
| `src/app/api/admin/sponsors/proposal/route.ts` | Sponsor proposal sent |
| `src/app/api/admin/sponsorship/outreach/send/route.ts` | Sponsorship outreach email sent |
| `src/app/api/enquiries/intake/route.ts` | New public enquiry intake confirmation |
| `src/app/api/events/sync/route.ts` | Event sync-triggered notification |
| `src/app/api/membership-application/confirm/route.ts` | Membership application confirmed |
| `src/lib/automations/finance-escalation.ts` | Overdue-payment finance escalation flow |
| `src/lib/automations/run.ts` | Daily automation batch (applications/bookings reminders etc.) |
| `src/lib/email/admin-notify.ts` | Any `notifyAdmins()` call site (new application/booking, etc.) |
| `src/lib/email/invite.ts` | New member/team invite credentials |
| `src/lib/sponsorship/outreach/{index,resend,types}.ts` | Sponsorship outreach engine |

Additionally, direct `resend.emails.send`/`new Resend(...)` SDK usage (not via
the shared helper) appears in:
`src/app/api/admin/sponsors/invite/route.ts`,
`src/app/api/communications/send-template/route.ts`,
`src/app/api/templates/send-test/route.ts` — likely for one-off/ad-hoc sends
(template testing, campaign sends) where the shared branded shell doesn't
apply.

Inbound: `/api/webhooks/resend` closes the loop by writing open/click/bounce
status back to `communications` and `email_log`.

---

## 8. Deployment

- **Node version:** pinned via `package.json` `engines.node: "22.x"`.
- **Framework:** Next.js 15 App Router, deployed to Vercel (`vercel.json`
  `framework: nextjs`).
- **Build:** `next build` (`typescript.ignoreBuildErrors: false` — type errors
  block deploy; `eslint.ignoreDuringBuilds: true` — lint errors do not).
- **Revalidation/caching:** most API routes explicitly set
  `export const dynamic = 'force-dynamic'` (no static caching — expected for a
  CRM with live/session-gated data). A dedicated on-demand revalidation
  endpoint exists at `src/app/api/admin/revalidate/route.ts` (likely used to
  bust ISR cache for public marketing pages — ISR/hero CMS pages presumably
  rely on this rather than time-based revalidation).
- **Cron:** see §5 — 4 scheduled jobs, all `maxDuration: 60`s, `nodejs`
  runtime.
- **Images:** Next/Image remote allow-list covers Unsplash, Supabase Storage,
  YouTube thumbnails, and Cloudinary (hero video poster).

---

## 9. Existing docs — summary of current state / known gaps

Read: `docs/PENDING-INTEGRATIONS-AND-COMMS.md`, `docs/WORK-LOG.md` (partial —
very long, newest-first changelog), `docs/V2-BUILD-HANDOVER.md` (300 lines,
not fully read line-by-line — build handover for V2 feature set),
`docs/supabase-auth-setup.md` (207 lines — Supabase Auth configuration
reference). Also present but not deep-read: `docs/AI-OPERATIONAL-AGENTS.md`,
`docs/MARKETING-AI-ENGINE.md`, `docs/SPONSORSHIP-INTELLIGENCE.md`,
`docs/TEAM-ACCOUNTABILITY.md`, `docs/PLATFORM-USER-JOURNEY-TRAINING.md`.

**`docs/PENDING-INTEGRATIONS-AND-COMMS.md`** (dated 2026-08-13, gitignored —
local-only) is the single clearest source on blocked work. All four V2
headline features (Marketing, Sponsorship Intelligence, AI Operational
Agents, Team Accountability) plus a unified Inbox tab are stated as
**built and live**. **Clay is now LIVE** via its Public Search API (the old
Growth-plan / webhook plan is obsolete — see the Clay row above). What
remains is wiring three external services, all blocked on the **client's**
side:

1. ~~Clay~~ — done (Public Search API; manual enrichment + sponsor discovery).
2. **WhatsApp Business** — needs a verified WA Business Account + Meta
   Business Verification; recommended access path is adding the dev team as
   Meta Business "Admin" by email (no password/OTP sharing) on a
   dev-controlled number. Assistant itself not built (deferred agent).
3. **Twilio/telephony** — needs an account + number; not built (deferred).
4. **Metricool** — needs the Advanced plan (~€43/mo, the only tier with API
   access); publisher stub already in place for a one-line swap once the API
   token/userId/blogId arrive. Interactive Instagram Stories can never be
   auto-published via any API regardless of plan (Meta platform limitation) —
   prepared as one-tap manual posts instead.

Also flagged in that doc: a **separate** Google Admin SDK Directory API call
(`admin.directory.user.readonly`, for auto-listing real Workspace mailboxes in
the Inbox tab) was tested live and returned `401 unauthorized_client` — the
domain-wide-delegation scope isn't yet granted by the client's Workspace
super-admin. Until resolved, the Inbox mailbox list stays hardcoded to 7
configured inboxes.

A large secondary section of that doc covers a planned **website visual
redesign** (watercolour/illustration direction inspired by Maison Estelle) —
not a backend/integration concern, mentioned here only for completeness:
technical approach agreed (CSS paper texture + transparent PNG scene layers +
in-browser CSS/JS animation, explicitly **no GIFs**), but scope (full redesign
vs. a specific section) is an open decision pending client confirmation, and
final illustration assets (seamless texture, full scenes, individually
layered moving elements) are still to be delivered by the illustrator.

**Cross-check against code:** the "built and live" integrations claim in the
doc lines up with what's in `src/lib/` — Stripe, Resend, DocuSign, Xero,
Google Gmail/Drive (service account), and Clay enrichment (Public Search
API) all have full working implementations with real API calls. WhatsApp has send + inbound
webhook plumbing (`src/lib/whatsapp/client.ts`,
`src/app/api/whatsapp/webhook/route.ts`, `src/app/api/admin/whatsapp/send`)
but no AI assistant logic wired to it yet, consistent with "not built
(deferred agent)". Metricool is a true stub, consistent with the doc.

**docs/supabase-auth-setup.md** and **docs/V2-BUILD-HANDOVER.md** were not
read in full detail in this pass (207 and 300 lines respectively) — flagged
for anyone needing deeper Supabase-Auth-config or full V2-feature handover
detail beyond what's summarized here.
