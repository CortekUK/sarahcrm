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
- **Metricool live publishing** — mocked now (see decision 2). Real integration blocked on
  the client connecting a Metricool account.
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
- `metricool.ts` — stub throwing `NotImplemented` (documented seam for later).
- `index.ts` — `getPublisher(channel)` returns email-sender for email channels, MockPublisher
  for social/blog/PR. Selection is the ONLY place to change when Metricool lands.

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
> (mocked via `MockPublisher`; blocked on the client connecting a Metricool account — flip
> the single seam in `src/lib/marketing/publish/index.ts` when it lands).

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
- `src/lib/marketing/publish/metricool.ts` — documented `MetricoolPublisher` stub that throws.
- `src/lib/marketing/publish/index.ts` — `getPublisher(channel)`; the ONE seam to swap for Metricool.
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
- Metricool: implement `MetricoolPublisher.publish` and flip channels in
  `src/lib/marketing/publish/index.ts` (the single seam).

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
  **instagram_carousel** — `Slide N:` lines + a `Caption:` line. **instagram_reel** —
  `Hook:` + `Caption:` + hashtags. (All Instagram output is text only — the prompt
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
   - **Instagram carousel** shows `Slide 1:`…; **reel** shows `Hook:` / `Caption:`.
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

## ═══ METRICOOL INTEGRATION — HOW TO GO LIVE (deliberately NOT built; mocked) ═══
Social/blog/PR publishing is MOCKED today. The seam is ready so this is a drop-in, not a rewrite.

**The single swap point:** `src/lib/marketing/publish/index.ts` → `getPublisher(channel)`. It returns
`MockPublisher` for the social channels today; flip the relevant channels to return a `MetricoolPublisher`
(stub already at `src/lib/marketing/publish/metricool.ts`, currently throws NotImplemented). The MockPublisher
already carries `graphic_url` through in its target payload, so the image is present at swap time.

**Prerequisites (client-side, currently the blocker):**
- Client creates/connects a **Metricool account** and connects their Instagram, Facebook & LinkedIn profiles inside it.
- We obtain **Metricool API access** (API token / OAuth) + the **brand/blog id(s)**; store as env
  (e.g. `METRICOOL_API_TOKEN`, `METRICOOL_BLOG_ID`) or in a settings table.

**Implement `MetricoolPublisher.publish(asset)`** (asset = channel, `body` caption, `graphic_url` = the rendered
PNG's PUBLIC bucket URL (Metricool-fetchable ✓), `scheduled_at`, publish_target):
- Map channel → network: the 4 LinkedIn variants → LinkedIn; `instagram_feed`/`carousel`/`reel` → Instagram
  (feed vs reel post type); Facebook as applicable. Blogs/PR are NOT Metricool social — keep copy-out or route
  to a CMS separately.
- Create a **scheduled post** via Metricool's API: caption text + media (the public `graphic_url`) + network(s) +
  schedule time (from `scheduled_at`). Return `{ ok, externalId: <metricool post id> }`; the asset flips to
  `published`/`scheduled` with the external id (same shape the mock returns now).
- **Interactive IG Stories** (links/polls/stickers) CANNOT auto-publish (platform rule) → keep "prepared + notify
  the team to tap-publish" (ties to the team-wide Story notification item above).

**Batch/scheduling (client req):** approve a content plan/batch once → a scheduler runs `MetricoolPublisher`
for each approved asset at its `scheduled_at`. Build the batch-approval concept (outstanding item #2) alongside this.

**Verify at integration time:** confirm Metricool's current API supports programmatic scheduled-post creation with
media (their API surface changes). If it doesn't, fallbacks: (a) generate Metricool's **bulk-CSV** format for
import, or (b) post directly via the Meta Graph API + LinkedIn API (bigger; needs app review). Metricool stays
the chosen abstraction; only `MetricoolPublisher` + the `getPublisher` mapping change — nothing else in the engine.
