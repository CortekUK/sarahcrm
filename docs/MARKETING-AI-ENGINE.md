# Marketing AI Engine — Build Spec & Handover

> Source of truth for the 5-module Marketing AI Engine build. Every build agent MUST
> read this file first, follow the shared conventions, and append an "AS BUILT" section
> for its module when done (mirroring how `docs/TEAM-ACCOUNTABILITY.md` documents that system).

The Club by Sarah Restrick — private membership community CRM. Next.js 15 App Router,
React 19, TypeScript (strict), Supabase (Postgres/Auth/Storage/RLS), Tailwind v4, Vercel.
OpenAI (gpt-4o) for all AI. Resend for email.

---

## What this is (client requirement, from Sarah's transcript)

An AI engine that turns a **source** (an event, a typed topic, or an uploaded
audio/recording that gets transcribed) into a full **multi-channel marketing campaign**:
blogs, LinkedIn, Instagram captions, newsletter, press release, sponsor recap — each
piece drafted by AI, dropped into a strict **generate → review → approve → publish
APPROVAL QUEUE**. It NEVER direct-publishes; a human always reviews/tweaks/approves.

## Locked product decisions (confirmed with the user — DO NOT re-litigate)

1. **Sources:** (a) an existing `events` row, (b) a free-text topic/brief the admin types,
   (c) an uploaded audio/recording file → transcribed via **OpenAI Whisper**
   (`openai.audio.transcriptions`) → used as source material. (a) and (b) are the common
   path; (c) is net-new (audio upload + STT).
2. **On Approve:**
   - **Email channels (newsletter, segmented email) SEND FOR REAL** via the existing
     Resend pipeline — BUT only after the admin's final tweak/approval in the branded
     email designer. Nothing emails automatically without that human approve step.
   - **Social + blog + PR channels are MOCKED**: build a clean publishing **adapter
     interface** with a `MockPublisher` (marks published + timestamps + stores intended
     target) so that swapping in a real **Metricool** publisher later is a drop-in, NOT a
     rewrite. Admin also gets copy-to-clipboard for the finished text.
3. **Drafts:** ONE draft per channel, with a **Regenerate** button + inline editing.
4. **Newsletter/email output** lands in the existing **branded email designer**
   (block-based `email_templates`), reusing `campaigns/send` → Resend.
5. **Voices:** two EDITABLE voice profiles — "The Club" (formal luxury) + "Sarah" (warm
   founder). Admin adds/edits **reference sample posts** + guidance per voice; the AI reads
   those samples as reference. **LinkedIn auto-produces BOTH voices**; other channels pick one.
6. **Segmented email:** rule-based filters (membership_tier / tags / membership_status /
   membership_type, combinable) that auto-collect matching members, ON TOP OF the existing
   hand-picked `audiences` lists. Reuses the Resend campaigns/send pipeline.
7. **Content library:** searchable store of produced pieces, tagged by
   event / sponsor / member / **channel / voice**; reuse a past piece as a starting point.
8. **Placement:** new top-level **"Marketing"** section in the admin sidebar.

## Explicitly OUT / deferred
- **Metricool live publishing** — originally mocked (see decision 2). **Now built** (draft mode
  by default); switches on when the client's Metricool credentials are set — see
  "METRICOOL INTEGRATION — HOW IT WORKS + HOW TO TEST SAFELY" below.
- **AI graphics** — semi-automatic later (templates + human polish). Not this build.
- **Event VIDEO understanding** — DROPPED (vision unreliable on long footage). Audio/podcast
  WITH speech IS transcribed (decision 1c). Photos/CRM data are used as-is.
- **Interactive Instagram Stories** — cannot auto-publish via ANY tool; captions are text-only.

---

## Reuse map (verified file paths — copy these patterns, don't reinvent)

### AI generation
- **Pattern to mirror:** `src/app/api/templates/ai-generate/route.ts` — OpenAI
  `chat.completions.create({ model, messages, response_format:{type:'json_schema',
  json_schema}, temperature })`, Zod `safeParse` validation, `refusal` handling,
  live event-context injection, chat-thread persistence.
- **Model selection:** `process.env.OPENAI_MODEL_TEMPLATE_AI || process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06'`.
  Key: `process.env.OPENAI_API_KEY`. Client: `new OpenAI({ apiKey })`.
- **Usage logging:** `src/lib/ai/usage-logger.ts` → `logOpenAIUsage({feature, model,
  startedAt, usage?, error?, userId?})`. Call once on success, once in catch. Console-only (no DB table).
- **Attachments:** `src/lib/ai/attachments.ts` — `readAttachment(file)`, `AiAttachment`,
  `ACCEPT_ATTRIBUTE`. Images→dataUrl, PDF/DOCX/XLSX/text→extracted text. Does NOT handle
  audio — audio upload for Whisper is net-new.
- **Read-only tool registry (optional):** `src/lib/ai/tools/registry.ts` → `AGENT_TOOLS`,
  `runAgentTool(name, args, admin)`.

### Storage / content model (copy this shape)
- `email_templates` (`supabase/migrations/20260520_email_template_builder.sql`): `body_html`
  (rendered), `body_json` (block tree), `theme` (jsonb), `attachments` (jsonb),
  `subject`, `preheader`, `category` CHECK(automation|campaign|transactional), `is_draft`.
- AI chat persistence pattern: `template_ai_chats` / `template_ai_messages` (owner-scoped RLS,
  `blocks_snapshot` jsonb + `AFTER INSERT` trigger bumping parent `updated_at`).
- Contract variant (same shape, newer): `20260704_contract_templates.sql`.
- Simple sanitized rich text: `sops.body` + `sanitizeSopHtml` (isomorphic-dompurify) in `src/lib/sops.ts`.

### Email send (reuse for newsletter + segmented)
- `src/app/api/admin/campaigns/send/route.ts` — `buildRecipients(admin, audienceId)`,
  `replaceMergeTags`, Resend **batch** endpoint `https://api.resend.com/emails/batch`
  (chunk 90), `email_campaigns` snapshot row. `audience_id=null` → all active subscribers;
  else static `audience_members`. **Extend `buildRecipients` to also accept a segment rule.**
- `src/views/admin/newsletter/CampaignsTab.tsx` — `NewCampaignModal` 3-step wizard.
- `src/lib/email/club-email.ts` — `renderClubEmail`, `sendClubEmail` (transactional helper).
- Sent-campaign store: `email_campaigns` (`20260617_schema_drift_catchup.sql`) with snapshot columns.

### Segmentation data (Module 4)
- `members`: `membership_tier` (tier_1|tier_2|tier_3), `membership_status`
  (active|pending|expired|cancelled), `membership_type`, `sponsor_aligned`, enrichment cols
  (`sector`, `interest_flags text[]`, `event_preferences text[]`, …).
- Tags: `tags` (name, `category`: industry|interest|need|service) + `member_tags` (member_id, tag_id).
- Static lists: `audiences` + `audience_members` (subscriber_id XOR member_id).
- AI+tags precedent: `src/app/api/admin/members/[id]/suggest-tags/route.ts`.

### Events source material (Module 1/2)
- `events`: `title`, `description`, `event_type`, `speakers` (jsonb), `agenda` (jsonb),
  `venue_name`/`venue_city`, `cover_image_url`, `gallery_urls` (text[]), dates.
- `sponsorships` (member_id + event_id join): `package_name`, `benefits` jsonb,
  `brand_alignment`, `proposal_html`. `bookings` = attendees. NO podcast table, NO transcription today.
- Loosely-linked recap imagery: `galleries` / `gallery_photos` (matched by date/venue, no FK).

### RLS & migrations
- Helpers: `public.is_admin()` (initial_schema.sql), `public.is_staff()`
  (`20260723_accountability_foundation.sql`). Both `security definer stable sql`.
- Admin-only policy pattern:
  `create policy "Admins manage X" on public.X for all using (public.is_admin()) with check (public.is_admin());`
- Migrations: `supabase/migrations/YYYYMMDD_snake_slug.sql`, **idempotent**
  (`create table if not exists`, `drop policy if exists ... create policy`,
  `create or replace function`, `add column if not exists`). Applied via **Supabase
  Management API** (curl POST to `https://api.supabase.com/v1/projects/owjnsljovmaaxgxpxxtw/database/query`,
  `Authorization: Bearer <SUPABASE_ACCESS_TOKEN from .env>`, UA header — NOT python urllib).

### UI / nav / routing
- Sidebar: `src/app/(admin)/layout.tsx` → `NAV_SECTIONS` array. Add a group:
  `{ to:'/dashboard/marketing', label:'Marketing', icon:<lucide>, children:[...] }`.
- Route page: `src/app/(admin)/dashboard/marketing/page.tsx` — thin `'use client'` wrapper
  importing a view from `src/views/admin/marketing/`. Middleware (`src/middleware.ts`) auto
  admin-gates `/dashboard/*` — no extra guard needed.
- **HOUSE UI ONLY** — `src/components/ui/*` (barrel `src/components/ui/index.ts`: Button,
  Card, Badge, StatCard, Table, Input, Select, SelectMenu, Textarea, Modal, DateField,
  DateTimeField, FileUpload, ImageUpload, MultiImageUpload) + `src/components/admin/*`
  (`AdminPageHeader`, `AdminEmptyState`, `ConfirmDialog`). **NEVER import raw
  `src/components/ui-shadcn/*`.** In-section tabs = hand-rolled `TabButton` pattern
  (see `NewsletterPage.tsx`), active = `border-gold text-gold`.
- Theme tokens (day+night): `text-text`, `text-text-muted`, `text-text-dim`, `bg-surface`,
  `bg-surface-2`, `border-border`, `text-gold`, `bg-gold`. Fonts: `font-[family-name:var(--font-heading)]`.
  Tailwind `calc()` needs spaces or use inline `style` (invalid arbitrary values are silently dropped).

---

## Shared data model (Module 1 establishes these; later modules extend)

```
marketing_campaigns   -- one generation batch from a source
  id uuid pk, title text, source_type text check(event|topic|audio),
  event_id uuid null → events(id) on delete set null,
  topic_brief text null, transcript text null, audio_url text null,
  status text check(draft|generating|ready|archived) default 'draft',
  created_by uuid → profiles(id), created_at, updated_at

marketing_assets      -- one channel piece within a campaign
  id uuid pk, campaign_id uuid → marketing_campaigns(id) on delete cascade,
  channel text check(seo_blog|recap_blog|linkedin|instagram_feed|instagram_carousel|
                     instagram_reel|newsletter|press_release|sponsor_recap),
  voice text null check(club|sarah), title text, body text, body_html text null,
  body_json jsonb null,            -- for newsletter (email block tree)
  email_template_id uuid null → email_templates(id),  -- newsletter linkage
  status text check(draft|in_review|approved|scheduled|published|rejected) default 'draft',
  publish_target jsonb null,       -- mock social target (platform, etc.)
  scheduled_at timestamptz null, published_at timestamptz null,
  -- library tagging (Module 5):
  event_id uuid null, sponsor_member_id uuid null, member_id uuid null,
  created_at, updated_at

marketing_voices      -- Module 3 (seed two rows: club, sarah)
  id uuid pk, key text unique check(club|sarah), name text,
  guidance text, samples jsonb default '[]',  -- array of {label, text}
  updated_by uuid, updated_at

marketing_segments    -- Module 4 (saved rule-based segments; optional to persist)
  id uuid pk, name text, rules jsonb,  -- {tiers:[], tag_ids:[], statuses:[], types:[]}
  created_by uuid, created_at
```
All tables: `enable row level security` + `Admins manage <t>` policy using `is_admin()`.
Add `set_updated_at` triggers via `handle_updated_at()` where an `updated_at` col exists.

## Publishing adapter (Module 1)
`src/lib/marketing/publish/` :
- `types.ts` — `interface Publisher { publish(asset): Promise<PublishResult> }`,
  `PublishResult = { ok, externalId?, error? }`.
- `mock.ts` — `MockPublisher`: logs, returns `ok:true` with a fake id; caller marks asset
  `published` + sets `published_at`. Stores intended target in `publish_target`.
- `metricool.ts` — `MetricoolPublisher` (real, draft mode by default — see the Metricool
  section at the end of this doc). `metricool-client.ts` — its server-side axios client.
- `index.ts` — `getPublisher(channel)`: MetricoolPublisher for LinkedIn/Instagram/Facebook/TikTok when the
  Metricool credentials are set, else MockPublisher; **BlogPublisher** (`blog.ts`) for seo_blog/recap_blog
  (public post on the website's `/blog`); MockPublisher for PR/sponsor recap. See "AS BUILT — Facebook
  channel + website blog publishing" and "AS BUILT — TikTok channel" at the end.

---

## How we work (the workflow — unchanged from Team Accountability)
One module at a time via an **Opus 4.8 sub-agent** given explicit self-contained
instructions → **I (the orchestrator) review**: live RLS check via Management API, grep new
files for `ui-shadcn`, `npx tsc --noEmit`, no regressions, decisions honored → fix / send
back → only then move to the next module. User reviews all 5 at the very end.

Gate checklist per module:
- [ ] Migration idempotent + APPLIED + verified live (table exists, RLS on, policy present)
- [ ] House UI only (no `ui-shadcn` imports in new files)
- [ ] `npx tsc --noEmit` clean
- [ ] Locked decisions honored (esp. never-auto-publish, mock-social seam, human approve gate)
- [ ] AS BUILT section appended to this doc

---

## Modules
1. **Foundation + Generator + Approval Queue** — schema above, Marketing nav section,
   campaign create (event/topic/audio+Whisper), OpenAI generation route, approval queue UI,
   publishing adapter (mock). Starts with a SMALL channel set (e.g. LinkedIn + SEO blog) to
   prove the spine; Module 2 adds the rest.
2. **All channels** — full channel set + per-channel prompt tuning + newsletter→email-designer
   handoff + copy-to-clipboard + mock-publish wiring.
3. **Brand voices** — `marketing_voices`, voice-manager UI (edit guidance + reference samples),
   generation reads voices; LinkedIn dual-voice output.
4. **Segmented email** — rule-based segment builder + resolver, extend `buildRecipients`,
   send via Resend through the approval gate.
5. **Content library** — searchable/filterable library over approved assets (event/sponsor/
   member/channel/voice), reuse-as-starting-point.

<!-- AS BUILT sections appended below by each module's agent -->

> **Marketing AI Engine — COMPLETE (Modules 1-5).** All five modules are built,
> reviewed and additive: Foundation + generator + approval queue (1), full 9-channel
> set + newsletter→designer handoff (2), editable brand voices + LinkedIn dual-voice
> fan-out (3), rule-based segmented email (4), and the searchable Content Library with
> reuse-as-starting-point (5). Marketing nav now carries **Campaigns / Voices / Segments /
> Library**. The ONLY remaining blocked piece is **Module 6 / Metricool live publishing**
> (UPDATE: `MetricoolPublisher` is now built and switches on automatically once the client's
> Metricool credentials are in env — draft mode by default; see the Metricool section at the end).

---

## AS BUILT — Module 1 (Foundation + Generator + Approval Queue)

Proves the pipeline end-to-end for a SMALL channel set: **SEO blog** + **LinkedIn**
(Club voice hardcoded). Other channels, editable voices, segments and the library are
Modules 2-5.

### Database (migration `supabase/migrations/20260723_marketing_engine_foundation.sql`)
Applied via the Supabase Management API and verified live:

- `public.marketing_campaigns` — one generation batch from a source. Columns:
  `id, title, source_type(event|topic|audio), event_id→events, topic_brief, transcript,
  audio_url, status(draft|generating|ready|archived), created_by→profiles,
  created_at, updated_at`.
- `public.marketing_assets` — one channel piece per campaign. Columns:
  `id, campaign_id→marketing_campaigns (cascade), channel(<full 9-channel set>),
  voice(club|sarah), title, body, body_html, body_json, email_template_id→email_templates,
  status(draft|in_review|approved|scheduled|published|rejected), publish_target(jsonb),
  scheduled_at, published_at, event_id, sponsor_member_id, member_id, created_at, updated_at`.
  (The full channel enum + voice/library columns exist now, additive, so Modules 2/3/5 need
  no schema change.)
- Both: RLS enabled; single `Admins manage <table>` FOR ALL policy using `public.is_admin()`;
  `set_updated_at` BEFORE UPDATE trigger on `public.handle_updated_at()`.

Verification query result (live):
```
[{"table_name":"marketing_assets","rls_enabled":true,"policy_count":1,"policies":"Admins manage marketing_assets"},
 {"table_name":"marketing_campaigns","rls_enabled":true,"policy_count":1,"policies":"Admins manage marketing_campaigns"}]
```

### Files created
- `src/lib/marketing/admin.ts` — shared `requireAdmin()` + service-role `getAdmin()` (untyped
  client so the new tables, not in generated types, are queryable).
- `src/lib/marketing/publish/types.ts` — `Publisher` interface, `PublishableAsset`, `PublishResult`.
- `src/lib/marketing/publish/mock.ts` — `MockPublisher` (logs, fake externalId, echoes target).
- `src/lib/marketing/publish/metricool.ts` — `MetricoolPublisher` + `buildMetricoolPostBody` (real; draft by default).
- `src/lib/marketing/publish/metricool-client.ts` — server-side axios client for the Metricool API.
- `src/lib/marketing/publish/index.ts` — `getPublisher(channel)`; Metricool for social when configured, else mock.
- `src/app/api/admin/marketing/transcribe/route.ts` — POST audio → OpenAI Whisper → `{ transcript }`.
- `src/app/api/admin/marketing/generate/route.ts` — POST `{campaign_id, channels, regenerate_asset_id?}`;
  builds source context (event/topic/transcript), OpenAI json_schema structured output, Zod-validated,
  writes/updates `marketing_assets` (one draft per channel, status 'draft').
- `src/app/api/admin/marketing/campaigns/route.ts` — GET list (+asset counts) / POST create.
- `src/app/api/admin/marketing/campaigns/[id]/route.ts` — GET campaign + assets (approval-queue payload).
- `src/app/api/admin/marketing/assets/[id]/route.ts` — PATCH; ALL status transitions server-side;
  `approve` is the human gate → routes blog/linkedin through `getPublisher().publish()` then sets
  `published` + `published_at`.
- `src/app/(admin)/dashboard/marketing/page.tsx` + `.../[id]/page.tsx` — thin client wrappers.
- `src/views/admin/marketing/MarketingPage.tsx` — campaigns list + New-campaign modal
  (event picker / topic textarea / audio upload→transcribe, channel toggles, create→generate).
- `src/views/admin/marketing/CampaignDetailPage.tsx` — approval queue: per-asset card with status
  badge, inline edit, Regenerate / Edit-Save / Approve / Reject / Copy.

### Files modified
- `src/app/(admin)/layout.tsx` — added a top-level **Marketing** nav section (icon `Megaphone`,
  child "Campaigns" → `/dashboard/marketing`). Additive only.

### Routes
- `GET/POST  /api/admin/marketing/campaigns`
- `GET       /api/admin/marketing/campaigns/[id]`
- `POST      /api/admin/marketing/generate`
- `POST      /api/admin/marketing/transcribe`
- `PATCH     /api/admin/marketing/assets/[id]`
All admin-only (routes self-gate via `requireAdmin` — `/api/*` is not covered by the
`/dashboard` middleware).

### Flow
New campaign modal → `POST campaigns` (persist source) → `POST generate` (OpenAI drafts per
channel, status 'draft', campaign → 'ready') → redirect to `/dashboard/marketing/[id]` approval
queue → per asset: edit / **Regenerate** / **Copy** / **Reject** / **Approve**. Approve on
blog/linkedin runs the MockPublisher and flips the asset to `published` + `published_at`.
**Nothing publishes without the explicit Approve click.**

### How to test (human)
1. Go to admin sidebar → **Marketing** → **Campaigns**. (Requires an admin login.)
2. Click **New campaign**. Give it a title.
   - **Topic path:** Source = "A typed topic / brief", type a brief (e.g. "Why intimate
     founder dinners beat big conferences"). Leave both channels ticked. Click
     **Create & generate**.
   - **Event path:** Source = "An event", pick an event from the dropdown, generate.
   - **Audio path:** Source = "An audio recording", upload an mp3/m4a/wav (≤25 MB), wait for
     the transcript to appear (editable), then generate.
3. You land on the campaign detail (approval queue) with two draft cards: **SEO blog** and
   **LinkedIn**, each badged `draft`, showing generated copy.
4. **Edit** → change text → **Save** (card stays draft, content persists on reload).
5. **Regenerate** on a card → its body is replaced with a fresh draft (same row).
6. **Copy** → body text is on your clipboard ("Copied" flashes).
7. **Approve & publish** → badge flips to `published`, buttons disable, `published_at` set.
   (MockPublisher — logs `[marketing/publish] MOCK publish …` server-side; no real post.)
8. **Reject** on a draft → badge flips to `rejected`.
9. Reload — all statuses/edits persist. Back on Campaigns the row shows status `ready` and the
   draft count.

### Decisions / assumptions
- **Untyped service-role client** for all marketing DB access in API routes (generated
  `Database` types don't include the new tables yet); avoids regenerating types this module.
- **Client views never query marketing tables directly** — they go through the admin API routes;
  the only direct typed-client query is `events` (for the picker), which exists in the types.
- **Campaign create is a separate step from generate** (two calls from the modal). If generate
  fails, the campaign still exists and the user is dropped into its (empty) detail page to retry.
- **One draft per channel** enforced by generate: it updates the campaign's existing row for a
  channel (or the explicit `regenerate_asset_id`) rather than inserting duplicates.
- **Nav**: added as its own top-level section (per locked decision 8) using a group so
  Modules 3-5 can add Voices/Segments/Library children without further layout edits.
- **Audio limit** 25 MB (OpenAI Whisper hard cap); `whisper-1` model.
- **`audio_url`** column exists but is unused in Module 1 (we store the transcript, not the file);
  reserved for when audio files are persisted to Storage.
- **Approve routes only blog/linkedin/social/PR through the adapter**; `newsletter` approval is
  explicitly rejected server-side (email pipeline is Module 2/4).

### Left for later modules
- Module 2: remaining channels + per-channel tuning + newsletter→email-designer handoff.
- Module 3: `marketing_voices` table + editable voices; LinkedIn dual-voice (currently Club only).
- Module 4: `marketing_segments` + segmented email send.
- Module 5: content library over approved assets.
- Metricool: DONE — `MetricoolPublisher` built; needs credentials + the safe-testing checklist
  in the Metricool section at the end of this doc.

---

## AS BUILT — Module 2 (All channels + newsletter → email-designer handoff)

Brings the generator to the FULL 9-channel set and integrates the newsletter with
the EXISTING branded email designer. Additive only — no migration, no changes to the
email editor / email `ai-schema` / `email_templates` schema / Module 1 DB tables.

### Channel set (now complete)
Text channels (structured OpenAI call, one draft per channel, Club voice hardcoded —
Module 3 makes voices editable): `seo_blog`, `recap_blog`, `linkedin`, `instagram_feed`,
`instagram_carousel`, `instagram_reel`, `press_release`, `sponsor_recap`.
Special channel: `newsletter` → real email blocks + email-designer handoff (below).

Per-channel tuned briefs live in `CHANNEL_BRIEFS` in the generate route:
- **seo_blog** — 500-800w Markdown SEO article. **recap_blog** — 400-700w event write-up
  that leans on speakers/agenda/atmosphere and (when present) attendees + photos.
- **linkedin** — single 120-220w post. **instagram_feed** — one caption + 5-10 hashtags.
  **instagram_carousel** — *(superseded 2026-10-22, see "Instagram carousels + EXIF orientation" at the
  end: body = caption only, slide text in a separate `slides` array)* **instagram_reel** —
  *(superseded 2026-10-22, see "Instagram Reels — video editor" at the end: title = on-screen hook, body =
  caption only, no `Hook:`/`Caption:` labels)*. (All Instagram output is text only — the prompt
  explicitly forbids Stories, which can't be auto-published.)
- **press_release** — formal PR (headline, optional dateline, third-person body, optional
  real quote only, "About The Club" boilerplate). **sponsor_recap** — a warm recap
  addressed to the event's sponsor, using the fetched sponsorship package/benefits/
  brand_alignment.

### Newsletter → branded email designer (the important piece)
When `newsletter` is requested, `src/lib/marketing/newsletter.ts` runs a SECOND OpenAI
call using the email builder's schema (`openAiJsonSchema` / `aiTemplateResponseSchema`
from `src/lib/templates/ai-schema.ts`), expands the result with `expandAiBlocks` into real
`EditorBlock[]`, and renders `body_html` with `renderBlocksToHTML` (from
`src/lib/templates/render-html.ts`). The generate route then:
- **Creates an `email_templates` row** (`category='campaign'`, `is_draft=true`, with
  `name/subject/preheader/body_html/body_json/theme`, `created_by_id`), via the service-role
  admin client. On regenerate it UPDATES the already-linked template row instead of making a
  new one.
- **Stores `email_template_id` on the `marketing_assets` row** (plus a short readable
  plain-text summary in `body` for the queue preview, and `body_html`/`body_json` mirrored).
- Newsletter does **NOT** go through the publishing adapter and is **not** marked published
  here. The approval queue shows an **"Open in email designer"** button that deep-links to
  the existing editor; the human finishes/approves/sends THERE (segmented send is Module 4).
  Module 1's server-side block on newsletter in the adapter approve path is untouched.

**Email-editor deep-link route used:**
`/dashboard/communications/templates/editor?id=<email_template_id>`
(`src/app/(admin)/dashboard/communications/templates/editor/page.tsx` reads `?id=` and
mounts `EmailEditorPage`, which loads the `email_templates` row by id — same URL
`useEmailEditor` itself navigates to after creating a template).

### Files created
- `src/lib/marketing/channels.ts` — shared channel metadata (full 9-channel set, labels,
  hints, groups, `TEXT_CHANNELS`, ordering + `isTextChannel`/`isMarketingChannel` guards).
  Pure data, importable client + server.
- `src/lib/marketing/newsletter.ts` — `generateNewsletterDraft()`: OpenAI (email schema) →
  `expandAiBlocks` → `renderBlocksToHTML` → `{name,subject,preheader,bodyHtml,bodyJson,theme,
  textSummary}`. Focused newsletter system prompt (Club voice + block guidance).

### Files modified
- `src/app/api/admin/marketing/generate/route.ts` — expanded to all channels: per-channel
  briefs for the 8 text channels (one structured call, one draft per channel), plus the
  separate newsletter path (email_templates row + linked asset). Enriched event context
  (cover image, gallery photo count, attendee count via `bookings`, sponsorship details via
  `sponsorships` + `members` when `sponsor_recap` is requested). Shared
  `resolveTargetAssetId()` keeps ONE draft per channel / honours `regenerate_asset_id`.
- `src/app/api/admin/marketing/campaigns/[id]/route.ts` — added `email_template_id` to the
  asset select so the queue can render the newsletter button.
- `src/views/admin/marketing/MarketingPage.tsx` — create modal now offers all channels,
  grouped (Blogs / LinkedIn / Instagram / Newsletter / PR / Sponsor) with Select-all/Clear.
- `src/views/admin/marketing/CampaignDetailPage.tsx` — queue renders every channel (icon +
  shared label + status badge), sorted by channel order; newsletter cards are read-only with
  **Regenerate** + **Open in email designer** (opens the editor deep-link in a new tab) and
  no approve/reject/edit (the human finishes in the designer).

### Decisions / assumptions
- **Two OpenAI calls when both text channels and newsletter are requested** — text channels
  share one structured `assets[]` call; the newsletter needs the entirely different email
  block schema, so it gets its own call. Each logs usage separately
  (`marketing-generate` / `marketing-generate-newsletter`).
- **Newsletter `theme` defaults to brand chrome** (helper returns null unless the model set
  overrides) so the designer applies The Club's cream/gold defaults.
- **Newsletter asset `body`** holds a plain-text digest (subject + preheader + first
  paragraphs) purely for the queue preview; the real editable content is `body_json` on the
  linked `email_templates` row.
- **Regenerate reuses the linked `email_templates` row** (updates in place) rather than
  orphaning templates.
- **Default channel selection stays small** (`seo_blog` + `linkedin`) to avoid firing all
  nine generations by default; admin ticks the rest (Select-all provided).
- **Sponsor/attendee context is best-effort** — missing `sponsorships`/`bookings` data never
  fails generation; the prompt tells the model to write around absent detail.
- Club voice still hardcoded for text channels (Module 3 owns editable voices + LinkedIn
  dual-voice).

### No migration needed
Confirmed: every column used already exists from Module 1 — `marketing_assets` has
`email_template_id`, `body_html`, `body_json`, nullable `voice`, `event_id`,
`sponsor_member_id`, and the full 9-channel `channel` enum; `email_templates` already has
`name/subject/preheader/body_html/body_json/theme/category/is_draft/created_by_id`. No schema
change was applied.

### How to test (human)
1. Admin sidebar → **Marketing** → **New campaign**. Pick a source (topic/event/audio) and
   give it a title.
2. In **Channels to generate**, tick a spread across groups (or **Select all**) — e.g.
   SEO blog, Recap blog, LinkedIn, Instagram feed/carousel/reel, Press release, Newsletter,
   and (event source) Sponsor recap. Click **Create & generate**.
3. Land on the approval queue: one card per channel, grouped/ordered, each with a channel
   icon + label + `draft` badge and its tuned copy. Verify:
   - **Blogs** read as Markdown articles; **recap_blog** references the event.
   - **Instagram carousel** shows `Slide 1:`…; **reel** shows the hook as the title and a label-free caption (since 2026-10-22).
   - **press_release** has a headline + "About The Club" boilerplate.
   - **sponsor_recap** (event source with a sponsorship) addresses the sponsor and mentions
     the package/benefits.
4. On a text card: **Edit → Save**, **Regenerate**, **Copy**, **Reject**, **Approve &
   publish** (runs MockPublisher → `published`) — all as in Module 1.
5. **Newsletter card**: it's read-only with a summary. Click **Open in email designer** →
   a new tab opens `/dashboard/communications/templates/editor?id=…` with the generated
   newsletter loaded as editable blocks (cream/gold chrome, greeting, body, signature).
   Tweak/approve/send happens there. Back in the queue, **Regenerate** on the newsletter
   rebuilds the SAME linked template (reopen the designer to see the new draft).
6. Reload — all statuses/links persist. (Approving a newsletter via the API is still blocked
   server-side by design.)

---

## AS BUILT — Module 3 (Brand voices + LinkedIn dual-voice fan-out)

Implements locked decision 5: two EDITABLE brand voices — **"The Club"** (formal
luxury) and **"Sarah"** (warm, conversational founder) — each with editable guidance
AND a set of reference sample posts that generation reads. **LinkedIn now auto-produces
FOUR drafts** (Club voice, Sarah voice, a Sponsor angle, a Founder-spotlight angle);
every other voice-relevant text channel uses ONE chosen voice.

### Database (migration `supabase/migrations/20260723_marketing_voices.sql`)
Applied via the Supabase Management API (curl, token from `.env`) and verified live:

- `public.marketing_voices` — `id, key (unique, check club|sarah), name, guidance,
  samples jsonb default '[]' (array of {label,text}), updated_by→profiles, created_at,
  updated_at`. RLS enabled; single `"Admins manage marketing_voices"` FOR ALL policy via
  `public.is_admin()`; `set_updated_at` BEFORE UPDATE trigger. **Seeded two rows** (`club`,
  `sarah`) with starter names + guidance and empty samples, via
  `insert … on conflict (key) do nothing` (non-clobbering — re-running never overwrites
  admin edits).
- `public.marketing_assets.variant text` (nullable, `add column if not exists`) —
  distinguishes the LinkedIn drafts (`voice_club` | `voice_sarah` | `sponsor` |
  `founder_spotlight`); null for every non-LinkedIn channel. Keys the one-draft-per-variant
  dedup.

Live verification:
```
marketing_voices → rls_enabled: true, policy_count: 1, "Admins manage marketing_voices"
seed rows        → [{"key":"club","name":"The Club","samples_type":"array"},
                    {"key":"sarah","name":"Sarah","samples_type":"array"}]
variant column   → {"column_name":"variant","data_type":"text","is_nullable":"YES"}
```

### Files created
- `src/app/api/admin/marketing/voices/route.ts` — GET (list both voices) + PATCH/PUT
  (update a voice's name/guidance/samples). Admin-only; Zod-validated (`samples` = array of
  `{label,text}`); writes `updated_by`.
- `src/views/admin/marketing/VoicesPage.tsx` — two voice cards (house `Card`), each with an
  editable name, guidance `Textarea`, and an add/edit/remove reference-samples editor + Save.
  House UI + theme tokens only.
- `src/app/(admin)/dashboard/marketing/voices/page.tsx` — thin `'use client'` wrapper.

### Files modified
- `src/lib/marketing/channels.ts` — added `VOICE_KEYS`/`VOICE_LABELS`, `LINKEDIN_VARIANTS`,
  `LINKEDIN_VARIANT_META` (label + which voice each variant is written in), and
  `linkedInVariantLabel()` / `isLinkedInVariant()`. Pure data, shared client + server.
- `src/app/api/admin/marketing/generate/route.ts` — loads both voices, builds a voice-context
  string per voice, applies the campaign's chosen voice to single-voice text channels, and
  fans LinkedIn out to four variants (see below).
- `src/app/api/admin/marketing/campaigns/[id]/route.ts` — added `variant` to the asset select.
- `src/views/admin/marketing/MarketingPage.tsx` — create modal now has a **Default voice**
  selector (The Club / Sarah) applied to the voice-relevant channels, with a note that LinkedIn
  always produces all four variants; passes `default_voice` to generate.
- `src/views/admin/marketing/CampaignDetailPage.tsx` — LinkedIn cards read
  "LinkedIn · The Club / Sarah / Sponsor / Founder spotlight", show the voice line, and are
  ordered deterministically (channel order, then variant order). Each remains independently
  editable / regenerate / approve / reject / copy.
- `src/app/(admin)/layout.tsx` — added a **Voices** child to the Marketing nav group.

### How voice context is injected
`buildVoiceContext(voiceRow)` concatenates the voice's `guidance` with its reference
`samples` (each rendered as `Sample N — <label>:\n<text>`) under an instruction to mimic
their tone/rhythm but not copy them verbatim or reuse their facts. If a voice row is missing
or has empty guidance AND no samples, it falls back to the original hardcoded `CLUB_VOICE`
string (Modules 1/2 behaviour). The context string is dropped into the system prompt in place
of the old hardcoded voice.

- **Single-voice text channels** (`seo_blog`, `recap_blog`, `instagram_feed`,
  `instagram_carousel`, `instagram_reel`, `press_release`, `sponsor_recap`): the batch uses
  `voiceContext[chosenVoice]`, where `chosenVoice` is the request's `default_voice` on a fresh
  generate, or — on a single-asset regenerate — the voice already stored on that asset. The
  chosen voice is written to the asset's `voice` column.

### LinkedIn fan-out + dedup keying
`linkedin` is pulled OUT of the shared text batch and handled by its own structured OpenAI
call (`feature: 'marketing-generate-linkedin'`). The system prompt carries BOTH voice
contexts (Club + Sarah) and per-variant briefs; the JSON schema's `variant` enum is narrowed
to exactly the variants being produced. Variant → voice mapping: `voice_club`→club,
`voice_sarah`→sarah, `sponsor`→club, `founder_spotlight`→sarah. Sponsor context (from
`sponsorships` + `members`) is now loaded whenever LinkedIn is requested (not just
`sponsor_recap`) so the sponsor variant has real material on event campaigns.

- **Full generation** produces all four variants (four `marketing_assets` rows, all
  `channel='linkedin'`, distinct `variant`).
- **Regenerate** of one LinkedIn card sends `regenerate_asset_id`; the route reads that
  asset's `variant` and regenerates ONLY that variant — the other three are untouched.
- **Dedup** is keyed on **(campaign_id, channel, variant)** via `resolveTargetAssetId`
  (`variant IS NULL` for single-draft channels, `variant = <key>` for LinkedIn). Re-running
  generation updates each variant in place — no duplicates, one draft per channel/variant.

### Decisions / assumptions
- **Chosen voice persists on the asset**, not on the campaign (no campaign schema change).
  Regenerate reuses the asset's stored voice so a regenerated text draft keeps its voice.
- **Sponsor variant uses the Club voice** (formal partnership register); founder-spotlight
  uses Sarah. The spec left sponsor's voice open; Club was the natural fit.
- **LinkedIn temperature 0.7** (vs 0.6 for the text batch) to push the four variants further
  apart.
- **Empty-samples fallback**: seeded voices ship with `samples='[]'`, so until an admin adds
  samples the model works from guidance alone (still voice-aware).
- **Pre-existing null-variant LinkedIn rows** (if any Module 1/2 campaign already has one)
  are treated as non-matching by the variant dedup; regenerating such a campaign creates the
  four proper variant rows and leaves the legacy row as an ignored orphan. Not expected in
  practice (variants are new this module).
- Never-auto-publish / human-approve gate / mock-social seam all untouched; additive only.

### How to test (human)
1. Admin sidebar → **Marketing** → **Voices**. Two cards: **The Club** and **Sarah**.
2. On **Sarah**, tweak the guidance (e.g. add "use the phrase 'I still remember…' when
   recalling an event"), click **Add sample**, give it a label (e.g. "LinkedIn — winter
   dinner") and paste a real warm founder-style post, then **Save voice**. Reload — the edit
   and sample persist.
3. Marketing → **New campaign**. Pick a source (topic/event/audio) + title. Set **Default
   voice = Sarah**. Tick e.g. SEO blog + LinkedIn. **Create & generate**.
4. In the approval queue:
   - The **SEO blog** reads in Sarah's warmer first-person voice (card shows "Sarah voice").
   - **LinkedIn** shows **four** cards: "LinkedIn · The Club", "LinkedIn · Sarah",
     "LinkedIn · Sponsor", "LinkedIn · Founder spotlight" — the Club one formal, the Sarah/
     founder ones warm and first-person (reflecting your guidance + sample), the Sponsor one
     leaning on partnership/sponsor detail (on an event source with a sponsorship).
5. **Regenerate** the "LinkedIn · Sarah" card only → its body refreshes; the other three
   LinkedIn cards are unchanged.
6. Edit / Save / Copy / Reject / **Approve & publish** each LinkedIn variant independently
   (same behaviour as any text channel; MockPublisher on approve).
7. Reload — the four variants, their voices, statuses and edits persist.

### Left for Modules 4-5
- Module 4: `marketing_segments` + rule-based segmented email send through the approval gate.
- Module 5: content library over approved assets (filter by event/sponsor/member/channel/voice
  — `voice` and now `variant` are both available on `marketing_assets`).

---

## AS BUILT — Module 4 (Rule-based segmented email)

Implements locked decision 6: an admin can define **rule-based segments of
members** (tier / status / type / tags, combinable) that auto-collect
everyone matching *right now*, and email them by **reusing the existing
Resend `campaigns/send` pipeline + `email_campaigns` snapshot** — alongside
the untouched "All active subscribers" and static "saved audience" paths.
**Additive throughout: the two pre-existing send paths are byte-for-byte
unchanged when no segment is passed.**

### Database (migration `supabase/migrations/20260723_marketing_segments.sql`)
Applied via the Supabase Management API (curl, token from `.env`) and verified live:

- `public.marketing_segments` — `id, name, rules jsonb default '{}', created_by→profiles
  (on delete set null), created_at, updated_at`. RLS enabled; single
  `"Admins manage marketing_segments"` FOR ALL policy via `public.is_admin()`;
  `set_updated_at` BEFORE UPDATE trigger on `public.handle_updated_at()`. Idempotent.
- `rules` shape (documented in the migration header): `{ tiers: string[],
  statuses: string[], types: string[], tag_ids: string[], tag_match: 'any'|'all' }`.
  Any omitted/empty key = no constraint on that dimension. Empty `statuses`
  defaults to **active-only** (mirrors the existing member recipient path).

Live verification:
```
[{"table_name":"marketing_segments","rls_enabled":true,"policy_count":1,
  "policies":"Admins manage marketing_segments"}]
```

### Files created
- `src/lib/marketing/segments.ts` — the resolver. `resolveSegmentRecipients(admin, rules)`
  returns the SAME member recipient shape `buildRecipients` uses
  (`{ email, first_name, last_name, unsubscribe_token:null }`) so `replaceMergeTags`
  works unchanged. Filters `members` on tier/status/type (default active + not-deleted),
  applies tag filtering via `member_tags`, joins `profiles` for email/name, dedups by
  lowercased email. Also `countSegment()`, `normaliseRules()`, `summariseRules()`.
- `src/app/api/admin/marketing/segments/route.ts` — saved-segment CRUD
  (GET list / POST create / PATCH update / DELETE `?id=`). Admin-only via
  `requireAdmin`/`getAdmin`; Zod-validated.
- `src/app/api/admin/marketing/segments/preview/route.ts` — POST `{ rules }` or
  `{ segment_id }` → `{ count, sample: [{name,email}] }` (first 8) for the live preview.
- `src/views/admin/marketing/SegmentsPage.tsx` — house-UI builder: name + chip
  multi-selects (tiers/statuses/types), category-grouped tag picker, any/all toggle,
  and a debounced LIVE matching-member count + sample. Card grid with per-card live count,
  edit, delete.
- `src/app/(admin)/dashboard/marketing/segments/page.tsx` — thin `'use client'` wrapper.

### Files modified (marked non-regressive)
- **`src/app/api/admin/campaigns/send/route.ts`** — the ONLY change to the existing send
  pipeline. Added an optional `segment` field to the request body and a recipient-source
  branch. When `segment` is present (a saved `segment_id` OR inline `rules`), recipients
  come from `resolveSegmentRecipients` and `audience_label` becomes
  `"Segment: <name>"` (or a rules summary for ad-hoc), with `audience_id` left NULL on the
  snapshot (a segment is not a static audience). **When `segment` is absent, the code takes
  the exact original path** — `buildRecipients(admin, audienceId)`, same label logic, same
  `email_campaigns` insert, same merge-tag + unsubscribe-footer behaviour. `buildRecipients`,
  `replaceMergeTags`, `buildBodyFor`, the Resend batch send and the snapshot insert are all
  untouched. Members still get `unsubscribe_token: null` (no footer), matching current logic.
- **`src/views/admin/newsletter/CampaignsTab.tsx`** — `NewCampaignModal` audience step now
  offers a third option **"smart segment"**. Refactored the internal `useAllSubs` boolean
  into a single `mode: 'all'|'audience'|'segment'` so the three paths are mutually exclusive;
  the "all" and "audience" branches produce identical payloads to before
  (`{ template_id, audience_id }` with `audience_id: null` for all-subs). The segment branch
  adds `segment: { segment_id }`. Segments + live counts are loaded best-effort (a failure
  never blocks the wizard).
- **`src/app/(admin)/layout.tsx`** — added a **Segments** child (icon `Filter`) to the
  Marketing nav group. Additive.

### Recipient-source contract added to the send body
```
POST /api/admin/campaigns/send
{
  template_id: string,             // unchanged
  audience_id?: string | null,     // unchanged — static audience or null (=all subs)
  segment?: {                      // NEW, optional. When present it WINS and audience_id
    segment_id?: string,           //   is forced null on the snapshot.
    rules?: { tiers, statuses, types, tag_ids, tag_match }
  }
}
```
Old callers send no `segment` → identical behaviour. The wizard only attaches `segment`
in segment mode.

### How tag_match any/all is queried
`members` are first filtered by tier/status/type (default active + `deleted_at is null`).
Their ids are then looked up in `member_tags` filtered to the requested `tag_ids`. We build
a per-member set of held tag ids: **`any`** keeps members holding ≥1 requested tag;
**`all`** keeps members whose held-set size ≥ the count of distinct requested tag ids
(i.e. holds every requested tag). Dedup by lowercased profile email at the end so the
preview count equals the exact send count.

### Decisions / assumptions
- **Untyped service-role client** for `marketing_segments` (not in generated types), per the
  Module 1-3 convention; the resolver takes the client so it never imports service-role itself.
- **Segment always beats audience_id** if both are somehow passed (the wizard never does).
- **`membership_status` enum includes `paused`** (verified live) — exposed as a selectable
  status in the builder.
- **Preview count = send count**: the preview API runs the identical resolver (post-dedup,
  profile-email-only), so the number the admin sees is what actually gets emailed.
- **Ad-hoc rules supported by the send route** (`segment.rules`) even though the wizard
  currently only sends saved `segment_id` — keeps the door open for an inline builder without
  another API change.
- Never-auto-publish / human-approve gate untouched: the wizard's **Send** click is still the
  approval gate; nothing auto-sends.

### How to test (human)
1. **Build a segment with a live count.** Admin sidebar → **Marketing → Segments → New
   segment**. Name it (e.g. "Active Tier 3 — Finance"). Tick tier **Tier 3**, leave status
   empty (defaults to active), optionally tick a **Tag** and set **Match ANY/ALL**. Watch the
   "Matching members (live)" badge update as you toggle (with sample names). **Create segment**
   — it appears as a card showing its rule summary and member count.
2. **Send a campaign to it.** Marketing/Communications → Campaigns → **New campaign** →
   pick a campaign template → **Audience** step now shows three groups: *All active
   subscribers*, *custom lists*, and **smart segments** (each with a live member count).
   Pick your segment → **Next** → **Review** shows "Segment: <name>" + the recipient count →
   **Send**. A real Resend batch goes out; the campaign row records `audience_label =
   "Segment: <name>"`, `audience_id = null`, and the recipient/sent counts.
3. **Regression — all subscribers.** New campaign → keep **All active subscribers** → send.
   Snapshot shows `audience_label = "All active subscribers"`, same counts as before.
4. **Regression — saved audience.** New campaign → pick an existing custom list → send.
   Snapshot shows the list name, subscribers+members combined, deduped — identical to
   pre-Module-4.

### Left for Module 5
- Content library over approved assets (filter by event/sponsor/member/channel/voice).
- Optional: ad-hoc (unsaved) segment builder directly inside the campaign wizard (the send
  route + preview API already accept inline `rules`; only the wizard UI would need it).

---

## AS BUILT — Module 5 (Content Library + reuse-as-starting-point)

Implements locked decision 7: a **searchable, filterable library of every finished
marketing piece**, tagged by event / sponsor / member / channel / voice, with
**reuse a past piece as a starting point** (clone into a fresh campaign — the original
is never touched). Additive throughout.

### No migration needed
Confirmed — every column the library uses already exists on `marketing_assets` from
Modules 1/3: `channel, voice, variant, status, event_id, sponsor_member_id, member_id,
email_template_id, title, body, published_at, updated_at`. **No schema change was
applied.** The only DB-facing change is that generation now *populates* `event_id` /
`sponsor_member_id` (they existed but were mostly null before).

### 1. Tag dimensions now populated (small additive change to the generate route)
`src/app/api/admin/marketing/generate/route.ts` — best-effort stamping so the
event/sponsor filters actually resolve. Never fails generation if data is absent:
- Hoisted `eventStamp` (= `campaign.event_id` when `source_type==='event'`, else null)
  and `sponsorMemberId` (the first resolved `sponsorships.member_id` for the event,
  captured inside the existing sponsor-context block).
- **Text channels**: insert AND update now stamp `event_id: eventStamp`; `sponsor_recap`
  additionally stamps `sponsor_member_id: sponsorMemberId` (other channels null).
- **LinkedIn**: same, with the `sponsor` variant stamping `sponsor_member_id` (the other
  three variants null).
- **Newsletter**: `event_id` moved into the shared `assetRow` so both insert and update
  stamp it.
Nothing else about generation changed (prompts, channel set, voices, dedup all untouched).

### 2. Library API — `src/app/api/admin/marketing/library/route.ts` (GET)
Admin-only (`requireAdmin`/`getAdmin`, untyped service-role client).
- **Library-worthy predicate** (a PostgREST `.or`): `status in ('approved','published')`
  **OR** `email_template_id is not null` (so finished newsletters handed to the designer
  appear even though they never hit the mock-publish `approved` path).
- **Filters** (all optional query params, ANDed on top of the predicate): `channel`, `voice`,
  `event_id`, `sponsor_member_id`, `member_id`, and free-text `q` (a second `.or` of
  `title.ilike` + `body.ilike`; `q` is sanitised of `,()*%` so it can't break the filter).
- **Name resolution** done app-side (no FK embeds needed): collects the event / sponsor /
  member / campaign ids in the result set, then batch-fetches `events.title`,
  `members(company_name|first_name last_name)`, `marketing_campaigns.title`.
- **Facets** are computed over the WHOLE library-worthy set (filter-agnostic, so dropdowns
  stay stable): `{ events:[{id,title}], sponsors:[{id,name}], channels:string[],
  voices:string[] }`.
- Returns `{ items, facets }`; `items` are ordered `updated_at desc`, capped at 300.

### 3. Reuse API — `src/app/api/admin/marketing/library/[id]/reuse/route.ts` (POST)
The "starting point" behaviour. **Never mutates the source — only INSERTs new rows.**
- Reads the source asset (read-only).
- Inserts a NEW `marketing_campaigns` row: `source_type='topic'`,
  `title='Reuse: <original title>'`, `topic_brief` seeded from the original (a short reuse
  instruction + the original copy, so a later Regenerate has real material), `status` set to
  `ready` after the draft is added.
- Inserts a NEW `marketing_assets` draft: same `channel`/`voice`/`variant`, `status='draft'`,
  `body` copied verbatim, tags (`event_id`/`sponsor_member_id`/`member_id`) carried over for
  lineage. For newsletters it deliberately does **not** copy `email_template_id`/`body_html`/
  `body_json` — sharing the designer template could mutate the original; a regenerate here
  mints a fresh template instead.
- Returns `{ campaign_id }` for the client to redirect to the new campaign detail page.

### 4. UI — Content Library
- `src/views/admin/marketing/LibraryPage.tsx` — a filter bar (debounced search `Input` +
  channel/voice/event/sponsor house `Select`s populated from the facets) over a responsive
  card grid. Each card shows the channel (+ LinkedIn variant), voice, status badge, a 4-line
  body snippet, and event/sponsor tag chips, with actions **Copy** (clipboard), **Open**
  (its campaign detail), and **Reuse** (POSTs the reuse API → navigates to the new campaign).
  House UI only (`Card`, `Badge`, `Button`, `Input`, `Select`, `AdminPageHeader`,
  `AdminEmptyState`), theme tokens throughout.
- `src/app/(admin)/dashboard/marketing/library/page.tsx` — thin `'use client'` wrapper.
- `src/app/(admin)/layout.tsx` — added a **Library** child (icon `Library`) to the Marketing
  nav group (now Campaigns / Voices / Segments / Library).

### Filter / facet contract
```
GET /api/admin/marketing/library?channel&voice&event_id&sponsor_member_id&member_id&q
→ {
    items: [{ id, campaign_id, campaign_title, channel, variant, voice, title, body,
              status, email_template_id, event_id, event_title, sponsor_member_id,
              sponsor_name, member_id, member_name, published_at, updated_at }],
    facets: { events:[{id,title}], sponsors:[{id,name}], channels:[], voices:[] }
  }
```

### Decisions / assumptions
- **Library-worthy = finished, not just approved**: newsletters never reach `approved`
  (they're finished in the email designer), so `email_template_id is not null` is OR-ed in.
- **Primary sponsor** for tagging is the first sponsorship member resolved for the event
  (events rarely have multiple; the sponsor filter still works per-piece).
- **Facets are filter-agnostic** so selecting one filter never empties the other dropdowns.
- **Reuse clones, never mutates**: separate new campaign + new draft; the original library
  row is only ever read.
- **member dimension**: `member_id` is a supported API filter but has no dropdown in the UI
  (member-specific pieces aren't produced by the current generator); it's ready for when they
  are. events/sponsors/channels/voices are the surfaced facets.
- Untyped service-role client + admin gate, per the Module 1-4 convention.

### How to test (human)
1. **Seed the library.** Marketing → Campaigns → generate a campaign from an EVENT (tick
   SEO blog, LinkedIn, Sponsor recap, Newsletter). In the approval queue, **Approve &
   publish** the blog + a couple of LinkedIn variants, and **Open in email designer** for the
   newsletter (that alone makes it library-worthy). Reject one to prove rejected pieces are
   excluded.
2. **Browse + filter.** Marketing → **Library**. The approved/published pieces + the
   newsletter appear as cards (the rejected one does not). Type in the search box (matches
   title/body, debounced). Use the **Channel / Voice / Event / Sponsor** dropdowns — an
   event-sourced campaign's pieces filter by that event; the sponsor_recap / LinkedIn-sponsor
   pieces filter by the sponsor.
3. **Copy.** Click **Copy** on a card → its body is on the clipboard ("Copied" flashes).
4. **Open.** Click **Open** → lands on that piece's campaign detail (approval queue).
5. **Reuse.** Click **Reuse** on a piece → a new "Reuse: <title>" campaign is created and you
   land on its detail page with ONE draft card (same channel/voice/variant, body copied). Edit
   or **Regenerate** it freely. Go back to the Library — the ORIGINAL piece is unchanged
   (same body, same status). Nothing was mutated.

### Whole engine — end to end
Nav → **Marketing** now expands to **Campaigns · Voices · Segments · Library**. The full flow
hangs together: create a campaign from an event/topic/audio → generate multi-channel drafts
(Club/Sarah voices, LinkedIn ×4 fan-out) → approval queue → per piece **Approve/publish**
(mock social/blog/PR) **or** finish a **newsletter in the email designer** (segmented sends via
Module 4) → finished pieces surface in the **Library** → **Reuse** any of them as the starting
point for a fresh campaign. Module 6 / Metricool live publishing remains the only blocked
piece (mocked seam ready).

---

## AS BUILT — Template Graphics

A built-in template builder (NOT Canva) where the admin lays out on-brand social
graphics from **building blocks**, the AI fills the text, a real photo is dropped in,
and we render the finished graphic to a **PNG** shown in the approval queue next to the
caption. Additive throughout — text-only generation is byte-for-byte unchanged when no
template is chosen. Never auto-publishes; the human approve gate is intact.

### Database (migration `supabase/migrations/20260725_marketing_templates.sql`)
Applied via the Supabase Management API (curl, token from `.env`) and verified live:

- `public.marketing_templates` — `id, name, shape('square'|'portrait'|'landscape'),
  background jsonb ({type:'color'|'photo', value}), slots jsonb (ordered array of
  `{id,type:'photo'|'heading'|'subtext'|'fixed',zone,align,text_source:'ai'|'fixed',
  fixed_text?,style?:{font,color,size}}`), created_by→profiles (on delete set null),
  created_at, updated_at`. RLS enabled; single `"Admins manage marketing_templates"` FOR ALL
  policy via `public.is_admin()`; `set_updated_at` trigger. **Seeded 3 starter templates**
  (Announcement / Quote / Event recap) with fixed ids + `on conflict (id) do nothing`.
- `public.marketing_assets` — additive `add column if not exists`: `template_id uuid →
  marketing_templates(id) on delete set null`, `graphic_url text` (rendered PNG URL),
  `slot_values jsonb` (per-slot filled text + chosen photo url).
- **Public storage bucket `social-graphics`** — idempotent insert into `storage.buckets`;
  policies: public read (`social-graphics public read`) + admin write/update/delete
  (`social-graphics admin write|update|delete`, gated by `public.is_admin()`).

Live verification:
```
marketing_templates → rls_enabled:true, policy_count:1, "Admins manage marketing_templates"
asset columns       → graphic_url(text,null), slot_values(jsonb,null), template_id(uuid,null)
bucket              → {"id":"social-graphics","name":"social-graphics","public":true}
storage policies    → social-graphics admin delete|update|write, social-graphics public read
seeds               → Announcement(portrait), Event recap(portrait), Quote(square)
```

### Rendering approach
**`next/og`'s `ImageResponse` (satori)** — it resolves in this setup (bundled at
`node_modules/next/dist/compiled/@vercel/og`), so **`@vercel/og` was NOT installed**.
`ImageResponse` ships a default **Noto Sans** font, so graphics render with NO external
font CDN (the CSP forbids them). Smoke-tested: a 1080×1080 render emits a valid PNG
(`89504e47`). Satori supports **flexbox + inline styles only** — the whole render tree is
nested flex columns.

- `src/lib/marketing/graphics/types.ts` — shapes + `SHAPE_DIMS` (square 1080×1080,
  portrait 1080×1350, landscape 1200×627), fixed brand palette (cream/gold/warm-black/dark),
  font stacks, and the `MarketingTemplate` / `TemplateSlot` / `SlotValues` types. Pure data.
- `src/lib/marketing/graphics/render.tsx` — `renderGraphic({template, values, shape})`: the
  pure element tree. Three zone bands (top/middle/bottom) with per-slot align + style
  overrides, a brand-colour OR full-bleed photo background (with a legibility scrim), and the
  ALWAYS-stamped "THE CLUB — by Sarah Restrick" wordmark pinned bottom.
- `src/lib/marketing/graphics/store.ts` — `renderTemplateToStorage()` (render → PNG buffer →
  upload to `social-graphics` at a unique `renders/<ts>-<rand>.png` → public URL) +
  `buildSlotValues()` (AI heading/subtext + photo → slot_values). Shared by the render route
  and the generator so both store identically.
- `src/lib/marketing/graphics/resolve.ts` — defensive coercion of untrusted template/slots/
  background/values + `resolveTemplateFromBody` (inline template OR `template_id` lookup).

**PNGs are stored** in the public `social-graphics` bucket and served by their public
Supabase URL (persisted on `marketing_assets.graphic_url`).

### Routes created
- `POST /api/admin/marketing/graphics/render` — `{template_id|template, values, shape?}` →
  `{graphic_url}`. Renders + uploads via `renderTemplateToStorage`.
- `GET  /api/admin/marketing/graphics/preview?state=<base64url>|template_id=` → `image/png`
  (an `ImageResponse` the builder points an `<img>` at). `state` is base64url-encoded
  `{template, values?, shape?}` captured live; empty AI text slots get placeholder copy so an
  unfilled layout still reads.
- `GET/POST/PATCH/DELETE /api/admin/marketing/templates` — template CRUD, admin-only,
  **Zod-validated** slots/background (max 24 slots).

### Live preview
The builder keeps the full template in React state, base64url-encodes `{template, shape}`
(debounced 250 ms), and sets it as the `src` of an `<img>` pointing at the preview GET route
— so the rendered PNG reflects every edit (shape, background, slot add/reorder/style). The
same route with `?template_id=` renders the list thumbnails. Auth works because the `<img>`
sends the admin's cookies same-origin (`requireAdmin`).

### Builder UI
- `src/views/admin/marketing/TemplatesPage.tsx` (+ route `.../marketing/templates/page.tsx`,
  + **Templates** child in the Marketing nav group, icon `Image`). List of templates with a
  live thumbnail, New / Edit / **Duplicate** / Delete. The builder: pick **shape** (square /
  portrait; landscape is coded-for but not surfaced), set **background** (brand-colour
  swatches + custom hex, OR upload a default photo), **add slots** (heading / subtext / fixed
  / photo), **drag to reorder** (HTML5 drag + ↑/↓ buttons), per-slot **zone / align /
  text-source (AI vs fixed + fixed text) / font / size / brand-colour**, and a **sticky live
  preview** beside the controls. House UI only (`Card/Button/Badge/Input/Select/Textarea/
  AdminPageHeader/AdminEmptyState`), theme tokens for chrome; the graphic itself uses the
  fixed brand palette.

### Generation → graphic → approval queue
- **generate route**: `template_id` + optional `template_photo_url` in the body. After the
  text drafts are written, if a template is chosen and any **social** asset was produced
  (`instagram_feed|carousel|reel`, `linkedin`), it runs one small OpenAI call
  (`marketing-generate-graphic-text`) for a short `heading`+`subtext`, resolves the photo
  (`template_photo_url` → else the event `cover_image_url` → else none), renders **one** PNG
  and stamps `template_id`/`graphic_url`/`slot_values` on every produced social asset. This is
  **best-effort** — a graphic failure never fails the already-written text drafts. The caption
  body is unchanged (the graphic is the accompanying image).
- **create modal** (`MarketingPage.tsx`): a "Social graphic template (optional)" picker
  appears only when a social channel is ticked; default `""` = **no graphic = text only**.
- **approval queue** (`CampaignDetailPage.tsx`): social assets show a **GraphicSection** — the
  rendered image + an inline editor to **swap template**, **edit the AI heading/subtext**,
  **change the photo** (pick from the source event's cover/gallery thumbnails OR upload) and
  **Re-render** (POST render route → PATCH asset `save` with the new `graphic_url`/
  `slot_values`/`template_id`). Edit / regenerate / approve / reject / copy are all intact. On
  **approve**, the MockPublisher target now carries `image: graphic_url` (via
  `PublishableAsset.graphic_url`) so a future Metricool publisher already has the image.

### Files created / modified
Created: the 4 `graphics/*` libs, `graphics/render` + `graphics/preview` + `templates` API
routes, `TemplatesPage.tsx`, `dashboard/marketing/templates/page.tsx`, the migration.
Modified: `generate/route.ts` (template graphic post-step + graphic-text helper + event-cover
capture), `campaigns/[id]/route.ts` (select graphic cols), `assets/[id]/route.ts` (accept +
return graphic cols; pass `graphic_url` to publisher), `publish/types.ts` + `publish/mock.ts`
(carry `graphic_url`), `CampaignDetailPage.tsx` + `MarketingPage.tsx` (UI), `(admin)/layout.tsx`
(Templates nav child).

### Follow-up — generation photo-picker (admin-selected clean photos) + as-is/no-overlay
Event galleries mix **clean candid photos** (good for text overlay) with **already-designed
promo graphics/flyers** (Vogue collages, poster slides that already carry their own text +
"THE CLUB" logo). The old auto logic round-robined across the WHOLE gallery, so it stamped our
headline + brand mark on top of finished graphics → unreadable text-on-text + double logos. We
cannot reliably auto-detect which is which, so the admin picks the clean set at generation.

- **FIX A — photo picker in the create modal** (`MarketingPage.tsx`): when the source is an
  EVENT and graphics will be produced (a social channel is ticked and the mode isn't "No
  graphic"), the modal fetches the event's photos (`cover_image_url` + `gallery_urls`) and shows
  them as a **multi-select thumbnail grid** (house UI: gold-ringed tiles + a check badge). The
  admin **ticks the clean/candid photos**; default selection pre-ticks the **cover only**. The
  ticked URLs are sent to the generate route as `graphic_photos: string[]`. Non-event sources
  (topic/audio) show no grid.
- **generate route** (`generate/route.ts`): the per-asset photo pool is now, in priority order:
  (1) an explicit single-photo override (`template_photo_url`, used for every post), else
  (2) the admin-selected **`graphic_photos`** set — ONLY these are round-robined across the
  per-post graphics (keeps posts distinct, never touches un-ticked flyers), else
  (3) the event **cover photo only** (safe fallback — **no more full-gallery round-robin**).
  Per-asset distinct headings are unchanged. Verified live: `graphic_photos=[cleanA, cleanB]` +
  two social assets → two distinct graphic_urls using only cleanA/cleanB, un-ticked flyer never
  used.
- **FIX B — "Use image as-is (no text overlay)"** (`CampaignDetailPage.tsx` GraphicSection): a
  house-UI toggle in the graphic editor. When ON, the admin picks an image (event gallery
  thumbnails OR upload) and clicks **Use this image** — the asset's `graphic_url` is set to that
  raw image URL **directly**, with **NO ImageResponse render and NO heading/brand overlay**.
  Persisted in `slot_values` (jsonb, no schema change): `slot_values.as_is = true` +
  `as_is_url`. The queue thumbnail + stored `graphic_url` show the raw image; the auto-render
  effect is skipped while as-is is on. When OFF, the template-overlay behaviour is unchanged.

### Decisions / assumptions & satori limitations
- **No `@vercel/og` install** — `next/og` was present and sufficient.
- **Fonts**: satori renders only from bundled font data (Noto Sans today). The builder's
  serif/sans choice is stored, but **both currently resolve to the one embedded face** — visual
  hierarchy is carried by **size / letter-spacing / uppercase / colour**, not font weight
  (only regular is embedded). To get a true serif later, drop a TTF into the repo and register
  it via `ImageResponse`'s `fonts` option. This is the main satori limitation.
- **Satori = flexbox + inline styles only** (no grid / arbitrary CSS) — the whole layout is
  nested flex; background photos are absolutely-positioned `<img>` + a scrim div.
- ~~One graphic shared across a campaign's social assets~~ **SUPERSEDED** — see "Per-post
  distinct graphics" below: each social asset now gets its OWN render (per-asset heading/subtext
  from that post's own title/body + round-robined event photo). Change the photo/text per piece
  and re-render in the queue.
- **Photo auto-pick = event cover**; the gallery/upload picker lives in the queue (where the
  admin reviews), per the spec's "change the photo" there.
- **Untyped service-role client** for all new tables, per the Module 1-5 convention.
- Template deletes use `on delete set null` on `marketing_assets.template_id` so already-
  rendered pieces keep their `graphic_url`.

### How to test (human)
1. Marketing → **Templates**. Three starters show with thumbnails. Click **New template**
   (or **Duplicate** a starter). Pick **Portrait**, background **Dark**, add a **Heading**
   (zone middle, AI) and a **Subtext** (zone bottom, AI); watch the **live preview** update as
   you set align/size/colour and reorder. **Save**.
2. Marketing → **Campaigns → New campaign**. Source = an **event** (so a cover photo exists),
   title it, tick **Instagram feed** + **LinkedIn**. A **Social graphic template** picker
   appears — choose your template. **Create & generate**.
3. In the approval queue the Instagram + LinkedIn cards show a **rendered graphic** (your
   template, AI heading/subtext filled from the event, the event cover dropped in) next to the
   caption.
4. On a card, click **Edit graphic** → change the **photo** (pick a gallery thumbnail or
   upload) and/or edit the **heading/subtext**, optionally **swap the template**, then
   **Re-render graphic** — the image updates in place.
5. **Approve & publish** the card — it flips to `published` (MockPublisher; the logged target
   now includes `image: <graphic_url>`). Reload — the graphic, template link and slot values
   persist. Generating with **no template** selected still produces text-only posts exactly as
   before.

### Follow-up fixes (post-review)
- **Absolute-URL normalisation (BUG 1 — was a hard 502 on every photo graphic).** satori
  (`next/og` `ImageResponse`) throws `"Image source must be an absolute URL: /gallery/…"`
  for RELATIVE image paths, and event photos are stored relative
  (`events.cover_image_url` / `gallery_urls` = `/gallery/bigland.png`). Fix: a new
  `toAbsoluteUrl(url, origin)` in `graphics/resolve.ts` (pass-through for `http(s)://` +
  `data:` URIs; prefixes a leading-`/` path with the request `origin`; else best-effort
  unchanged). `origin` is now threaded through the render path
  `renderTemplateToStorage({…, origin}) → renderGraphic({…, origin})` and applied to the
  background `<img src>` and every photo-slot `<img src>` in `render.tsx`. All three callers
  supply the REQUEST origin (never hardcoded localhost — correct in dev + on Vercel):
  `graphics/render` + `graphics/preview` routes use `req.nextUrl.origin`; the generate
  route's graphic post-step uses `req.nextUrl.origin`. Verified: a render with the relative
  path `/gallery/bigland.png` now returns `ok:true` (previously 502).
- **Editor pre-fill + auto-render (BUG 2 — blank graphic on a text-only post).** In
  `CampaignDetailPage.tsx`'s `GraphicSection`: when a template is selected and its AI
  `heading`/`subtext` slots are empty, they are pre-filled from the existing post
  (`heading ← asset.title` or the first line of `asset.body`; `subtext ← first sentence of
  `asset.body`, trimmed to ~140 chars`), and a preview is **auto-rendered on template
  select** (editor stays open so the admin sees the graphic and can adjust). Render/save is
  factored into a shared `renderWith(...)`; API errors surface in the editor via `setError`
  so a failure never looks like "nothing happened". The already-saved template on an asset
  that already has a graphic is skipped (no needless re-render on open).

### Auto photo graphic by default (post-review — the client's core ask) — SUPERSEDED (see "Final model" below)
The client confirmed (with a screenshot) that social posts were rendering as **text on a
flat colour with no photo** — visually worthless. Root cause: the generate step only
attached a graphic when a template was *explicitly chosen*, and the event's own photo was
never auto-placed. Fixed so **every social post generated from an EVENT auto-produces a
real PHOTO graphic** (the event photo full-bleed, AI heading/subtext over it) with **NO
manual template pick, NO upload, NO typing**.

- **Migration `supabase/migrations/20260725_marketing_default_photo_templates.sql`**
  (idempotent, applied + verified via the Management API — curl, token from `.env`). Adds
  two flag columns to `marketing_templates`: `is_default_photo` and `is_default_color`
  (`boolean not null default false`). Seeds three fixed-id, `on conflict do nothing`
  auto-defaults: **"Event photo — portrait"** (photo bg, `is_default_photo`, the PRIMARY
  auto-pick) + **"Event photo — square"** (photo bg, `is_default_photo`) — full-bleed event
  photo, dark scrim (already in `render.tsx`), AI heading + subtext in the **bottom** zone,
  locked brand mark; and **"Brand colour — portrait"** (colour bg, `is_default_color`) as
  the no-photo fallback. Verified live: the three rows exist with the right flags/shapes.
- **`generate/route.ts` — the graphic step now runs for EVERY produced social asset**
  (`instagram_feed|carousel|reel`, `linkedin`), not just when `template_id` is set. Template
  selection is deterministic: (1) an explicit `body.template_id` (manual override) wins;
  (2) else, if a photo is available it auto-picks the **default PHOTO** template
  (`pickDefaultTemplate('photo')` — prefers portrait); (3) else it falls back to the
  **default COLOUR** text template. The photo is resolved from the event as
  `cover_image_url` → first `gallery_urls` entry (captured into `eventPhotoUrl`; relative
  paths are fine — normalised to absolute at render via `origin`), or an explicit
  `template_photo_url` override. New helpers `rowToTemplate`, `loadTemplate`,
  `pickDefaultTemplate`. Still **best-effort** — a graphic failure never fails the text
  drafts — and the render/store path (`buildSlotValues` → `renderTemplateToStorage({origin})`)
  is unchanged, so the finished PNG lands on `graphic_url`/`template_id`/`slot_values`
  immediately in the approval queue.
- **Fallbacks (the ONLY paths that produce text-on-colour):** an event with NO cover and NO
  gallery photo → the default COLOUR template (current look); **topic-only / audio-only**
  campaigns (no event, so no photo) → default COLOUR template. Everything else gets a photo.
- **Manual controls unchanged** — the template picker in the create modal and the queue's
  swap-photo / swap-template / edit-text / re-render editor are all still optional overrides.
- Verified via a temporary unauthenticated route (`/api/mktestverify2`, since **deleted**)
  that simulated the step for `cover_image_url='/gallery/bigland.png'`: returned `ok:true`
  with the **"Event photo — portrait"** template, `background_photo_url:'/gallery/bigland.png'`,
  and a real `graphic_url` — the fetched PNG is a 1080×1350 full-bleed event photo with the
  AI headline + subtext + brand mark over it (NOT text-on-colour). `tsc --noEmit` clean;
  `npm run build` compiles.

### Per-post distinct graphics + reworked graphic dropdown (post-review — client-reported) — photo round-robin + auto-render SUPERSEDED (see "Final model" below); per-post distinct heading/subtext retained
The client found (a) every social post in a campaign rendered the IDENTICAL graphic —
same photo AND same heading — because the step rendered ONE shared graphic and stamped it
on all social assets; and (b) the create-modal dropdown still defaulted to "No graphic —
caption text only", which lied now that social posts auto-get a photo graphic.

- **FIX 1 — one graphic PER social asset (`generate/route.ts`).** The graphic step now
  loops over EVERY produced social asset and renders/stamps a graphic for each individually
  (`graphic_url`/`slot_values`/`template_id` set per row via `.eq('id', …)`, no longer a
  single shared `.in(...)`). Still best-effort — a single asset's render failure is caught
  and never fails the text drafts nor the other assets.
  - **Distinct heading/subtext, NO extra AI call:** the on-image text is derived from THAT
    asset's own already-generated content — `heading ← asset.title` (fallback: first
    non-empty line of `body`), `subtext ← first sentence-ish slice of `body` (~140 chars)`,
    both run through `cleanGraphicText` (strips Markdown + "Slide n:/Hook:/Caption:"
    scaffolding). So the LinkedIn·Sarah / Sponsor / Founder-spotlight / IG graphics each
    show their own angle's heading. The old `generateGraphicText` OpenAI helper was removed.
  - **Photo variation:** the event's photos are now captured as a POOL —
    `eventPhotos: string[]` = `cover_image_url` + every `gallery_urls` entry (de-duplicated,
    order preserved) — and round-robined across the social assets (`photos[i % len]`) so
    multi-photo events yield visually distinct posts. One photo → reused (acceptable). An
    explicit `template_photo_url` override still pins one photo for all. Relative paths are
    normalised to absolute at render via `origin`, unchanged.
- **FIX 2 — reworked "SOCIAL GRAPHIC" dropdown (`MarketingPage.tsx` + `generate/route.ts`).**
  The picker (relabelled "Social graphic") now offers three genuine modes:
  1. **"Auto — event photo graphic"** (default/selected) → the auto photo-graphic behaviour;
     sends `template_id:null`, `graphic_mode:'auto'`.
  2. **Specific templates** (Announcement / Quote / Event recap / admin-made) as explicit
     overrides → sends that `template_id`.
  3. **"No graphic (caption only)"** → sends the sentinel `graphic_mode:'none'`, and the
     generate route SKIPS the entire graphic block (assets keep `graphic_url` null —
     text-only). UI sentinels `GRAPHIC_AUTO='auto'` / `GRAPHIC_NONE='__none__'`; the route
     distinguishes "auto" (default) from "explicitly none" via `body.graphic_mode`.
- **Verified** via a temporary unauthenticated route (`/api/mktestdistinct`, since
  **deleted**): two assets with different titles + a 2-photo pool returned DIFFERENT headings
  ("Sarah reflects on the Members Evening" vs "Thank you to our Sponsor"), DIFFERENT photos
  (round-robin `/gallery/bigland.png` vs `/gallery/event2.png`), and DIFFERENT `graphic_url`s;
  the fetched PNG is a valid 1080×1350 image. `graphic_mode:'none'` skips rendering → null
  graphic. `tsc --noEmit` clean; `npm run build` compiles.

### Final model — AI text + layout only; manual Drive image per post (SUPERSEDES the auto-event-photo approach)
The client clarified the model, and there is an existing Google Drive integration to reuse.
**All of the auto-event-photo behaviour above ("Auto photo graphic by default", the create-modal
photo tick-grid, the generate-route round-robin over the event photo pool, and the auto-render at
generation) is SUPERSEDED.** The AI now does the **written content + the template layout only** —
it does NOT pick, generate, or render an image. Images come from **Google Drive, chosen manually
by the admin, per post, in the approval-queue editor**.

- **Generation (`generate/route.ts`) — no image, no render.** The graphic step still runs for every
  produced social asset (unless `graphic_mode:'none'`), but it now only: resolves the template
  (explicit `template_id` override → else the default template — photo default preferred, colour
  default as fallback), derives the per-post **heading/subtext** from THAT asset's own title/body
  (unchanged `deriveGraphicHeading`/`deriveGraphicSubtext`, no AI call), writes them into
  **`slot_values`** (via `buildSlotValues(template, text, null)` — photo null), and sets
  **`template_id` + `graphic_url = null`**. **No `renderTemplateToStorage` call at generation.** The
  removed pieces: the `events.cover_image_url`/`gallery_urls` photo capture (`eventCoverPhoto`), the
  `template_photo_url` + `graphic_photos` body fields, the photo round-robin, and the auto-render.
  `graphic_mode:'none'` still short-circuits the whole block → `template_id` null, no graphic ever.
- **Create modal (`MarketingPage.tsx`) — no photo picker.** The event-photo tick-grid and the
  `graphic_photos` state/submit field are gone. The "Social graphic" dropdown is relabelled: **"Add a
  template graphic"** (default — assigns the default template; the admin picks the image + renders per
  post in the queue), specific templates (override → sends that `template_id`), and **"No graphic
  (caption only)"** (`graphic_mode:'none'`). No image is chosen in the modal.
- **Approval-queue editor (`CampaignDetailPage.tsx` `GraphicSection`) — the Drive picker is the image
  source.** A freshly-generated post shows its caption + a template thumbnail placeholder ("No
  graphic") and an **"Add graphic"** button (label flips to "Edit graphic" once a graphic exists).
  The editor has: the template select (the assigned/default template preselected), the AI
  heading/subtext fields (pre-filled from `slot_values`/derived, editable, **no auto-render**), and an
  **image picker = the house `MediaPicker`** (`bucket="gallery"`, folder `marketing`) — which offers
  **Upload / External URL / Google Drive** tabs and internally uses the existing
  **`DriveGalleryPicker`** unchanged. `DriveGalleryPicker` browses the whole Drive (folder breadcrumbs,
  no folder locking), imports the chosen image into the Supabase **`gallery`** bucket via
  `/api/admin/google/drive/import`, and returns a **public absolute URL** the satori/next-og renderer
  can fetch. When the admin picks an image AND a template is set, the editor renders via the existing
  `POST /api/admin/marketing/graphics/render` route and saves `graphic_url` + `slot_values` +
  `template_id` on the asset; render errors surface inline. Editing text → **Re-render** button (label
  "Render graphic" until the first render). The **"Use image as-is (no text overlay)"** toggle is kept
  — the admin picks a Drive image and `graphic_url` = that raw URL, no render. The old event-gallery
  thumbnail grids (both the overlay photo picker and the as-is picker) were replaced by `MediaPicker`.
  `MediaPicker`/`DriveGalleryPicker` themselves were **reused unchanged**.
- **Verified:** the render path was exercised with a public **gallery bucket** URL (the kind
  `DriveGalleryPicker` returns) against the default photo template → a valid 1080×1350 PNG
  (magic `89504e47`) stored at a public `social-graphics` URL, proving the picked-image → render →
  public-URL flow the editor relies on. `npx tsc --noEmit` clean; `npm run build` compiles. Temp
  verification route deleted. No new `ui-shadcn` imports authored (`MediaPicker`/`DriveGalleryPicker`
  are house components).

### Deferred
- **Landscape (1200×627)** shape — fully coded (a parameter everywhere, in `SHAPE_DIMS`), just
  not surfaced in the builder's shape picker; add it to `BUILDER_SHAPES` to enable.
- **True serif/weighted fonts** in the rendered graphic (needs a bundled TTF registered on
  `ImageResponse`).
- **Event-calendar post series**, and **Metricool live posting / video** (the graphic already
  rides along in the mock publish target for when Metricool lands).

---

# ═══════ STATUS & HANDOVER (2026-07-25) ═══════

## Marketing AI Engine — COMPLETE (Modules 1–5 + Template Graphics), reviewed
Built + orchestrator-reviewed (live RLS via Mgmt API, house-UI only, `tsc` 0, `npm run build` compiles,
decision-compliance, regression checks). USER-tested through generation, voices, newsletter→designer,
Drive-picked graphics, and the segmented-send flow. Nav: **Marketing → Campaigns · Voices · Segments · Library**.

**Graphics = FINAL MODEL (client-confirmed):** AI does TEXT + LAYOUT only. NO auto-image, NO AI-generated
images. Admin adds the image MANUALLY, PER POST, in the approval-queue editor via the EXISTING Drive picker
(`src/components/ui/MediaPicker.tsx` + `src/components/admin/DriveGalleryPicker.tsx`, reused UNCHANGED → imports
to the public `gallery` bucket → returns an ABSOLUTE public URL that satori/next-og can fetch). Generation gives
each social post: AI caption + a template + AI heading/subtext in `slot_values` + `graphic_url=null` (no render
until an image is picked). "Add graphic" button → Drive pick → renders overlay. "Use image as-is (no overlay)"
toggle = post a finished graphic raw (graphic_url = raw image, no render). Dropdown at generation:
"Add a template graphic" (default) / specific template / "No graphic (caption only)". Renderer =
`next/og` ImageResponse; **satori REQUIRES absolute image URLs** (relative → 502).

## Newsletter → segmented send (the non-obvious flow — document for support)
Generated newsletter = an `email_templates` row, `category='campaign'`, **`is_draft=true`**. The Campaigns-tab
sender only lists **`is_draft=false`** templates. So to send a generated newsletter to a segment:
1. Newsletter card → **Open in email designer** → **Save & Exit** (this flips `is_draft=false` — "Save Draft"
   does NOT; see `saveTemplate(exit,silent,isDraft)` in `src/lib/hooks/useEmailEditor.ts`).
2. **Newsletter → Campaigns sub-tab → New campaign** → Step 1 pick that template → Step 2 "Or a smart segment"
   → pick segment → Step 3 Send (real Resend send; snapshot `audience_label="Segment: <name>"`).
   Old paths (all-subscribers, saved audience) are byte-for-byte unchanged (additive branch in
   `src/app/api/admin/campaigns/send/route.ts`).
(NOTE: this cross-screen hop is clunky for the client — an OPTIONAL improvement is a direct "Send to a segment"
action on the finalised newsletter. Not built.)

## OUTSTANDING on the Marketing engine (not built yet — pick up here)
1. **Serif font** in graphics — `next/og`/satori only has bundled Noto Sans loaded, so headings render sans, not
   The Club serif. Fix: register an OFL serif TTF (e.g. EB Garamond/Cormorant) via ImageResponse `fonts` in
   `src/lib/marketing/graphics/store.ts` + preview route. Small, high visual payoff.
2. **Batch approval + scheduling** (client req #1): approve a content PLAN/BATCH once → agreed posts auto-publish
   on schedule (no per-post approval). Approval queue currently approves per-asset. Needs a plan/batch concept +
   `scheduled_at` wired to the publish step.
3. **Team-wide Story notifications** (client req #1): interactive IG Stories can't auto-publish (platform rule) →
   prepared + a notification the WHOLE TEAM can action (not just Sarah). Not built.
4. **Markdown in blog previews** — SEO/recap blog bodies contain literal `##` markdown in the queue preview;
   render markdown or strip it (cosmetic).
5. **Direct "send newsletter to segment"** shortcut (see flow note above) — optional UX polish.
6. **Client-response build items** (from Sarah's V2 clarifications, 2026-07-25 — see memory): 7 Gmail inboxes +
   task-mgmt; auto-send whitelist; Drive folder-visibility control (admin marks folders); tiered staff access;
   configurable approval levels by action/risk; staff time-tracking extra fields (rate/est-vs-actual cost/status).
   Cold sponsor outreach = targeted + review-before-send. These span Marketing + Gmail + Drive + accountability.

## ═══ METRICOOL INTEGRATION — HOW IT WORKS + HOW TO TEST SAFELY ═══
Approved LinkedIn / Instagram / Facebook / TikTok assets publish through **Metricool's planner**. Blog channels publish
to the website's own `/blog` (BlogPublisher — see the last section); PR and sponsor-recap stay on the
`MockPublisher` (copy-out). Newsletter stays on Resend.

**Files**
- `src/lib/marketing/publish/metricool-client.ts` — server-only axios client. Base
  `https://app.metricool.com/api`; every call carries `userId` + `blogId` query params and the
  `X-Mc-Auth: <userToken>` header. `listBrands()` (`GET /admin/simpleProfiles`, read-only),
  `normalizeMedia(url)` (`GET /actions/normalize/image/url?url=…`), `createPost(body)`
  (`POST /v2/scheduler/posts`). 20s timeout; retries 429 (GET + POST) and 5xx (GET only — a POST is
  never repeated on 5xx/timeout because Metricool may already have created the post). Never throws,
  never logs or returns the token.
- `src/lib/marketing/publish/metricool.ts` — `MetricoolPublisher.publish(asset)` + `buildMetricoolPostBody`
  (the ONE place holding Metricool's per-network body fields).
- `src/lib/marketing/publish/index.ts` — social channels use Metricool **only when token, userId and blogId
  are all set** (read per request); otherwise the mock, exactly as before.
- `src/app/api/admin/marketing/metricool/status/route.ts` + `src/views/admin/marketing/MetricoolStatusCard.tsx`
  — status card on the Marketing hub ("Not connected" / "Configured · Draft mode" / "Connected · Draft mode" /
  "Connected · LIVE" / "Connection failed") with a read-only **Test connection** button.

**Config (env, read per request)**
`METRICOOL_USER_TOKEN` (Account Settings → API), `METRICOOL_USER_ID`, `METRICOOL_BLOG_ID` (both visible in the
Metricool app URL `…?blogId=00000&userId=0000000`; blogId = the brand), `METRICOOL_TIMEZONE` (default
`Europe/London`), `METRICOOL_MODE` = `draft` (default) | `live`. **Anything other than exactly `live` is draft.**
The API needs Metricool's Advanced/Custom plan.

**What happens on Approve (asset route → `MetricoolPublisher`)**
1. Channel → network: `linkedin` → LinkedIn post; `instagram_feed` → Instagram post; `instagram_carousel` →
   Instagram post with several media (`graphic_url` + optional `publish_target.media_urls`, max 10; a single
   image if that's all there is); `instagram_reel` → Instagram REEL, which **requires** a video URL in
   `publish_target.video_url` (set from the card's **Reel video** editor since 2026-10-22; without one it is
   refused — we never post an image as a reel); `facebook` → Facebook page post; `tiktok` → TikTok **PHOTO** post
   (`graphic_url` + optional `publish_target.media_urls`, 1–35 images, several = photo carousel), or a TikTok
   **VIDEO** post when `publish_target.video_url` is set (the video only).
2. Media: each public URL (the rendered graphic is a public Supabase bucket URL) goes through Metricool's
   normalize call; its returned URL goes in the post's `media`. If normalize fails, nothing is posted.
   Instagram with no graphic → refused ("render a graphic first"). TikTok with no image and no video →
   refused the same way. LinkedIn / Facebook without a graphic post text-only.
3. `publicationDate` = the asset's `scheduled_at` if in the future, else **now** (publish immediately), as wall-clock
   `YYYY-MM-DDTHH:mm:ss` in `METRICOOL_TIMEZONE` (Intl; handles GMT/BST).
4. `draft = METRICOOL_MODE !== 'live'`, `autoPublish = !draft`.
5. Stored on the asset: `publish_target = { platform:'metricool', network, postType, mode, metricoolPostId,
   publicationDate, publishAt, media, raw, externalId }`.
   - **Draft mode** → asset `status='approved'`, `published_at` empty. The card shows a **"Metricool draft"** badge,
     "Sent to Metricool as a draft … — not published yet. Approve it in Metricool's planner to publish." and the
     button reads "Sent to Metricool (draft)".
   - **Live mode** → asset `status='published'` + `published_at`; badge "Sent to Metricool", note "scheduled to
     publish at …".
   - The card locks once sent, and the route answers **409** to a second approve, so Metricool never gets a
     duplicate. To deliberately re-send, click **Send again** on the card (shown only for Metricool-sent assets).
     After a confirmation ("…delete the previous post/draft in Metricool's planner first, or you'll get a
     duplicate"), it calls `PATCH …/assets/[id] {action:'resend'}`, which only RESETS the asset: `status='in_review'`,
     `published_at=null`, and the old `publish_target` is moved into `publish_target.previous[]` (audit trail,
     with `reset_at`; `video_url`/`media_urls` hints are kept). It never publishes — click **Approve & publish**
     again to send.

**Assumptions to confirm with Metricool's planner inspector** (Metricool documents only a Facebook example and
says the body varies per network — create the same post type in Planning → Calendar with the browser's
Network tab open, compare, then fix `buildMetricoolPostBody` / the parsers):
- `media` = array of normalized URL **strings** (vs objects).
- `instagramData.type` = `'POST'` for feed AND carousel, `'REEL'` for reels; `instagramData.autoPublish` mirrors autoPublish.
- `linkedinData: { type: 'POST' }` — LinkedIn's block is undocumented (may be optional or named differently).
- `tiktokData: { type: 'PHOTO' }` for a TikTok photo post (single image or carousel — the `media` array decides)
  and `{ type: 'VIDEO' }` for a video post — **entirely undocumented**: the block may be optional, named
  differently, or need extra keys (privacy level, disable comments/duet/stitch, auto-add music, a separate
  photo/carousel flag, a video cover/thumbnail). Also confirm whether `autoPublish` is honoured for TikTok
  PHOTO posts or whether they always land in the TikTok app's inbox for a final tap.
- `creationDate` = now in the same timezone; `firstCommentText: ''`, `shortener: false`,
  `saveExternalMediaFiles: false`, `hasNotReadNotes: false` (copied from Metricool's example).
- `draft: true` + `autoPublish: false` is how a planner DRAFT is saved.
- Normalize response: a bare URL string, or `url` / `data` / `data.url` / `mediaUrl` / `normalizedUrl`.
  The same `/actions/normalize/image/url` endpoint is used for reel videos (Metricool's doc says it copies
  "image/video").
- Create-post response id at `id` / `data.id` / `postId` / `data.postId` / `uuid` (the raw reply is kept in
  `publish_target.raw` so you can see the real shape after the first test).
- List-brands response: array (root or `data`) of profiles with `id`/`blogId` and `label`/`name`/`title`/`brandName`.
- Metricool also publishes a `swagger.json`/`swagger.yaml` (linked from their API doc) with the full request
  schema — worth checking alongside the inspector.

**How to test safely** (no Metricool sandbox exists)
1. Set `METRICOOL_USER_TOKEN`, `METRICOOL_USER_ID`, `METRICOOL_BLOG_ID` in env. **Leave `METRICOOL_MODE=draft`.**
   Prefer a separate **test brand** (its own blogId) connected to private test LinkedIn/Instagram accounts.
2. Marketing hub → Metricool card → **Test connection** (read-only list of brands). Expect "Connected · Draft
   mode" and your brand listed; fix credentials if it says "Connection failed" or the blogId isn't in the list.
3. Approve ONE LinkedIn asset (with a rendered graphic). Expect the "Metricool draft" badge.
4. Open Metricool → Planning: the post must appear as a **DRAFT** (not scheduled), with the right text,
   image and time. Check `publish_target.raw` on the asset for the real response shape.
   To try again after fixing something: delete the draft in Metricool's planner, then **Send again** on the
   card → confirm → **Approve & publish**.
5. Create the same kind of post by hand in Metricool's planner with the browser inspector open; compare its
   body with ours (assumption list above) — repeat for an Instagram feed post, a carousel and a TikTok photo
   post (one image, then several). Fix
   `buildMetricoolPostBody` if anything differs.
6. For real publishing tests, use the **test brand** with private test accounts only.
7. Only then set `METRICOOL_MODE=live` (redeploy/restart so env is re-read) — the card then shows
   "Connected · LIVE" and approvals publish for real.

**Still out of scope:** interactive IG Stories (platform rule — prepare + tap-publish),
batch approval / a scheduler that publishes at `scheduled_at` (today the publish happens at Approve, with
`scheduled_at` passed to Metricool as the publication time). (Facebook and TikTok are now channels — see the
last sections.)

## AS BUILT — Facebook channel + website blog publishing (2026-10-16)

Client requirement: publish to "LinkedIn, Instagram, Facebook", and for blogs "Generate first draft, Optimise
for SEO, Add internal links, Add call-to-actions, Publish to website, Then notify marketing team for approval".
The human gate is unchanged: **nothing publishes until an admin clicks Approve** in the approval queue.

### Migration — `supabase/migrations/20261016_marketing_facebook_blog_posts.sql` (written, NOT yet applied)
- `marketing_assets.channel` CHECK re-created with `'facebook'` **and `'tiktok'`** added (a DO block also drops
  any differently named CHECK on the channel column first). `'tiktok'` was added to this same file in place
  (it had never been applied) — there is no separate TikTok migration.
- `public.blog_posts`: `id, slug (unique), title, excerpt (meta description), body_html (sanitized),
  body_markdown, hero_image_url, event_id→events, marketing_asset_id (unique)→marketing_assets,
  source_channel (seo_blog|recap_blog), status (published|unpublished), published_at, unpublished_at,
  created_by, created_at, updated_at`. RLS: **"Public read published blog_posts"** (anon + authenticated,
  `status='published'` only) + **"Admins manage blog_posts"** (`is_admin()`). `set_updated_at` trigger.

### A. Facebook
- `channels.ts`: `facebook` in `MARKETING_CHANNELS` + `TEXT_CHANNELS`, label "Facebook", own group "Facebook"
  (after Instagram) in the create modal. `publish/types.ts` `MarketingChannel` gains `'facebook'`.
- Generation (`generate/route.ts`): Facebook brief in `CHANNEL_BRIEFS` (warm conversational page post, 2-4
  short paragraphs, inviting close, 0-3 hashtags, works with or without an image). It's part of the
  single-voice text batch, so it uses the campaign's **default voice** (Club or Sarah). It's in
  `SOCIAL_GRAPHIC_CHANNELS`, so it gets the same optional template graphic as LinkedIn/Instagram.
- Publishing: `METRICOOL_CHANNELS.facebook = { network:'facebook', kind:'post' }` → `buildMetricoolPostBody`
  adds `facebookData: { type: 'POST' }` (Metricool's own doc example). Media optional (text-only allowed —
  only Instagram refuses without an image). Not configured → MockPublisher. Draft/live rules unchanged.
- UI: Facebook icon in the approval queue + library; "Social graphic" + "Default voice" hints and the
  Metricool status card mention Facebook.

### B. Blogs → website
- **Generation**: the `seo_blog` / `recap_blog` briefs now ask for an SEO title (<~65 chars), an opening
  paragraph usable as the meta description, 2-3 (recap: 1-3) **internal links** using ONLY a fixed list of
  real site paths (`SITE_LINKS` in the generate route: /memberships, /membership-application, /events,
  /private-event-services, /concierge, /about, /contact-us, /blog) plus the event's public page
  (`/events/<slug>`, offered only when the event is published/live/completed), and a closing
  **call-to-action** paragraph (/membership-application or /events).
- **Review**: blog cards in the approval queue get a **Hero image** picker (MediaPicker → saved as the asset's
  `graphic_url`; optional) and the approve button reads **"Approve & publish to website"**.
- **Publish** (`src/lib/marketing/publish/blog.ts`, `BlogPublisher`, chosen by `getPublisher` for blog
  channels): Markdown → HTML (`src/lib/marketing/blog-content.ts`, subset converter, raw HTML escaped) →
  DOMPurify sanitize; meta description = first paragraph (~155 chars); hero = `graphic_url` else the linked
  event's `cover_image_url`; upsert `blog_posts` on `marketing_asset_id` (unique slug from the title,
  `-2`, `-3`… on collision; a re-publish keeps the same slug and original `published_at`);
  `revalidatePath('/blog')` + `/blog/<slug>`. Asset → `status='published'`, `published_at`,
  `publish_target = { platform:'website', blog_post_id, slug, url, hero_image_url, published_at, externalId }`.
  A second approve of a live post → 409.
- **Notify marketing team (in-app only, no email)** — `src/lib/marketing/notify.ts`: an unassigned task
  "Blog post live on the website: <title>" (Dashboard → Tasks, linked to the event) + an
  `admin_notifications` row via `createAdminNotification` (kind `marketing_blog_published`). The older
  `notifyAdmins()` emails, so it is NOT used.
- **Unpublish**: "Unpublish" button on a live blog card (confirm dialog) → `PATCH /api/admin/marketing/assets/[id]
  { action:'unpublish' }` → `blog_posts.status='unpublished'` (row kept), revalidate, asset back to
  `in_review`, `published_at=null`, `publish_target.status='unpublished'` + `unpublished_at`. Edit and approve
  again to re-publish at the same URL. "View on website" opens the live post.
- **Public site**: `/blog` ("The Journal" listing, newest first) and `/blog/[slug]` (hero, date, title,
  excerpt, article, linked public event, membership CTA; `generateMetadata` with description + Open Graph
  image). Both `revalidate = 60`, read through `src/lib/cms/blog.ts` (cookie-free anon client, fail-soft —
  empty list / 404 if the table is missing). The article's linked event is read exactly like the public event
  pages read events — cookie-aware anon server client + `.in('status', ['published','live','completed'])`,
  `title, slug` only — so recaps of COMPLETED events link to their event page, and the link shows only when
  `/events/<slug>` would render. "Journal" added to the footer (Discover) and the full-screen
  menu. `press_release` / `sponsor_recap` unchanged (mock / copy-out).

### How to test (human)
1. Apply the migration. 2. Create a campaign with SEO blog + Facebook. 3. Facebook card: approve with
Metricool NOT configured → mock "published"; with Metricool configured (draft mode) → "Metricool draft".
4. Blog card: optionally add a hero image → **Approve & publish to website** → badge "Live on website",
link to `/blog/<slug>`; check `/blog` lists it, Tasks has the review task. 5. **Unpublish** → the post
404s and disappears from `/blog`; approve again → back at the same URL.

## AS BUILT — TikTok channel (2026-10-19)

Mirrors the Facebook channel. Human gate unchanged: nothing publishes until an admin clicks Approve.

### Migration
None new — `'tiktok'` was added to the channel CHECK in the still-unapplied
`20261016_marketing_facebook_blog_posts.sql` (see above). Applying that file covers Facebook + TikTok.

### What was built
- `channels.ts`: `tiktok` in `MARKETING_CHANNELS` + `TEXT_CHANNELS`, label "TikTok", hint "Short caption +
  vertical photo", own group "TikTok" (after Facebook) in the create modal. New exports
  `TIKTOK_GRAPHIC_SHAPE = 'story'` and `TIKTOK_PUBLISH_NOTE`. `publish/types.ts` `MarketingChannel` gains
  `'tiktok'`.
- Generation (`generate/route.ts`): TikTok brief in `CHANNEL_BRIEFS`. `title` = the **on-screen hook line**
  (≤ ~8 words, no hashtags) — it doubles as the graphic heading, because the on-graphic heading is derived
  from the asset's title. `body` = the caption ONLY (published verbatim): 1-3 punchy lines, lighter TikTok
  tone but in the campaign's default voice (Club or Sarah), final line of 3-6 hashtags, whole caption
  < 300 chars. A safety net trims a caption over TikTok's 2,200-char limit. In `SOCIAL_GRAPHIC_CHANNELS`,
  so it gets the template graphic like the other social channels.
- **Vertical 9:16 graphics**: `graphics/types.ts` gains a render-time shape `story` (1080×1920) in
  `GRAPHIC_SHAPES` / `SHAPE_DIMS` / `SHAPE_LABELS` — NOT in `BUILDER_SHAPES` and never stored on a template
  (the `marketing_templates.shape` CHECK is untouched). The render route already accepted a `shape` override,
  so the approval queue's graphic editor passes `shape: 'story'` for TikTok assets: **any** template renders
  vertically (the zone layout is flex-based, so top/middle/bottom just spread over the taller canvas; the
  inline photo slot stays 360px tall). Other channels keep the template's own shape. "Use image as-is" and
  the MediaPicker still work for a team-made 9:16 image (the card says it should be 9:16).
- Publishing: `METRICOOL_CHANNELS.tiktok = { network:'tiktok', kind:'carousel' }`; at publish time it switches
  to kind `video` when `publish_target.video_url` is set. Photo post = `graphic_url` + `media_urls` (max 35);
  video post = the video only. No image and no video → `ok:false` "TikTok posts need at least one image (or a
  video) … Nothing was sent to Metricool." `buildMetricoolPostBody` adds `tiktokData: { type: 'PHOTO' | 'VIDEO' }`
  (**assumption** — see the inspector list). Not configured → MockPublisher. Draft/live rules unchanged.
- UI: `Music2` icon (lucide has no TikTok mark) in the approval queue + library; TikTok cards show
  "TikTok photo posts may need a final one-tap publish in the TikTok app (music/effects can't be added
  automatically)." plus a caption-length count against the 300 suggestion; the graphic panel explains the
  9:16 render. Create-modal hints and the Metricool status card mention TikTok.

### Known limitation
Metricool documents TikTok auto-publish for **videos**; for **photo carousels** it is unconfirmed, and music,
stickers and effects can't be added by API. Expect TikTok photo posts to possibly need a final one-tap publish
in the TikTok app.

### How to test (human)
1. Apply the migration. 2. Create a campaign with TikTok (+ "Add a template graphic"). 3. TikTok card: caption
< 300 chars with 3-6 hashtags, the hook as title. Approve with NO graphic → refused ("TikTok posts need at least
one image…"). 4. Add an image → the graphic renders 1080×1920. 5. Approve with Metricool NOT configured →
mock "published"; configured (draft mode) → "Metricool draft"; check the planner draft and compare its body
with a hand-made TikTok photo post (inspector) before ever switching to live.

## AS BUILT — Instagram carousels (multi-slide) + EXIF photo orientation (2026-10-22)

### 1. Phone photos rendered sideways — root cause + fix
Phone JPEGs (e.g. 3000×4000 from a phone camera) store their pixels sideways plus an EXIF `Orientation`
tag (usually 6). Browsers honour the tag, so the photo looks upright in the MediaPicker, but satori/resvg
(next/og `ImageResponse`) **ignore EXIF**, so the rendered graphic came out rotated 90°.
- **New `src/lib/marketing/graphics/image-prep.ts`** (Node only — uses `sharp`, now an explicit dependency
  `sharp@0.34.5` in package.json). `prepareRenderInputs({ template, values, shape, origin })` fetches every
  photo the template will draw (background photo, template default background photo, photo slots), runs it
  through sharp `.rotate()` (auto-orient from EXIF) + `resize({ fit: 'outside', withoutEnlargement })` to just
  cover the canvas + `.jpeg({ quality: 85 })`, and hands satori a `data:` URI. Any failure → the original URL
  is kept (old behaviour), so a bad photo never breaks a render.
- Used by `renderTemplateToStorage` (store.ts — the render route + generation) and the preview route. Both
  routes are `runtime = 'nodejs'`.
- **SSRF guard** (`fetchImageSafely`): http(s) only, no credentials in URLs, host must resolve only to public
  addresses (loopback / private / link-local incl. 169.254.169.254 / CGNAT / ULA / multicast / reserved are
  refused), every redirect hop re-checked (max 3), 10 s timeout, 25 MB cap (header + streamed count),
  `image/*` content types only. Site-relative (`/gallery/x.png`) and same-origin URLs are read from `public/`
  on disk with a path-traversal check (never HTTP to ourselves).
- **"Use image as-is"**: new `POST /api/admin/marketing/graphics/orient { url, shape? }` →
  `{ url, changed, orientation }` (`orientImageToStorage` in store.ts). Without `shape`: if the EXIF
  orientation isn't 1, an upright full-resolution copy (JPEG q90) is written to the **`gallery` bucket,
  `marketing/` folder** (where the MediaPicker uploads) and that URL is posted; an upright image comes back
  unchanged. The single-graphic editor's "Use this image" calls it first and falls back to the original URL on
  failure. With `shape` (carousel slides): always a fresh upright copy centre-cropped to the shape's exact dims.

### 2. Instagram carousels — multiple slides
Before: the AI wrote `Slide 1: … Slide 5:` + `Caption:` all into `body`, which would have been POSTED as the
caption, and the card had a single-image editor.
- **Generation** (`generate/route.ts`): the strict JSON schema item now has a required `slides` array
  (`{ heading, subtext }`); the system prompt says it is `[]` for every channel except instagram_carousel. The
  carousel brief asks for: `body` = caption only (no `Slide n:` lines, no `Caption:` label) and 3–7 slides
  (heading ≤ ~8 words, subtext ≤ ~16 words; slide 1 = hook/title, last = call to action). Safety net: if the
  model still writes scaffolding, `parseCarouselBody` strips it from the caption and uses those lines as the
  slides when `slides` is empty. The template-assign step stores the slides on
  `slot_values.slides` (+ `carousel_shape`) and slide 1's text fills the template's heading/subtext; a
  regenerate also clears stale `publish_target.media_urls`. Caption-only mode / no template still stores the
  slide text.
- **Data shape** (`graphics/types.ts`, no migration — `slot_values` is jsonb):
  ```
  slot_values = {
    slides: [{ heading, subtext, photo_url: string|null, as_is: boolean, rendered_url?: string|null }, …],
    carousel_shape: 'portrait' | 'square',
  }
  asset.graphic_url               = slides[0] render   (slide 1)
  asset.publish_target.media_urls = renders of slides 2..n, in slide order
  ```
  Helpers (pure, client-safe) in `graphics/carousel.ts`: `parseCarouselBody`, `coerceSlides`,
  `slidesFromText`, `carouselMedia` (= `[graphic_url, ...media_urls]`, the publisher's order).
  `CAROUSEL_MIN_SLIDES = 2`, `CAROUSEL_MAX_SLIDES = 10`, `carouselShapeFor(templateShape)` (square stays
  square; portrait / landscape / none → portrait 4:5).
- **Editor** (`CampaignDetailPage.tsx` → `CarouselSection`, used only for `instagram_carousel`; every other
  channel keeps `GraphicSection`): one template for the whole carousel, then slide cards (thumbnail,
  heading/subtext, MediaPicker on `gallery`/`marketing`, per-slide "use image as-is", move up/down, remove),
  "Add slide" (max 10) and "Render all N slides" (concurrency 2, per-slide spinner/error, then one save).
  Picking a slide image auto-renders that slide. Editing text marks the slide "Edited — re-render". Re-order /
  remove save immediately so the post order always matches the screen. Unrendered slides are left out of
  the post (warned). The collapsed card shows the rendered slides as a horizontal thumbnail strip. Legacy
  carousel assets without `slides`: slides are parsed from `Slide n:` body lines (else one slide from the
  heading/subtext), existing renders are kept, and the first save strips the scaffolding from the caption.
- **Save** — `PATCH /api/admin/marketing/assets/[id]` accepts `media_urls` (http(s), max 9) and merges it into
  `publish_target.media_urls` (refused with 409 once the asset is already with Metricool — use "Send again").
- **Publish gate** — "Approve & publish" is disabled with a reason while fewer than 2 slides are rendered;
  the server's approve branch refuses the same (400) and strips any legacy `Slide n:` / `Caption:` text from
  the caption before publishing. `MetricoolPublisher` sends `graphic_url` + `media_urls` as ONE Instagram post
  with `media` in slide order (`instagramData.type 'POST'`); it refuses an Instagram carousel with 1 or > 10
  items. Every slide has its own URL (renders are unique paths; as-is slides are always a fresh cropped copy),
  so the publisher's duplicate-URL filter never collapses two slides. All slides share one template shape and
  as-is slides are cropped to it → Instagram's same-aspect-ratio rule holds.

### How to test (human)
1. Pick a phone photo (portrait, EXIF-rotated) for any template → the preview and the rendered PNG are upright.
2. Generate a campaign with Instagram carousel → the caption has no `Slide n:` lines; "Build slides" shows
   3–7 slides. Pick images (each auto-renders), or "Render all". The card shows the strip; Approve enables at
   2+ slides. In Metricool draft mode the planner draft should hold all slides in order.
3. Old carousel draft (body with `Slide 1:` lines) → "Build slides" lists those slides; after rendering, the
   caption no longer contains them.


## AS BUILT — Carousel videos (mixed photo + video carousels) (2026-10-22)

Instagram carousels can now mix image slides and **video slides**. A video slide is posted **as-is** — no
template, no heading/subtext, no brand overlay, no crop.

### Rules we enforce (researched 2026-10-22)
| Rule | Value | Source |
|---|---|---|
| Items per carousel | 2–10 (Meta's API now says up to 20, but Metricool's planner caps at 10 — we keep 10) | [Meta content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing), [Metricool: schedule on Instagram](https://help.metricool.com/en/article/schedule-and-post-on-instagram-1xovmji/) |
| Formats | MP4 / MOV (`.mp4 .mov .m4v`, `video/mp4`, `video/quicktime`, `video/x-m4v`); MP4 recommended (Metricool converts MOV; HEVC and iPhone HDR can't be auto-published) | [Metricool publishing requirements](https://help.metricool.com/en/article/publishing-requirements-for-images-and-videos-from-metricool-pyf6om/) |
| Duration | 3 s min, **60 s max** (Metricool can't auto-publish a carousel with a video over 60 s) | Metricool "schedule on Instagram"; 3 s min per Instagram API video spec ([Adobe scheduler specs](https://helpx.adobe.com/express/using/social-media-character-limits-in-scheduler.html)) |
| Size | **100 MB** per video — Instagram's API carousel-video cap (Metricool's generic video page says 500 MB; we take the lower; our upload cap stays 500 MB) | Adobe scheduler specs, [Plann](https://help.plannthat.com/en/articles/10029624-auto-post-restrictions-for-instagram) |
| Aspect ratio | Video between 4:5 and 16:9 (9:16 vertical → post as a Reel) | Metricool "schedule on Instagram" |
| Cropping | Instagram crops every carousel item to the **first** item's ratio → we **warn** (not block) on mixed shapes | Meta content publishing |
Constants: `CAROUSEL_VIDEO_*` in `graphics/types.ts`.

### Data shape (no migration — `slot_values` is jsonb)
```
slides[i] = { heading, subtext, photo_url, as_is, rendered_url?,
              media_type?: 'image' | 'video',          // missing = image (old slides)
              duration_s?, width?, height?, size_bytes? } // video metadata, read in the browser
```
Video slide: `photo_url` = the video URL; `rendered_url` = the same URL **once it passes the checks** (no render
step). Publishing is unchanged: ready slides in order → slide 1 → `graphic_url` (may be a video), 2..n →
`publish_target.media_urls`.

### Code
- `graphics/carousel.ts` (pure): `isVideoSlide`, `urlExtension`, `hasCarouselVideoExtension`,
  `isCarouselVideoMime`, `carouselVideoProblems(facts)` (type / size / duration / ratio → messages; unknown facts
  aren't held against the video), `slideAspectRatio`, `ratioLabel`, `carouselIssues(slides, shape)` →
  `{ slideErrors[], warnings[] }` (warning = mixed aspect ratios). `coerceSlides` keeps the new fields.
- `graphics/carousel-server.ts`: `storedSlideProblems(slides)` (save) and `carouselMediaProblems(media, slides)`
  (approve: a HEAD per video for Content-Type + Content-Length, 6 s timeout, plus the stored duration/dims).
- `lib/media/video-meta.ts` (browser): `readVideoMeta(url)` — detached `<video preload=metadata>` for duration +
  dimensions, HEAD for size + type (CORS-dependent; null when blocked).
- `MediaPicker` gained `accept` and `uploadHint` props (video slides: `video/mp4,video/quicktime,…`, max 100 MB).
- Editor (`CarouselSection`): per-slide **Image | Video** switch (switching clears the slide's media and saves).
  Video slides: MediaPicker locked to video (upload incl. .mp4/.mov via TUS, Drive library filtered to videos,
  external URL — debounced 600 ms), heading/subtext/as-is/template hidden, note "Videos are posted as-is — no text
  or brand overlay", `<video muted playsInline controls preload=metadata>` with a `#t=0.1` poster frame,
  metadata line (0:12 · 1080×1350 (4:5) · 8.4 MB), badges *Checking video… / Video ready / Needs a fix / No video
  yet*, per-slide error text, "Re-check video". The collapsed strip shows video thumbnails with a play badge.
  "Render all" renders image slides only (label "Render all N image slides"; disabled when every slide is a
  video). The aspect-ratio warning shows in the editor and on the collapsed card.
- Asset route: **save** refuses (400) a ready video slide that breaks the rules; **approve** refuses fewer than 2
  or more than 10 slides and any video that isn't MP4/MOV (extension or Content-Type), is > 100 MB, or has a stored
  duration/ratio out of range — nothing is sent to Metricool.
- Publisher: mixed carousels need nothing special. Metricool's swagger has **one** media-import endpoint,
  `GET /actions/normalize/image/url` ("validates that the URL is publicly accessible and transforms it into a URL
  from a metricool repository"); despite the name it takes videos (the reel path already used it). Videos get a
  40 s normalize timeout (images 20 s) and errors name the slide. `media` stays a plain array of URL strings
  (`ScheduledPost.media: string[]`) — Metricool detects photo vs video from the file. `instagramData.type` stays
  `'POST'`.

### Verified (2026-10-22, draft only)
A synthetic 4 s 1080×1350 H.264 MP4 (393 KB, uploaded to `gallery/marketing/`) + an existing
`social-graphics/renders/*.png` were sent through the real `MetricoolPublisher` with `METRICOOL_MODE=draft`.
Metricool accepted it; normalize returned the Supabase public URLs unchanged; `GET /v2/scheduler/posts/{id}` showed
`draft: true`, `autoPublish: false`, `instagramData.type: 'POST'` and both media in order. The draft was then
deleted (`DELETE` → 200, GET → 404) and the test video removed from storage. Not yet verified: an actual
**live** publish of a video carousel to Instagram (Metricool processes the video at publish time).

### How to test (human)
1. Carousel card → Edit slides → on slide 2 switch to **Video** → upload a short MP4 (or pick one from Drive) →
   "Checking video…" then "Video ready" with its length/size/shape. Approve enables with 2+ ready slides.
2. Pick a 70 s video / a 9:16 phone video / a .webm → "Needs a fix" with the reason; it is left out of the post.
3. Slide 1 portrait image + a 16:9 video → the "Instagram crops every item…" warning appears.

## AS BUILT — Post scheduling + safe unschedule / reschedule (2026-10-22)
Admins can now set **when** a social post goes out. `marketing_assets.scheduled_at` (timestamptz) already
existed and `MetricoolPublisher` already used a future value as `publicationDate`; nothing could set it. No migration.

### Rules (`src/lib/marketing/publish/schedule.ts` — shared server/client, pure)
- Only the Metricool social channels: `linkedin, instagram_feed, instagram_carousel, instagram_reel, facebook, tiktok`.
  Blogs / newsletter / PR / sponsor recap are unchanged.
- Set via `PATCH /api/admin/marketing/assets/[id]` `{ action:'save', scheduled_at: ISO | null }`; refused 409 once the
  post has been sent to Metricool (or has a `publish_target.metricoolPostId`). Must be ≥ 5 min and ≤ 6 months ahead.
  Metricool's help centre says manual calendar posts have **no** advance limit (recurring posts: 180 days; "schedule
  with AI": 3 months), so 6 months is our own ceiling.
- Times are picked as **UK wall clock** (`METRICOOL_TIMEZONE`, default Europe/London) regardless of the admin's
  browser zone (`wallClockToInstant` / `instantToWallClock` via Intl; BST/GMT handled).
- On approve, `pickPublicationInstant` (unchanged) uses a future `scheduled_at`, else now. A Metricool LIVE approve
  sets `published_at` to the publication instant (may be in the future); status model unchanged (live → `published`,
  draft → `approved`).

### Metricool client additions (`metricool-client.ts`)
- `getPost(id)` → `GET /v2/scheduler/posts/{id}`; 404 / empty → `{ found:false }`; else `{ draft, providerStatuses[],
  publicationDate }` (swagger `ProviderStatus.status`: PUBLISHED | PUBLISHING | PENDING | AWAITING_CONFIRMATION | ERROR | DRAFT).
- `deletePost(id)` → `DELETE /v2/scheduler/posts/{id}` (same auth params/header); 404 → `alreadyGone`; retries 429,
  and 5xx **at most once**. Token never logged.
- `withdrawMetricoolPost(postId, publishAt)` (`metricool.ts`): GET → `metricoolPostState` → DELETE if pending (if the
  DELETE errors, re-GET; a 404 then counts as deleted) → `deleted | gone | published`, or `{ ok:false }`.

### Asset actions
- **`unschedule`** (new): Metricool-sent posts only. Pending → deleted from Metricool, asset back to `in_review`,
  `scheduled_at` kept, old target appended to `publish_target.previous[]` with `unscheduled_at` + `metricool_withdrawal`.
  Already published → 409. Check/delete failure → 502 and nothing changes. No stored post id → 409 (delete in planner).
- **`resend`** ("Send again"): now withdraws the previous post first — pending → deleted; published → left on the
  account (response `notice` says so); failure → 502 refusal (never a second scheduled post while the first exists).
  Legacy rows without a stored post id still reset, with a notice to check the planner.

### UI (`CampaignDetailPage.tsx`)
- Card loads `/api/admin/marketing/metricool/status` (env only) for mode + timezone. Social cards (Metricool connected)
  get **Schedule** / **Change time** → `SchedulePanel` modal: quick picks, house `DateTimeField` with hint
  "UK time (Europe/London)", Save, Clear schedule. Chip "Scheduled · Tue 28 Oct, 18:00 UK".
- Approve label: live → "Approve & schedule" / "Approve & publish now"; draft mode → "Approve & send draft" plus a line
  saying it lands as a Metricool draft dated for that time.
- Passed time → orange chip + warning; approving asks for confirmation, then publishes now.
- Sent: "Scheduled on Metricool for … (UK)" (future) / "Sent / published … via Metricool"; badge "Scheduled on Metricool".
  Sent-but-pending (future, or any draft) → **Unschedule** (confirm) and **Reschedule** (unschedule, then panel).

### Verified (2026-10-22, draft only)
With `METRICOOL_MODE=draft` for the test process only: one LinkedIn draft created through `MetricoolPublisher` with
`scheduled_at` = now + 2 days (existing `social-graphics/renders/*.png`). Read back: `draft: true`, provider status
`PENDING`, `publicationDate` = the exact Europe/London wall clock. `deletePost` → ok; follow-up GET → not found; a
second DELETE → 404 (`alreadyGone`). No DB writes. Not verified: unschedule/resend against a LIVE scheduled post.

## AS BUILT — Instagram Reels: video editor, cover, caption cleanup (2026-10-22)

Before: the reel card showed the IMAGE template-graphic editor and there was no way to attach a video, so a reel
could never be approved; the AI body also carried `Hook:` / `Caption:` labels that would have been posted.

### Limits (researched 2026-10-22)
| Rule | Value | Enforced as | Source |
|---|---|---|---|
| Container | MP4 / MOV (`.mp4 .mov .m4v`, or HEAD `video/mp4` / `video/quicktime` / `video/x-m4v`) | **BLOCK** | [Meta IG User Media](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media), [Metricool requirements](https://help.metricool.com/en/article/publishing-requirements-for-images-and-videos-from-metricool-pyf6om/) |
| Public link | `http(s)://…` | **BLOCK** | — |
| Duration | 3 s – 15 min | warning | Meta; [Metricool: schedule on Instagram](https://help.metricool.com/en/article/schedule-and-post-on-instagram-1xovmji/) |
| Size | 300 MB (Meta); Metricool says 500 MB — we warn above 300 MB; uploads cap at 500 MB | warning | Meta, Metricool |
| Shape | 9:16 recommended (1080×1920); anything else is cropped / letter-boxed | warning (> 3 % off 9:16) | Meta, Metricool |
| Width | ≤ 1920 px | warning | Meta ("maximum columns 1920") |
| Codec | H.264 + AAC, 23–60 fps, ≤ 25 Mbps. Meta lists HEVC as accepted, but Metricool: **HEVC and iPhone HDR can't be auto-published** | advice text; warning when the browser can't read the file | Metricool requirements |
| Cover | JPEG, ≤ 8 MB, 9:16 (Meta crops the centre 9:16); Metricool recommends 1080×1800 for uploads | we always produce a 1080×1920 JPEG | Meta, Metricool |

Metricool cover support: its swagger (`https://app.metricool.com/api/swagger.json`, `ScheduledPost`) has top-level
**`videoThumbnailUrl`** (and `videoCoverMilliseconds`); `ScheduledPostInstagramData` has `showReelOnFeed`. We send
`videoThumbnailUrl` = the normalized cover URL and `instagramData.showReelOnFeed: true`. (Frame-offset covers via
`videoCoverMilliseconds` are not used.)

### Code
- `src/lib/marketing/reel.ts` (pure, shared): constants; `reelVideoProblems` (BLOCKING only: no link / not http(s) /
  not MP4-MOV); `reelVideoWarnings` (length, size, 9:16, width, unreadable-in-browser → HEVC/HDR advice);
  `reelVideoUrl` / `reelCoverUrl` / `coerceReelVideoMeta` / `reelMetaLine` ("0:42 · 1080×1920 (9:16) · 38 MB");
  `stripPostLabels(body, {dropHook})` removes `Hook:` (+ on-screen text / text overlay), `Caption:` and `Hashtags:`
  labels — with `dropHook` the hook LINE is dropped (it's on-screen text, not caption) unless it's the only text;
  `labelStripOptions(channel)` → reels + TikTok.
- `src/lib/marketing/reel-server.ts`: `reelVideoServerProblems(url)` — the blocking rules, rescuing an
  extension-less link by a HEAD Content-Type (`headFacts` now exported from `carousel-server.ts`).
- Asset route (`PATCH /api/admin/marketing/assets/[id]`): new `video_url` / `video_meta` / `cover_url` (instagram_reel
  only, else 400), merged into `publish_target` like `media_urls`; 409 once sent to Metricool; blocking video problems
  → 400; a changed video drops stale `video_meta`. Approve on a reel: no `publish_target.video_url` → **400** "Add the
  reel's video first"; blocking problems → 400; reel + TikTok captions get `stripPostLabels` (saved back to `body`).
  "Send again" / "Unschedule" keep `video_url`, `video_meta`, `cover_url`. Scheduling unchanged (works for reels).
- Publisher: reel media = `[video_url]` only — an old reel's `graphic_url` is ignored. Optional `cover_url` is
  normalized (failure stops the publish with a clear message) → `videoThumbnailUrl`. `target` keeps `video_meta` /
  `cover_url`.
- Generate: reel brief → `title` = on-screen hook (≤ ~8 words), `body` = caption only (2–4 lines + 5–10 hashtags, no
  labels). Reel + TikTok bodies are label-stripped defensively. `instagram_reel` removed from `SOCIAL_GRAPHIC_CHANNELS`
  (no template is assigned to new reels; the campaign dialog's graphic picker no longer counts reels as "social").
- UI (`CampaignDetailPage.tsx` `ReelSection`): collapsed card = 9:16 thumbnail (cover if set, else first frame) with a
  play badge, status badge (**Checking… / Ready / Needs a fix / No video yet**), metadata line and warnings. Editor:
  `<video muted playsInline controls>` preview, the limits note, `MediaPicker` locked to video (`accept` MP4/MOV;
  upload ≤ 500 MB via TUS, Drive videos, or link; typed links debounced 600 ms), blocking problems in orange,
  warnings in muted text ("warnings only — the reel can still be approved"), **Re-check video**, and **Cover image
  (optional)** (any image → orient route `shape:'story'` → 1080×1920 JPEG → `cover_url`). Old reel drafts with an
  image graphic show a note that it isn't posted, plus **Use the old graphic as the cover**. The first save also strips
  `Hook:` / `Caption:` labels from the caption. Approve is disabled until a video is saved (reason shown under the
  post). A saved video without stored metadata is read once on load for display.

### Verified (2026-10-22, draft only)
`METRICOOL_MODE=draft` for the test process only. A synthetic 5 s 1080×1920 H.264 MP4 (Swift/AVFoundation, 72 KB) +
a 1080×1920 JPEG cover uploaded to `gallery/marketing/_reel-test-<ts>.*`, then `MetricoolPublisher.publish` for an
`instagram_reel` with `graphic_url` set to a dummy image (must be ignored). Read back
`GET /v2/scheduler/posts/{id}`: `draft: true`, `autoPublish: false`, `instagramData: {type:'REEL',
showReelOnFeed:true, autoPublish:false}`, `media` = the MP4 only, `videoThumbnailUrl` = the cover, provider status
`PENDING`. Then `deletePost` → ok, GET → not found; both storage files removed. No DB writes. Not verified: a LIVE reel
(Instagram's own processing of the cover / codec checks).
