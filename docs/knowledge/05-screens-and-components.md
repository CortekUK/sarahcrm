# The Club by Sarah Restrick — UI Layer Reference (`src/views/` + `src/components/`)

Stack: Next.js 15 (App Router) / React 19 / TypeScript / Tailwind v4 / Radix. Data access is primarily direct Supabase browser client (`supabase.from(...)`, RLS-enforced) with Next.js API routes (`/api/...`) for anything needing server secrets (Stripe, Resend, WhatsApp, AI, Xero, Google, DocuSign).

**Shared admin UI kit:** `AdminPageHeader`, `AdminEmptyState`, `useConfirm()` (promise-based confirm dialog at `src/components/admin/ConfirmDialog.tsx`), `Modal`, `Card`, `Button`, `Input`, `Textarea`, `SelectMenu`, `Badge`, `StatCard`, `ActiveToggle`, `SortableList`/`DragHandle`, `ImageUpload`/`FileUpload`, `toast()`.

**Shared portal UI kit:** `src/components/portal/PortalChrome.tsx` — PortalCard, PortalButton, PortalBadge, PortalField, PortalInput, PortalTextarea, PortalModal, PortalSelect, PortalEmptyState, PortalLoading, PortalPageHeader, PortalSectionTitle, PortalStatTile.

This document has two parts:
- **PART A** — every admin/portal/staff/auth screen, action-by-action (`src/views/`).
- **PART B** — the shared component catalogue (`src/components/`), including the theming system.

---

# PART A — SCREENS

## A0. Admin core

### DashboardPage — `src/views/admin/DashboardPage.tsx`

Admin home. Header "Welcome back, Sarah" + today's date.

**Stat cards (row 1):** Active Members ("+N this month"), Introductions (vs "N last month"), Confirmed Bookings ("across all events"), Revenue MTD ("payments received" / "no payments yet").

**Executive overview (row 2)** — four clickable tiles: **Pending Applications** → `/dashboard/applications` ("awaiting decision"); **Renewals Due** → `/dashboard/members` ("next 30 days"); **Outstanding Invoices** → `/dashboard/finance` ("{N} overdue" / "none overdue"); **Sponsorship Pipeline** → `/dashboard/finance` ("open opportunities").

**Upcoming Events card:** table (Event, Date, Venue, Bookings [/capacity], Status). **"View All"** → `/dashboard/events`; row click → `/dashboard/events/{id}`. Empty: "No upcoming events scheduled" / "Create your first event to get started" + **"Create Event"** → `/dashboard/events/new`.

**Introductions feed** (8 most recently updated): both member names + status badge. Row click → `/dashboard/members/{member_a_id}`. Empty: "No introductions yet".

**Newest Members** (last 5): avatar, name, company, tier badge, join date. **"View All"** → `/dashboard/members`. Empty: "No members yet".

Tables read: `members`, `introductions`, `bookings`, `payments`, `events`, `membership_applications`, `sponsorships`. Read-only — no writes.

### ExecutiveDashboardPage — `src/views/admin/executive/ExecutiveDashboardPage.tsx`

Read-only leadership cockpit. Header: "Executive Dashboard" — "A leadership cockpit — members, pipeline, events, introductions and AI recommendations at a glance."

1. **Members** — 3 StatCard links: "Active members" → `/dashboard/members`; "Pending applications" → `/dashboard/applications`; "Renewing" (next 90 days) → `/dashboard/pipeline`.
2. **Pipeline — open value by stream** ("Open board →" `/dashboard/pipeline"). Subtitle: "Live opportunity only (New · Qualified · Proposal) — excludes won &amp; lost." Five dot-stats (Membership, Sponsorship, Concierge, Event, Commission) + Total. Bar chart (hidden when total is 0 → "No open pipeline value recorded yet.").
3. **Events** ("All events →"): Tickets sold, Guests, Sponsorship, Revenue, Cost.
4. **Introductions** — 3 StatCards: This month, Deals created, Revenue generated.
5. **AI recommendations** — 4 panels: *Introductions to make* ("Review suggestions" → `/dashboard/introductions`; empty "No AI suggestions awaiting review."); *Members at risk* ("View members"; empty "No members flagged at risk."; footnote "Churn risk ≥ 60"); *Upsell opportunities* (empty "No upsell opportunities flagged."; footnote "Upgrade potential ≥ 70"); *Hot prospects* ("View enquiries" → `/dashboard/enquiries`; empty "No hot prospects right now."; footnote "lead score ≥ 70").

No writes — purely navigational.

### PipelineStreamsChart — `src/views/admin/executive/PipelineStreamsChart.tsx`

Presentational Recharts bar chart of the five pipeline streams' open value, used only by Executive Dashboard. Custom tooltip: "Open value" / "Open items". No interactions, no API calls.

### PipelinePage — `src/views/admin/pipeline/PipelinePage.tsx`

Read-only Kanban unifying five pipelines. Header: "Pipeline" — "Every open opportunity across membership, sponsorship, concierge, introductions and events — one board, one set of stages. Read-only: edit a record on its own screen by clicking through."

**Stat tiles:** Open pipeline value (excludes won/lost); Open items; Follow-ups due; Outstanding invoices.

**Filter:** "All pipelines / Membership / Sponsorship / Concierge / Introduction / Event". Caption "{N} record(s) shown."

**Board:** columns **New, Qualified, Proposal / Quote, Won, Lost**, each with item count + total value. Card click deep-links: Membership → `/dashboard/applications`; Sponsorship → `/dashboard/events/{event_id}`; Concierge → `/dashboard/concierge`; Introduction → `/dashboard/introductions/{id}`; Event booking → `/dashboard/events/{event_id}`. Empty column: "No items".

**Side panels:** Follow-ups due (`/dashboard/tasks`; empty "Nothing due — all clear."); Renewals &amp; upgrades (90-day window, 7/30/60/90 buckets, "Upgrade potential" badge ≥70; `/dashboard/members/{id}`; empty "No renewals in the next 90 days."); Outstanding invoices (`/dashboard/finance`; empty "Nothing outstanding.").

No modals/forms/drag-and-drop — no writes at all.

### ChiefOfStaffPage — `src/views/admin/chief-of-staff/ChiefOfStaffPage.tsx`

AI daily leadership briefing. Header "Chief of Staff" — "Your single daily leadership briefing... generated fresh each morning and emailed to you at 7am." Meta "Generated {date/time}".

**Button: "Generate today's briefing"** (or **"Regenerate today's briefing"** once one exists) → `POST /api/admin/chief-of-staff/report`. Initial load → `GET /api/admin/chief-of-staff/report`.

**Empty:** "No briefing yet" / "Generate today's briefing to see memberships, pipeline, events, your team, finance and risks summarised in one place." + Generate button.

**Once generated:** hero narrative "Good morning, Sarah — Your daily briefing" (light-markdown render). Then: **Memberships** (Active/Pending/Renewing 30d); **Sales pipeline** ("Open →" `/dashboard/pipeline`: total + Membership/Sponsorship/Concierge/Introductions/Commission owed); **Finance** ("Open →" `/dashboard/finance`: Debtors+overdue, MRR, intros to follow up); **Events** ("Open →" `/dashboard/events`: sponsor-deadline badge, upcoming list, or "Nothing in the next fortnight."); **Team** ("Open →" `/dashboard/accountability/tasks`: overdue list, or "The board is clear — nothing overdue."); **Risks** (Members at risk w/ churn badge or "None flagged.", Sponsor assets missing, Accountant tasks overdue → `/dashboard/accountability/finance`).

---

## A1. Introductions — `src/views/admin/introductions/`

### IntroductionsListPage.tsx

**Purpose:** Main hub — inbox for member requests and AI suggestions, revenue/ROI insights, and the full introductions table.

**Header:** "Introductions", `{n} introduction(s) total`. Buttons: **"Generate suggestions"** (Sparkles, secondary) → `POST /api/admin/introductions/generate-suggestions` (toast `"{n} suggestion(s) generated"` or "No new suggestions"); **"Create Introduction"** (Plus, primary) → opens `CreateIntroductionModal`.

**Insights** (6 StatCards from `buildIntroReport()`): Introductions Requested, Introductions Made, Meetings Created, Opportunities Created, Total Introductions, Revenue Generated. Plus two ranked panels: "ROI by Member" and "ROI by Industry Sector" (empty: "No introduction revenue recorded yet.").

**Member requests inbox** (rows where `status==='suggested' &amp;&amp; requested_by`): "**{requester}** would like to meet **{other}**" + reason/desired outcome. **"Approve"** → `approveRequest` → `POST /api/admin/introductions/create {introduction_id}` → opens `IntroComposeModal` prefilled. **"Reject"** → "Reject request" modal.

**AI suggestions inbox** (rows where `status==='suggested' &amp;&amp; !requested_by`): match % + italic `match_reason`. **"Approve"** → same flow. **"Dismiss"** → `POST /api/admin/introductions/reject {introduction_id, notify:false}`.

**Filters:** search ("Search by member name or company..."); status Select (All / Suggested / Approved / Scheduled / Sent / Accepted / Completed / Declined).

**Table:** Member A, Member B, Match Score, Status (accepted shows as "Ready to connect"; sent/accepted/declined rows show per-member accept/decline/pending), Suggested, Event. Row click → `/dashboard/introductions/{id}`.

**Empty:** "No introductions yet" / "No introductions match your filters".

**"Reject request" modal:** Textarea "Internal note (admin only)"; Checkbox "Email the member a polite note" (default checked) → reveals Textarea "Message to the member (optional...)". **"Cancel"**, **"Reject request"** → `POST /api/admin/introductions/reject {introduction_id, note, notify, message}`. Toast "Request declined" (+ "The member was notified." if emailed).

### CreateIntroductionModal.tsx

Title "Create Introduction" (size md). Fields: **Member A** (searchable picker, required — "Select Member A"); **Member B** (excludes A, required — "Select Member B"); **Event (optional)** (Select: "No event" + published/live events); **Match Reason** (Textarea, optional).

Buttons: **"Cancel"**, **"Create Introduction"**. Submit orders `member_a_id &lt; member_b_id` and inserts into `introductions`: `{member_a_id, member_b_id, event_id, match_reason, status:'suggested', suggested_at:now}`.

### IntroComposeModal.tsx

Title "Review &amp; send introduction" (size xl). Opened after approving a suggestion/request. Two independent `SideEditor` panels — "First introduction" (Member A) and "Second introduction" (Member B).

**Per-side header:** avatar, name, email (or "no email on file" warning). Declined-resend: "{name} declined. Edit the message and re-send to try again." — send button reads "Re-send".

**Per-side fields:** **Template** dropdown ("Default introduction" or `email_templates` rows — selecting overwrites Subject/Body); **Subject**; **Message** (12-row textarea, helper "About {other member's name}. Blank lines separate paragraphs."). A "View &amp; respond" portal link is auto-appended.

**Per-side actions:** **"Send now"/"Re-send"** (disabled if no email/busy); **"Schedule"** → `DateTimeField` (date-only, min today) + **"Confirm"**. Both call `POST /api/admin/introductions/send {introduction_id, a:{action,date?,subject,body}, b:{...}}`. Validation: "Pick a date"/"Choose a date to schedule this email." Success: side collapses to green "Sent to {member.name}"; schedule success → gold "Scheduled for {date}" with undo X.

Footer: **"Done"** — if anything sent/scheduled, calls `onSent()`.

### IntroductionDetailPage.tsx

Route `/dashboard/introductions/[id]`. "← Back to Introductions".

**Header card:** avatars/names/companies, status Badge + match %, Match Reason, "Member's reason" (`request_reason`), Desired outcome.

**Member responses grid** (sent/accepted/declined/completed): name, response Badge, private note (admin-only), matching tags, event title.

**Lifecycle card:** declined → red X "Declined"; otherwise stepper Suggested → Approved → Sent → Accepted → Completed with timestamps ("Completed" = `followed_up_at`).

**Sending card** (hidden once terminal): "Email to {nameA}"/"Email to {nameB}" — Sent/Scheduled/Not sent. No send button here — sending starts from the compose modal or member profile. Buttons: **"Open {name}'s profile"** ×2 → `/dashboard/members/{id}`.

**Actions card** (hidden once terminal): note when both accepted; **"Decline introduction"** (ghost, X) → `supabase.from('introductions').update({status:'declined'})` — described as the only safe manual status flip from this page.

**Outcome card** (hidden only when declined): "Completed {date}." if completed. Renders `IntroOutcomeForm` with `agreementCommissionPct`.

### IntroOutcomeForm — `src/components/admin/IntroOutcomeForm.tsx`

Shared by Introduction Detail Page and MemberMatchesPanel — writes directly to `introductions`.

**Pipeline tracker pills** (independently lit): Introduced → Meeting → Proposal → Deal → Revenue → Testimonial.

**Fields:** "Meeting held" checkbox → DateField; "Proposal sent" checkbox → DateField; "Estimated value (£)"; "Deal outcome" pills **Undecided / Won / Lost** (helper: "Marking a deal Won or Lost completes the introduction."); if Won — "Revenue generated (£)", "Commission to the Club (£)" (with suggestion "Suggested: {£X} ({pct}%) — apply" from member's `agreement_commission_pct`); "Testimonial obtained" checkbox → Textarea; "Outcome notes" Textarea.

**"Save outcome"** (Save icon) → `update(buildIntroOutcomeUpdate(...))`. Toast "Outcome saved" / "Could not save outcome".

**Business logic (`src/lib/introductions/outcome.ts`):** revenue/commission persisted only when `deal_status==='won'`; `business_converted` synced to won; the instant `deal_status` becomes `won`/`lost`, `status` is set to `completed` + `followed_up_at` stamped — the only path to terminal completion. Recording only a meeting/proposal does NOT change status.

### End-to-end workflow: how to set up an introduction between two people

1. **Create** — "Create Introduction" modal → pick Member A, Member B, optional event/reason → inserted with `status:'suggested'`. (Or approve a member-requested/AI-suggested row from the inbox.)
2. **Approve** — click "Approve" → `POST /api/admin/introductions/create` → opens `IntroComposeModal` prefilled with default emails.
3. **Compose &amp; send** — edit each side's Template/Subject/Message independently → "Send now" or "Schedule" + "Confirm" per side.
4. **Member responds** via portal (`PortalIntroductionsPage` "Yes, introduce us" / "No, thank you") — recorded as `member_a_response`/`member_b_response`; a decline reopens that side as "Re-send".
5. Admin may **"Decline introduction"** any time before completion (terminal).
6. Once both accept, **record the outcome** via `IntroOutcomeForm`: Meeting held → Proposal sent → Estimated value → Deal outcome (Won/Lost completes it) → Revenue/Commission (if Won) → Testimonial → "Save outcome".

---

## A2. Members — `src/views/admin/members/`

### MembersListPage.tsx

`/dashboard/members` — active membership base. Header: "Members" — "Approved applications appear here automatically. Cancelling a member ends their portal access immediately — they keep their paid time on Stripe." Meta `{total} total · {active} active · {pending} pending · {cancelled} cancelled`. Actions: **Export**, **Import**, **Add member** (primary).

**Stat tiles:** Active, Pending, Cancelled, Total.
**Filters:** search (name/email/company/role) + tag Select; status pills (All/Active/Paused/Pending/Expired/Cancelled); tier pills (All/Tier 1/2/3).
**Table:** Member (avatar+name+email), Company (+job title), Tier, Status, Intros (`used/quota`), Joined, kebab menu.
**Empty:** "No members yet" (+ "Add first member"); "No matches".

**Kebab menu:** View details; Email member (mailto); Cancel membership (if not cancelled); Delete permanently.

**Actions:**
1. **Export** — client-side CSV of filtered rows (`first_name,last_name,email,phone,company_name,job_title,membership_tier,membership_status`), file `members-{count}.csv`.
2. **Import** → `ImportMembersModal`.
3. **Add member** → `AddMemberModal`.
4. **Cancel membership** — confirm `Cancel {name}'s membership?` (status→cancelled, portal revoked immediately, Stripe cancelled at period end, reversible). Confirm "Cancel membership", danger → `POST /api/admin/members/cancel {member_id}`.
5. **Delete permanently** — confirm `Delete {name}?` (auth account/profile/members row/bookings/introductions removed permanently, active Stripe sub cancelled immediately, irreversible). Confirm "Delete permanently", danger → `POST /api/admin/members/delete {member_id}`. Toast "Member archived" or "Member deleted".

### AddMemberModal.tsx

Modal "Add new member" (lg). Fields: First name*, Last name*, Email* (valid-email check), Phone, Job title; Company name/Website/Description; Plan Select (default tier_1); Status Select — **"Pending — awaiting them"** (default) / **"Active — portal access immediately"**; Checkbox **"Send branded invitation email"** (default checked); Tags (pill toggle by category); Internal notes.

Buttons: Cancel, **"Add member"** → `POST /api/admin/members/create {...formData, tag_ids}`. Toast "Member added".

### ImportMembersModal.tsx

Modal "Import members from CSV" (lg). Client-side CSV parser with fuzzy header aliasing.

**Step 1:** required columns `first_name, last_name, email`; **"Choose a CSV file"**. Errors: "That file has no data rows..."; "Could not find an "email" column..."; "Could not read that file...".

**Step 2 — preview:** `**{validCount}** ready to import · {invalidCount} will be skipped (bad/blank email)`; preview table (first 50 rows). Options: Default tier (1/2/3); Default status (Pending/Active); Email invites (Don't email anyone / Send branded set-password invite).

Footer: Cancel, **"Import {n} member(s)"** → `POST /api/admin/members/import {rows, send_invites, default_tier, default_status}`. Results view: Added/Updated/Skipped stat cards + skipped-row reasons. Toast "Import complete — {created} added, {reused} updated, {skipped} skipped."

### MemberDetailPage.tsx

`/dashboard/members/{id}`. Top bar (view): **Edit** (Pencil), **Resend login** (Mail), **Cancel membership** (Ban, hidden if cancelled), **Delete** (Trash2, danger). Top bar (edit): **Cancel** (X), **Save changes**.

**Cancelled banner:** "Membership cancelled — This member can no longer sign into the portal. Edit and set status back to 'active' to reinstate them."

**Profile (view):** avatar, name, status+tier Badge, job title @ company, email/phone, bio, meta (Plan, Intros used/quota, Directory visible/hidden, Joined, Renewal).
**Profile (edit):** First/Last name*, Email, Phone, Job title, LinkedIn URL, Website URL, Bio, Company fields, Plan Select, Status Select (Active/Paused/Pending/Expired/Cancelled), checkbox "Show in member directory", Notes.

**Relationship intelligence card:** enrichment-status Badge; **"Enrich"/"Re-enrich"** (Sparkles) → `POST /api/admin/members/enrich {memberId}` ("Autofills empty company fields only... existing entries are never overwritten"). Sections: Company depth, Accounts &amp; finance contacts, Introduction strategy, Objectives &amp; budgets, Preferences.

**Embedded panels (view only):** `MemberRoiPanel`, `MemberScoresPanel`, `MemberRecommendationsPanel`.

**RepsPanel** — shown only if `membership_type==='business'` and no `parent_member_id`. Rep notice for reps: "This member is a representative under a business account." + link.

**Subscription card:** Status, Stripe subscription/customer id, Next renewal/Ended date.

`MemberDocumentsPanel`; **Application data card** (if matched application): location, identity, business details, online presence, application-time snapshot, how they heard.

**Tags card:** AI Suggestions ("Suggest"/"Refresh" → `POST /api/admin/members/{id}/suggest-tags`; empty "No confident picks yet..."); quick-add tag (text+category, writes `tags` then `member_tags`; duplicate: "That tag already exists."); all tags as immediate toggle pills.

`MemberMatchesPanel`, `GmailThreadPanel` embedded. **History tabs:** "Event history" / "Payments" (empty "No event bookings yet"/"No payments yet").

**Resend login** — confirm `Send login details to {name}?` → `POST /api/admin/members/resend-invite {member_id}`. Toast "Login details sent — {email}".
**Save changes** — writes `profiles` (name/email/phone/job_title/bio/linkedin_url/website_url) and `members` (membership_type via `planForTier`, tier, quota reset via `introQuotaForTier` if tier changed, status, showcase_enabled, company/relationship fields). Tags persist independently.

### GmailThreadPanel.tsx

Card "Emails" — "Conversation history synced from the connected inbox. AI-drafted replies are saved as Gmail drafts for review — nothing is sent automatically." Reads `gmail_messages` grouped into threads. Empty: "No emails found for this contact yet."

**Thread row** (collapsible): message cards (outbound "Sent · {from}"; inbound "Received · {from}"). **"Draft reply with AI"** (Sparkles) → `POST /api/admin/google/gmail/draft-reply {thread_id}` → editable subject+body → **"Save as Gmail draft"** → `POST /api/admin/google/gmail/create-draft {thread_id, subject, body_html}` (toast "Draft saved to Gmail") and **"Discard"**.

### MemberDocumentsPanel.tsx

Card "Documents". Doc type Select (Onboarding form/NDA/Introducer/commission agreement/Membership agreement/Contract/Other). **Upload** (max 25MB, else toast "File too large") → `member-documents` bucket + `member_documents` row (rolled back on failure). **View** (Eye, 60s signed URL). **Delete** (Trash2, confirm "Delete this document?" irreversible). Empty: "No documents yet — upload onboarding forms, agreements or NDAs above." Auto-runs `POST /api/admin/signatures/status {member_id}` on mount.

### MemberMatchesPanel.tsx

Card "Suggested introductions" ("Tag match" pill). Sub-text: "These members share the most tags with {memberName}. Tap Why? for an AI explanation of the fit, then Approve to compose and send (or schedule) the introduction." Hidden if no tags and no existing introductions.

**Existing introductions** (grouped by counterpart): status pill, per-side email status, **"Previous · {n}"** (History modal), **"Edit outcome"/"Record outcome"**, **"Create introduction"/"Manage"** → `handleApprove` → `POST /api/admin/introductions/create` → `IntroComposeModal`.

**Fresh matches:** name, score %, reason, shared/other tags. **"Why?"** (Sparkles) → `POST /api/admin/introductions/why {member_id, other_id}` modal. **"Approve"**.

**History modal:** `Introductions with {name}`. **Record outcome modal:** embeds `IntroOutcomeForm`. Empty/loading: "Finding matches…", "No more matches — add more tags to this and other members."

### MemberSuccessPage.tsx

Header "Member Success" — "Members needing attention. Health scores refresh automatically every day..." Meta `{n} member(s) flagged`. **"Recompute now"** (RefreshCw) → `POST /api/admin/members/recompute-scores`. Toast "Scores recomputed"/"Recompute failed".

**5 tiles/filters:** At risk, Renewal soon, No introductions, Dormant, Upgrade ready. **Table:** Member, Flags, Churn, Engage, Upgrade, Top reason, "View member". Empty: "Everyone looks healthy" / "No matches".

### RepsPanel.tsx

Card "Representatives ({activeCount})" — "People who share {companyName}'s business membership. Each gets their own portal login; billing stays on this account." **"Add rep"**.

Row: avatar, name ("Primary" label if `is_primary_rep`), role/email, status Badge, "Open" link, remove icon. Empty: "No representatives yet — Add colleagues who should have their own login under this membership."

**"Add representative" modal:** First name*, Last name*, Email* (all required); Role at the business; "Make this the primary contact"; "Send them a branded set-password invite now" (default checked). → `POST /api/admin/members/add-rep`. Toast "Representative added".

**Remove rep:** confirm `Remove {name}?` — sets `membership_status:'cancelled'` directly via Supabase (no API route). Confirm "Remove representative", danger.

### MemberRecommendationsPanel — `src/components/admin/MemberRecommendationsPanel.tsx`

Card "Recommended for this member" (Compass) — client-computed via `computeMemberRecommendations`. Groups: "Events to invite them to", "Sponsors &amp; strategic partners", "Experiences &amp; travel" — display-only. States: "Finding recommendations…"; "Add event &amp; travel preferences to personalise recommendations..."; "No matches right now...".

### MemberRoiPanel — `src/components/admin/MemberRoiPanel.tsx`

Card "Commercial value / ROI" — read-only, `computeMemberRoi`. "Value The Club delivered" (revenue via intros, opportunities/pipeline, intros made/received, meetings held, deals won); "Their spend with The Club" (revenue paid, event/sponsorship/concierge spend, events attended, lifetime value).

### MemberScoresPanel — `src/components/admin/MemberScoresPanel.tsx`

Card "Relationship scores" (Activity). **"Recompute scores"** (RefreshCw) → `POST /api/admin/members/recompute-scores?member_id={id}`. Four 0–100 meters: Engagement, Relationship capital, Relationship health, Churn risk (+reasons). Toast "Scores recomputed &amp; saved".

### GmailExtractionsPanel — `src/components/admin/GmailExtractionsPanel.tsx`

Card "Detected from email" (Sparkles) — "AI spotted these possible new contacts / introductions in inbound email. Review and add to your leads, or dismiss. Nothing is created automatically." Renders null if empty.

Items: `new_contact` (badge "New contact") or `introduction` (badge "Introduction"). **"Add lead"** (new_contact only) → `POST /api/admin/google/gmail/extractions {id, action:'approve'}`; **"Dismiss"** → same, `action:'dismiss'`. Toggle **"Show filtered ({n})"** — bulk-sender emails with per-row **"Add as lead"** → `POST /api/admin/google/gmail/filtered {email, action:'add_lead'}`.

### Members — end-to-end workflows

- **Add single member:** list → "Add member" → fill modal → `POST /api/admin/members/create`.
- **Bulk import:** list → "Import" → CSV → preview + defaults → "Import N members".
- **View/edit:** click row → detail page → "Edit" → "Save changes" (`profiles`/`members`).
- **Enrich:** "Enrich"/"Re-enrich" autofills empty company fields only.
- **AI tag suggestions:** "Suggest" → "Add" writes `member_tags` immediately.
- **Match &amp; introduce:** MemberMatchesPanel scores tag overlap → "Why?" → "Approve"/"Manage" → `/api/admin/introductions/create` → compose modal → outcome via `IntroOutcomeForm`.
- **Member Success sweep:** "Recompute now" force-runs the daily score recompute.
- **Business accounts &amp; reps:** RepsPanel manages reps sharing a business membership via `parent_member_id`.

---

## A3. Marketing — `src/views/admin/marketing/`

### CampaignDetailPage.tsx

`/dashboard/marketing/[id]` — approval queue for one campaign's drafts. "Approval queue — review, edit and approve each channel draft. Nothing publishes until you click Approve."

One `AssetCard` per draft (channel icon, voice subline, status Badge: draft/in_review/approved/scheduled/published/rejected).

**Newsletter:** **"Regenerate"** → `POST /api/admin/marketing/generate {campaign_id, channels, regenerate_asset_id}`; **"Open in email designer"** (if linked template).
**Editing:** **"Save"** → `PATCH /api/admin/marketing/assets/{id} {action:'save', title, body}`; **"Cancel"**.
**View mode:** **"Regenerate"**, **"Edit"** (disabled if published), **"Copy"/"Copied"**, **"Reject"** → `{action:'reject'}`, **"Approve &amp; publish"/"Published"** → `{action:'approve'}`.

**GraphicSection** (social/LinkedIn): **"Add graphic"/"Edit graphic"/"Close graphic editor"**; toggle "Use image as-is (no text overlay)". As-is: `MediaPicker` + **"Use this image"**. Template mode: Select template, per-slot AI-text inputs, `MediaPicker`, **"Render graphic"/"Re-render graphic"** → `POST /api/admin/marketing/graphics/render`.

Empty: "Campaign not found." / "No drafts yet for this campaign."

### LibraryPage.tsx

`/dashboard/marketing/library` — "Content Library". Filters: search (debounced), channel/voice/event/sponsor Selects → `GET /api/admin/marketing/library?...`.

Empty: "The library is empty" / "No pieces match these filters".

**LibraryCard:** **"Copy"/"Copied"**; **"Open"** (if `campaign_id`); **"Reuse"** (Sparkles) → `POST /api/admin/marketing/library/{id}/reuse` → toast "Started a new campaign from this piece" → navigates to it.

### MarketingPage.tsx

`/dashboard/marketing` — campaigns hub. **"New campaign"** (Plus). Table: Campaign, Source, Drafts, Status, Created → row `/dashboard/marketing/{id}`. Empty: "No campaigns yet" / "New campaign".

**"New campaign" modal (lg):** Input "Campaign title"; Select "Source" — An event / A typed topic / An audio recording (transcribed); conditional: event Select, or Textarea "Topic / brief", or audio upload (mp3/m4a/wav/mp4/webm, max 25MB) → `POST /api/admin/marketing/transcribe` → editable "Transcript"; Select "Default voice" (helper: applied to blog/Instagram/press-release/sponsor; LinkedIn always produces all four voices); "Channels to generate" chip toggles ("Select all"/"Clear"; default `seo_blog`+`linkedin`); conditional "Social graphic" Select if a social channel picked.

Validation: "Please give the campaign a title."; "Pick at least one channel to generate."; "Choose an event."; "Type a topic or brief."; "Upload a recording to transcribe first."

Submit: `POST /api/admin/marketing/campaigns {...}` then `POST /api/admin/marketing/generate {campaign_id, channels, default_voice, template_id, graphic_mode}`. **"Cancel"**, **"Create &amp; generate"**.

### SegmentsPage.tsx

`/dashboard/marketing/segments`. **"New segment"**. `SegmentCard`: name, edit/delete, rule summary, live member-count Badge, "Updated {date}". Empty: "No segments yet" / "Create the first segment".

Delete: confirm `Delete "{name}"?` ("Members are untouched, and past campaigns... keep their history.") → `DELETE /api/admin/marketing/segments?id=`.

**SegmentEditorModal (xl):** Name; ChipGroups Membership tier / Membership status (empty = "Active only (default)") / Membership type; Tags by category with ANY/ALL toggle when ≥1 selected. Live preview (debounced 350ms) → `POST /api/admin/marketing/segments/preview {rules}`. Save: **"Create segment"/"Save changes"**.

### TemplatesPage.tsx

`/dashboard/marketing/templates` — social-graphic template designer. **"New template"**. List: preview image, name, shape Badge, slot count. Actions: **"Edit"**, **"Duplicate"** (suffix " copy"), **"Delete"** (native `confirm()`) → `DELETE /api/admin/marketing/templates?id=`. Empty: "No templates yet" / "New template".

**Builder:** Input "Template name"; Select "Shape"; Background (color swatches/hex or photo upload to `social-graphics`); Slots — add Heading/Subtext/Fixed line/Photo, draggable, Zone (Top/Middle/Bottom)/Align/Text source (AI-written/Fixed)/Font/Size/Colour. Live preview `/api/admin/marketing/graphics/preview?state=` debounced 250ms.

Validation: "Give the template a name."; "Add at least one slot." Save: `POST`/`PATCH /api/admin/marketing/templates`.

### VoicesPage.tsx

`/dashboard/marketing/voices` — exactly 2 fixed voices (`club`, `sarah`). Per card: Input "Display name", Textarea "Guidance", "Reference sample posts" (add/remove). **"Save voice"** → `PATCH /api/admin/marketing/voices {key, name, guidance, samples}`.

### SendTemplateModal — `src/components/templates/SendTemplateModal.tsx`

Dialog "Send template" — `{name} · {subject}`. Select "Recipients": All active members / Attendees of an event (live count). **"Preview"** (Eye) → `POST /api/communications/send-template {..., dry_run:true}`; **"Send {n}"** → confirm "Send this email?" (warning) → `dry_run:false`. Result: Sent/Failed/Skipped tiles. Toast "All emails sent" or "Sent with {n} issue(s)".

### Email block editor — `src/components/templates/editor/*`

**AiPromptPanel:** chat-based generator. Header: category select (CAMPAIGN/AUTOMATION/TRANSACTIONAL); History (delete confirm "Delete chat?"); Plus ("New chat"). Suggestions when empty: "What upcoming events do we have?...", "Booking confirmation...", "Member welcome email...", "Event reminder, 7 days out...", "Introduction email pairing two members...". Event picker with **"Include in email"**. Attachments via paperclip. Send → `POST /api/templates/ai-generate {prompt, mode, category, existingBlocks, chat_id, attachments, template_id}`.

**BlockLibrary:** 10 add-block buttons — Text, Button, Image, Divider, Spacer, Signature, Columns, Social, Video, HTML.

**BlockProperties:** per-type inspector.

**EditorCanvas:** drag/drop canvas, inline-editable Text/Button, sample merge-tag data. Empty: "Drag blocks here to build your email" / "Or click a block in the sidebar to add it" / "Or hit the AI toggle...".

**EmailEditorPage:** full-screen shell — close (X, confirm "Leave without saving?" if dirty), editable name, Build/AI toggle, Undo/Redo, **"Save Draft"**, **"Save &amp; Exit"**. PreviewSlideout **"Send test"** → `POST /api/templates/send-test`.

**LeftSidebar:** accordions Settings / Blocks / Edit:{type}.
**MergeTagDropdown:** "Insert Merge Tag" popover.
**PreviewSlideout:** Desktop/Mobile toggle, "Test as" persona selector (3 sample profiles), **"Send test"**.

### Marketing — end-to-end workflows

1. **Campaign:** "New campaign" (event/topic/audio, channels, voice, graphic) → "Create &amp; generate" → Campaign Detail → per-asset edit/regenerate/graphic-render → "Approve &amp; publish" or "Reject"; newsletter routes to email designer. Approved pieces surface in Library ("Reuse" seeds a new campaign).
2. **Segment:** "New segment" → chip filters + live count → "Create segment"; used by Communications send wizard.
3. **Send saved template:** SendTemplateModal → pick recipients → "Preview" → "Send" (confirm).
4. **Social template:** "New template" → shape/background/slots → "Save template".
5. **Voices:** edit Guidance + samples → "Save voice".
6. **Build email:** Build mode (blocks) or AI mode (chat) → PreviewSlideout "Send test" → "Save Draft"/"Save &amp; Exit".

---

## A4. Sponsorship Intelligence — `src/views/admin/sponsorship/`

### SponsorshipHub.tsx

Header "Sponsorship intelligence" — "Find the ideal sponsors for an event — warm matches from your CRM plus cold discovery — then draft a personalised outreach sequence for your review."

Event picker Select (`?event_id=` deep-link).

**"Find ideal sponsors" card (Sparkles):** Textarea "Brief (optional)"; Textarea "Paste deck text (optional)" + **"Read deck"** (FileText) → `POST /api/admin/sponsorship/deck/parse {text}` (toast "Deck read"); **"Find ideal sponsors"** (Wand2, primary, disabled without event) → `POST /api/admin/sponsorship/match {event_id, brief?, deck_brief?}` → toast "Ideal sponsors found — {total} prospects ranked for this event." (or cold-discovery-limited notice).

**Stats row:** Prospects found, Warm (CRM), Cold (discovery), Outreach sent (from `GET /api/admin/sponsorship/outreach?event_id=`).

**Ranked prospects:** "Go to review queue →" `/dashboard/sponsorship/outreach?event_id=` + embedded `ProspectsView`.

### ProspectsView.tsx

Ranked prospect list for one event (`GET /api/admin/sponsorship/prospects?event_id=`). No-event: "Choose an event to see its ideal sponsors." Empty: "No prospects yet" / "Run a match from the intelligence panel...".

**Prospect card:** company, fit-score Badge, temperature Badge ("Cold"/"Warm · {source}"), website/LinkedIn links, industry/revenue, "In event sponsors" checkmark.

**Actions:** **"Shortlist"** (ThumbsUp) → `PATCH /api/admin/sponsorship/prospects {id, status:'shortlisted'}` (optimistic, toast "Shortlisted"); **"Dismiss"** (ThumbsDown) → `{status:'dismissed'}`; **"People"** (Users) → `POST /api/admin/sponsorship/decision-makers {prospect_id}` (degrades: "No decision-makers found...", "People search needs a paid vendor plan.", "People search failed."); **"Draft"** (PenLine) → "Draft outreach — {company_name}" modal; **"Add to event sponsors"** (Plus, hidden once converted) → `POST /api/admin/sponsorship/convert {prospect_id}` (toast "Added to event sponsors" — appears in the event's Sponsors panel); **"Details"/"Hide"** toggle → match reasons/AI rationale/description/decision-makers.

**"Draft outreach" modal:** intro "Nothing is sent — every step lands in the review queue for you to edit, approve and send." Select "Voice" (Club/Sarah, default club); Select "Recipient" (if decision-makers loaded); number "Steps" (1–6, default 3); Textarea "Note for the writer (optional)". **"Add drafts to queue"** → `POST /api/admin/sponsorship/outreach/draft {prospect_id, decision_maker_id?, voice, steps, note?}` → toast "{n} draft(s) added to the review queue".

### OutreachQueueView.tsx

Header "Outreach review queue" — "Every drafted step waits here. Edit the copy, approve it, then send — nothing leaves until you approve and click Send."

**Filters:** Event Select, Status Select (Draft/Approved/Sent/Replied/Failed), Voice Select. Rows grouped by status. Empty: "Nothing in the queue" / "No drafts match the current filters." or "Draft outreach from a ranked prospect and the sequence will appear here for review."

**"Review outreach" modal (xl):** To, Subject, Body (textarea), read-only Preview (`body_html`).

Buttons: **"Save"** → `PATCH /api/admin/sponsorship/outreach {id, subject, body_text, to_email}`; **"Approve"** (shown when not approved, only enabled for `draft`) → `{status:'approved'}` → toast "Approved — ready to send"; **"Unapprove"** (shown when approved) → `{status:'draft'}`; **"Send"** — **human approval gate**: disabled unless status `approved` AND non-empty To email → `POST /api/admin/sponsorship/outreach/send {outreach_id}` → toast "Sent — Delivered to {toEmail}."

### Sponsorship — end-to-end workflow

1. **Find sponsors:** pick event, optional brief/deck ("Read deck"), "Find ideal sponsors" → ranked warm+cold prospects.
2. **Triage:** ProspectsView — Shortlist/Dismiss, expand Details, "People" for decision-makers.
3. **Convert (optional):** "Add to event sponsors" → real Sponsors panel on the event.
4. **Draft outreach:** "Draft" → voice/recipient/steps/note → "Add drafts to queue" (status `draft`, nothing sent).
5. **Review:** OutreachQueueView — edit To/Subject/Body, "Save", preview.
6. **Approval gate:** "Approve" required before "Send" is enabled ("Unapprove" reverts).
7. **Send:** fires the actual email; status → `sent` → `replied`/`failed` as it resolves.

No automated send path exists — every send requires explicit Approve + Send.

---

## A5. Accountability — `src/views/admin/accountability/`

### AccountabilityDashboardPage.tsx

Read-only rollup. Header "Accountability Overview" — "A read-only, team-only snapshot of the accountability system — workload, hours, scorecards and handovers."

**Headline StatCards:** Active staff, Open tasks, Overdue tasks, Blocked tasks, Hours this week, Handovers today. "Task status breakdown" stacked bar.

**"Needs attention"** (4 sub-panels: Overdue tasks, Blocked tasks, No handover today, Low scorecard this week &lt;50%). All-clear: "Nothing needs attention" / "No overdue or blocked tasks, everyone has submitted today's handover, and no scorecard is running low this week."

**Per-staff workload table:** Staff, Open, Overdue, Blocked, Hours(wk), Done(wk), Scorecard, Handover. Empty: "No active staff" / "Add or activate team members under Accountability → Team Members."

No buttons/dialogs — pure reporting.

### AccountabilityTasksPage.tsx

Header "Accountability" — single-owner tasks with comment thread/attachments/activity. **"Assign task"** (Plus, disabled if no active staff). Warning banner if no staff: "Add a team member first (Accountability → Team Members) before assigning tasks."

**Stat cards:** Open, In progress, Overdue, Done. **Filters:** Owner Select, Status Select ("Open (not done)" default), Search.

**Table:** Task, Owner, Deadline (red/bold if overdue), Status (inline Select — writes immediately). Row click (not status cell) opens edit modal. Empty: "No accountability tasks here" / "Assign a task to a team member to start tracking it — with an owner, a deadline and full transparency."

**Modal:** Title, Description, Owner, Deadline, Status, Event (optional), Outcome. Editing embeds `TaskCollab`.
Validation: "Title required"; "An owner is required".
Buttons: Delete (editing only, confirm "Delete this task?" — "task and all its comments, attachments and activity history are permanently removed" — confirm "Delete task", danger); Cancel; **"Save changes"/"Assign task"**.

### DailyHandoverPage.tsx

Header "Daily Handover" — pick a date to see who's submitted, read each handover, generate Sarah's Daily Leadership Report.

**Date nav:** Previous/Next-day chevrons, "Today" jump. **Submission status:** Badge "{submitted}/{total} submitted"; "Waiting on: {names}". **"Generate report"/"Regenerate report"** (Sparkles, disabled if zero submissions) → `POST /api/admin/handover/report {report_date}` → toast "Leadership report generated".

**Leadership report card:** narrative + "Generated {datetime}".
**Per-staff cards:** Submitted/Not submitted Badge; 4 fields (completed_today, working_tomorrow, blocked, support_needed) or "No handover submitted for this date yet."
Empty: "No staff yet" / "Add team members under Accountability → Team Members."

### FinanceTasksPage.tsx

Header "Finance Tasks" — 3-level escalation contact chain. **"Add finance task"**.

**Stat cards:** Active tasks, Pending occurrences, Overdue. **Overdue banner:** rows with escalation-level Badge + **"Mark complete"**.

**Task list:** title, cadence Badge, "Inactive" badge; **"Edit"**, **"Deactivate"/"Reactivate"**. Occurrence rows: due/status, escalation badge, **"Mark complete"** if pending. Empty: "No finance tasks yet" / "Add a recurring finance deliverable and its three contacts. The system will create each period's occurrence and chase it automatically when overdue."

**Modal (lg):** Title, Cadence Select, Due day of period (1–28), Accountant (level 1) Name+Email, Escalation — Finance Director (level 2) Name+Email, Final — Sarah (level 3) Name+Email, Active checkbox (editing only). Validation: "Title is required"; "Due day must be a whole number 1–28". Toast "Finance task created"/"updated".

### ScorecardsPage.tsx

Header "Scorecards" — auto vs manual targets, Friday summary. **Week nav:** Previous/Next-week, "This week".

**Per-staff card:** Badge "{met}/{total} met · {score}%"; **"Add target"**; **"Generate summary"** (Sparkles, disabled without targets) → `POST /api/admin/scorecards/summary {staff_id, week_start}` → toast "Summary generated".

**Targets table:** Target/Source/Target number/Actual (inline-editable if manual, autosave on blur/Enter)/Status Badge/edit. Empty: "No targets set for this week yet. Add one to start tracking." Overall empty: "No staff yet".

**Modal:** Label, Target number, Source Select, Actual so far (manual only). Validation: "A label is required"; "Enter a valid target number". Remove: confirm "Remove this target?" → "Remove target", danger.

### SopLibraryPage.tsx

Header "SOP Library" — "knowledge that doesn't walk out the door." **"Add SOP"**.
**Stat cards:** Total, Published, Drafts. **Filters:** search, category chips.
**List (by category):** title, status Badge, "Updated {datetime}". Actions: **"Preview"** (Eye), **"Edit"**, **"Publish"/"Unpublish"**, **"Delete"**.
Empty: "No SOPs yet" / "Create your first Standard Operating Procedure. Save it as a draft while you refine it, then publish so staff can read it."; filtered: "No SOPs match your filters."

**Modal (xl):** Title, Category (Select + "＋ New category"), Body (`RichTextEditor`). Validation: "Title is required." Buttons: **"Save draft"**, **"Publish"/"Save &amp; keep published"**. Delete confirm: `Delete **{title}**? This cannot be undone.` → **"Delete"**.

### TeamMembersPage.tsx

Header "Team Members" — "Staff and freelancers with their own limited logins. They see only their own accountability tasks — nothing else in the CRM." **"Add team member"**.

**Stat cards:** Total, Active, Inactive. **Table:** Name, Email, Job title, Rate (£/h, inline-editable), Type Badge, Status (`ActiveToggle`), Login (**"Send login"** → `POST /api/admin/team/resend-invite {profile_id}`). Empty: "No team members yet" / "Add a team member or freelancer to give them a login and start assigning accountability tasks."

**Modal:** First name*, Last name*, Email*, Type Select (Team member/Freelancer), Job title. Note: "An invite email with a temporary password is sent." **"Add &amp; invite"** → `POST /api/admin/team/create {first_name, last_name, email, role, job_title, send_invite}`. Toast "Team member added".

### TimeProfitabilityPage.tsx

Header "Time &amp; Profitability" — "Hours roll up from each staff member's tasks to the event they're linked to. Enter an event's revenue and the system computes cost (hours × rate) and profit."

**Stat cards:** Tracked revenue, Staff cost, Profit, Hours (linked). **By event table:** Event, Hours, Cost (computed), Revenue (inline-editable → upserts `event_profitability`), Profit. Empty: "No events being tracked yet" / "Link a task to an event (Accountability → Tasks) so its logged time rolls up here, then enter the event's revenue." **By staff table:** Staff, Total hours, Rate, Cost, Tasks completed. Empty: "No staff yet".

### TaskCollab — `src/components/accountability/TaskCollab.tsx`

Embedded in task edit modals — Attachments (upload/download/delete, `accountability-files` bucket), Comments (post/list), Activity (read-only audit log). Empty: "No files attached." / "No comments yet." / "No activity yet."

### TaskTimeLog — `src/components/accountability/TaskTimeLog.tsx`

Timer block: **"Start timer"/"Stop &amp; save"** (live elapsed clock; only one running timer per staff — error "You already have a timer running. Stop it first."). Manual entry: Hours*, Date, Note → **"Log hours"** (validation "Enter a number of hours greater than 0"). Entries list with source badge, per-entry delete.

### Accountability — end-to-end workflows

- **Assign &amp; track a task:** "Assign task" → status changes inline or via modal → outcome recorded → TaskCollab for comments/attachments/activity.
- **Daily handover:** navigate dates → review submissions → "Generate report" once ≥1 submitted.
- **Finance task:** "Add finance task" with 3-contact escalation chain → occurrences seeded → cron auto-chases overdue → "Mark complete".
- **Weekly scorecards:** "Add target" per staff → "Generate summary" (typically Fridays).
- **SOP:** "Add SOP" → draft or publish; edit/publish/unpublish/delete.
- **Onboard staff:** "Add team member" → invite emailed → set hourly rate inline → toggle Active/Inactive → "Send login" to resend.
- **Event profitability:** link task to event + log hours → set staff rate → enter event Revenue on Time &amp; Profitability page.

---

## A6. Inbox — `src/views/admin/inbox/`

Gmail-style two-pane shared mailbox client. All data via `/api/admin/inbox/*` (no direct client-side Supabase). No compose/reply/forward — read-only mail viewing plus access management. No keyboard shortcuts.

### InboxPage.tsx

Left pane: "Inbox" title; **"Access"** (Settings2, admin-only) → `ManageAccessModal`; mailbox switcher pills ("All" + each mailbox); search "Search mail…" (debounced 300ms); checkbox "Show noise (newsletters, notifications…)".

Endpoints: `GET /api/admin/inbox/mailboxes`; `GET /api/admin/inbox/threads?mailbox=&amp;q=&amp;includeNoise=&amp;limit=30&amp;offset=`; `GET /api/admin/inbox/thread/{gmail_thread_id}` (marks read server-side, optimistic local clear).

Empty: "No inbox access" / "You don't have access to any inbox yet. Ask an administrator to grant you access." (both panes); "Select a conversation" / "Choose a message on the left to read the full thread." (nothing selected).

### InboxThreadList.tsx

Loading "Loading…". Empty "No messages" / "Nothing matches the current inbox and filters." Row: unread dot, from_email, relative date; subject + count if &gt;1; snippet + mailbox Badge (in "All" view). **"Load more"** if `hasMore`.

### InboxThreadView.tsx

Header: subject + count. Loading "Loading thread…". Empty "This thread has no messages."
**MessageCard:** direction Badge (Received/Sent), sender, "To: {recipients}", date. Body: sanitized HTML (not iframe) or `&lt;pre&gt;` or "(empty message)".
**EmailBody:** remote images blocked by default; toggle **"Display images"/"Hide remote images"** (ImageOff) — client-side only.

### ManageAccessModal.tsx

Modal "Manage inbox access" — "Pick a CRM user, then choose which inboxes they can read. Admins already see every inbox." `GET /api/admin/inbox/access`.

Select "Staff member". Placeholder: "Choose a staff member above to manage their inbox access." Mailbox toggle list: "{n} of {total} granted". Toggle → `POST /api/admin/inbox/access {action:'grant'|'revoke', profile_id, mailbox}` (persists immediately, no Save button). Toast "Access granted"/"Access revoked"/"Update failed".

### Inbox — end-to-end workflows

1. Read a thread: mailboxes load → thread list (mailbox/search/noise filters) → "Load more" → click thread → marks read → toggle images per message.
2. Manage access (admin): "Access" → pick staff member → toggle mailbox grants (each persists immediately).

---

## A7. Events — `src/views/admin/events/`

### EventsListPage.tsx

`/dashboard/events`. Header "Events" — "Member nights, curated luxury, retreats — and a separate Private Events tab for the showcase cards on the Private Events page (external-link commissions, not bookable here)." **"Create event"** (hidden on Private Events tab) → `/dashboard/events/new`.

**Stat tiles:** Upcoming, Private showcases, Total bookings, Revenue. **Tabs:** All, Member Events, Curated Luxury, Retreats, Past, Private Events.

**Bookable events table:** Event, Date, Venue, Type pill, Bookings (count/capacity), Revenue, Status, row ⋮: **"Edit"** → `/dashboard/events/{id}/edit`; **"Delete"** → confirm `Delete "{title}"?` (public page + bookings removed, no auto-refund, irreversible) → **"Delete event"**, danger.

Empty: "No past events yet" / "No upcoming events in this category" / "Create your first event to start taking bookings."

**Private Events panel** (`curated_experiences` CRUD, showcase-only, external links): **"Add private event"**, per-card ActiveToggle/edit/delete. Modal: Title*, Description, Image, External link, Display order, "Active on Private Events page". Footer: Delete (editing), Cancel, **"Save changes"/"Add private event"**.

### EventDetailPage.tsx

`/dashboard/events/{id}`. Header: **"Publish event"** (if draft); **"Cancel event"** (if published/live); **"Edit"**; **"Delete"** (confirm, danger).

**Event info card:** date, venue, pricing, options badges, description/speakers/agenda/photo gallery.
**Stat cards:** Confirmed bookings, Revenue, Capacity (%), Checked in.
**Attendance summary:** attended/no-show/awaiting/guest badges.
**Guest list card:** table with **Check-in** toggle (Check/X, updates `checked_in`/`checked_in_at`/`attendance`) and **"No-show"** button. Empty: "No bookings yet".

Embeds `EventInvitesPanel`, `EventExpensesPanel`, `SponsorsPanel`.

### EventFormPage.tsx

Create/Edit. Actions: **"Save as draft"/"Save changes"**; **"Save &amp; publish"** (create only). Validation: "Title is required"; "Slug is required"; "Start date is required"; numeric fields min 0.

Sections: Basic info (title, slug — hint "Used as the URL: /events/&lt;slug&gt;" —, type, description, cover image), Date &amp; time, Venue, Capacity &amp; pricing (£), Options (Travel included, Accommodation available [+price], Guest list visible, Auto-confirm bookings default true), Agenda (add/remove), Photo gallery (max 24), Speakers (add/remove).

### EventInvitesPanel.tsx

Card "Invite list ({N})" — "Track who you've invited — they move to Confirmed automatically when they book." **"Add invite"**. Tabs Invited/Confirmed/Declined. Row quick actions: "Mark confirmed", "Mark declined", "Remove invite".

**Add invite modal:** kind toggle External guest/Existing member. External: Name, Company, Email (hint "Used to auto-confirm them when they book."). Validation: "Choose a member"/"Enter at least a name or email." Duplicate: "That email is already on this event's invite list."
Remove: confirm "Remove this invite?" (booking, if any, unaffected).

### EventExpensesPanel.tsx

Card "Expenses &amp; P&amp;L ({N})". P&amp;L strip: Revenue, Cost, Profit, Margin. **"Add expense"**.

Modal: Label* ("Add a label"); Amount (£)* ("Set an amount"); Category Select (Uncategorised/Venue/Catering/AV-Production/Talent-Speakers/Staffing/Marketing/Travel/Other). Empty: "No expenses recorded yet" / "Add venue, catering, AV and other costs to see this event's true profit." Remove: confirm "Remove this expense?"

### SponsorsPanel.tsx

Card "Sponsors ({N})" — "{committed} committed". **"Find ideal sponsors"** (Sparkles) → `/dashboard/sponsorship?event_id=`; **"Add sponsor"**.

Two amounts per sponsor: investment (`amount_pence`) and reserved ticket rate (`event_price_pence`). Booking link `{origin}/events/{slug}?s={token}`.

Row actions: Status Select (Proposed/Confirmed/Invoiced/Paid/Declined), **"Copy booking link"**, **"Send invite"** (template picker → `POST /api/admin/sponsors/invite {sponsorship_id, template_id}`), **"Manage"** → `SponsorManageModal`, remove (confirm).

**Add sponsor modal:** kind toggle External/Existing member. Package, Status, Investment (£), Their ticket price (£, must be &gt;0), Showcase slot, Brand alignment. Validation: "Choose a member"/"Add a sponsor"/"Add a package name". Empty: "No sponsors yet" / "Add a sponsor with their investment and a reserved ticket price, then send them a personalised booking link."

### SponsorManageModal.tsx

Modal "Manage — {sponsor}" (lg). "Proposal &amp; ROI report": **"Generate proposal"/"Regenerate proposal"** → `POST /api/admin/sponsors/proposal {sponsorship_id, action:'generate'}`; **"Email to sponsor"** → `{action:'send'}`; **"Generate ROI report"** → `POST /api/admin/sponsors/roi {sponsorship_id}`.

"Sponsor portal": **"Copy portal link"**, **"Open portal"** → `{origin}/sponsor/{token}`.

"Delivery checklist ({N})": add item (label, category, due date, status), status Select per row, remove (confirm), download uploaded file (60s signed URL, `sponsor-assets` bucket). Empty: "No deliverables yet — add branding deadlines, assets required and guest allocation above."

### DriveGalleryPicker — `src/components/admin/DriveGalleryPicker.tsx`

Modal "Google Drive media library" (lg) — read-only Drive browser. Breadcrumb nav → `GET /api/admin/google/drive/list?folderId=`. Select file → `POST /api/admin/google/drive/import {file_id}` (imports into Supabase `gallery` bucket) → returns URL to caller. Empty: "This folder is empty."

### Contracts — `src/components/contracts/*`

**ContractsPanel:** table of `contract_templates`, signature-status badges (Draft/Awaiting signature/Opened/Signed/Declined/Voided/Needs attention) auto-reconciled via `/api/admin/signatures/status` polling. Row actions: Edit → contract editor; Send for signature → `SendContractModal`; View document → `/api/admin/signatures/view?id=`; Refresh status; Duplicate; Delete (confirm). Empty: "No contracts yet" / "Click New contract to draft an agreement or NDA, then send it to a member for signature."

**SendContractModal:** `Send "{name}" for signature` (lg). Member picker, Signer email, Email subject (default `Please sign: {name}`), Message. Validation: "Choose a member to send to"; "The member has no email — add one first"; "An email subject is required." → `POST /api/admin/signatures/send {member_id, contract_template_id, doc_type, title, signer_name, signer_email, subject, message}`. Missing DocuSign consent → **"Grant access"**.

**Contract editor** (`ContractEditorPage`, `ContractCanvas`, `ContractSidebar`, `ContractAiPanel`, `useContractEditor`) — deliberate fork of the email block editor, targeting `contract_templates`. Text blocks get an **"Insert field"** menu: Signature fields (Signature/Initials/Printed name/Date — filled by signer) and Member fields (merge tags filled before sending). Autosaves 2.5s after changes once an id exists. **"Save Draft"/"Save &amp; Exit"**.

### Events — end-to-end workflows

1. **Create &amp; publish:** "Create event" → fill form → "Save as draft" or "Save &amp; publish" → detail page → "Publish event"/"Edit"/"Cancel"/"Delete".
2. **Invite &amp; track guests:** "Add invite" → tabs Invited/Confirmed/Declined (auto-confirm on matching booking); Guest list Check-in/No-show.
3. **Sponsors:** "Add sponsor" → "Copy booking link"/"Send invite" → status Proposed→Confirmed→Invoiced→Paid → "Manage" for checklist/proposal/ROI/portal link.
4. **Costs:** "Add expense" → live Revenue/Cost/Profit/Margin.
5. **Drive photo:** `DriveGalleryPicker` → browse → select → imported, URL returned.
6. **Contract:** editor (AI chat or blocks, "Insert field") → Save → "Send for signature" → DocuSign envelope → status polled through to Signed.

---

## A8. Applications — `src/views/admin/applications/`

### ApplicationsListPage.tsx

Header "Membership applications" — "Prospective members who've submitted the public application form. Review their full profile... then shortlist, reject, or approve. Approving provisions the auth account, sends an invitation email, and adds them to Members." Meta `{total} total · {pending} pending · {shortlisted} shortlisted · {approved} approved`.

**Stat tiles:** Pending (warn if &gt;0), Shortlisted, Approved, Rejected. **Filters:** search; status chips (default Pending). **Rows:** avatar, name+position, email/company/city, submitted date, status Badge, refund badge, tier/cadence/location chips, interest count.

Empty: "No applications yet" / "Applications submitted via the public membership form appear here."; "No matches" / "Try a different filter or clear your search."

### ApplicationDetailModal

Title = applicant name (xl). Sections (conditional): Contact, Identity, Profile (bio/interests), Business, Goals &amp; track, Online presence, Membership preference, How they heard, Internal notes (Textarea, persisted only on action-button click).

Hint banner: "This applicant is already provisioned as a member. Re-approving will refresh their tier and re-send the password-set email." or "Approving provisions an auth account, adds them to Members, and emails them a branded link to set their password and enter the portal. Shortlisting &amp; rejecting are silent — no email is sent."

**Footer buttons** (hidden entirely if rejected):
- **Close**.
- **Delete** (Trash2) — confirm `Delete "{first} {last}"?` (warns member account NOT deleted if already provisioned) → "Delete application", danger.
- **Reject** (XCircle) — confirm `Reject {fullName}?` (Stripe cancel + refund + rejection email if paid) → `POST /api/admin/applications/reject {application_id}`. Toast "Application rejected" or destructive "Refund needs attention".
- **Shortlist** (Tag, hidden once shortlisted/approved) — plain status update, toast "Marked as shortlisted".
- **Approve &amp; create member** (CheckCircle2; "Re-provision member" if already approved) — confirm `Approve {fullName}?` (create auth account, add to Members at tier, email invitation, carry photo/website) → `POST /api/admin/applications/approve {application_id}`. Toast "Member created".
- **Email applicant** (mailto, hidden if rejected).

### Applications — end-to-end workflow

1. Open Applications (default Pending) → search/filter → click row.
2. Review full profile; optionally add internal notes.
3. Decide: **Shortlist** (silent), **Reject** (cancels+refunds Stripe if paid, emails rejection), or **Approve &amp; create member** (provisions auth user + Members row + invitation).
4. Toasts confirm result (refund amount / email-sent state).
5. **Delete** available any time.

---

## A9. Finance — `src/views/admin/finance/FinancePage.tsx`

Header "Finance" — "Revenue, payments, and invoicing". Read-mostly reporting surface aggregating data written elsewhere — no create/edit/delete payment action anywhere on this page.

**KPI cards (6):** Revenue (all-time paid), Outstanding ({N} overdue), Subscriptions (active), MRR, Renewal rate, Concierge GMV. Total revenue = paid payments + sponsorship revenue (confirmed/invoiced/paid) + concierge **margin** (not GMV) + referral revenue + pending-but-paid applications ± refund adjustments.

**"From Xero" card** (only if a spend sync has run): Historic spend pulled, Members with spend, Last synced.

**Revenue by source card:** stacked bar/legend Membership/Events/Sponsorship/Concierge/Referrals. Empty: "No revenue recorded yet."

**Cashflow — last 12 months card:** `CashflowChart` (In/Out/Net); "Net 12m: {currency}". Empty: "No cash movement recorded yet."

**Event P&amp;L table** (only if events have revenue/cost): Event, Revenue, Cost, Profit (warm-red if negative), Margin. Row → `/dashboard/events/{id}`.

**Revenue by member &amp; LTV table:** **"Recompute LTV"** (RefreshCw) → `POST /api/admin/members/recompute-scores` → toast "LTV recomputed — Updated {N} member{s}." Columns: Member (link), Revenue paid (sortable), LTV (sortable, default sort), Xero spend. Top 50, footer: LTV = `members.lifetime_value_pence`.

**Overdue Invoices card** (if any): Member/Description/Amount/Due Date/Method. Row → Payment Details modal.

**Recent Payments card:** Member/Type/Amount/Method/Date/Status. Empty: "No payments recorded yet." Merges real payments + synthesized pending-application rows + synthesized refund ledger rows, cap 15. Row → Payment Details modal.

**Payment Details Modal** (lg, read-only): amount, metadata, description, dates. Single **Close** — no edit/delete, no API calls.

### Finance — end-to-end workflow

1. Open Finance → all data loads via parallel Supabase queries into KPIs, breakdown chart, cashflow chart, Event P&amp;L, member revenue/LTV table, overdue invoices, recent payments.
2. Review KPIs and Xero historic-spend.
3. Inspect Revenue-by-source and 12-month Cashflow.
4. Review Event P&amp;L (click through to event detail).
5. Review Revenue by member &amp; LTV, optionally "Recompute LTV", click member.
6. Check Overdue Invoices and Recent Payments — click any row for read-only Payment Details.

---

## A10. Automations, Bookings, Commissions, Communications, Concierge, Enquiries, Newsletter, Pipeline extras, Reviews, Rewards, Tags, Tasks

### AutomationsPage — `src/views/admin/automations/AutomationsPage.tsx`

Header "Automations". Banner: "Runs daily at {HH}:00 (UK)." — "Use Preview to see exactly who would be emailed without sending anything, then Run now to send. Each person is only emailed once per situation — running again is always safe."

**"Refresh"** → `POST /api/cron/automations?dryRun=true` (also runs on mount). **"Run now"** → confirm "Send automated emails now?" ("This sends real emails to everyone currently due... Anyone already emailed is skipped automatically. Preview first if unsure.") → confirm "Send now" → `POST /api/cron/automations`. Toast "Automations run — {N} sent, {M} failed."

**Per-flow cards:** label, counts, description, item list with badges (would send/sent/failed). Flows: `welcome_journey` (day 2/10/14 onboarding + AI opportunity report), `renewal_cadence` (90/60/30/7-day reminders, final auto-renews or raises retention task), `failed_payment`, `event_reminder`, `post_event_followup`, `guest_nurture`, `invoice_chasing`, `intro_scheduled`, `sponsor_followup` (3/7/14-day chasers on proposed sponsors). Per-flow empty: "Nobody due right now."

### BookingsListPage — `src/views/admin/bookings/BookingsListPage.tsx`

Header "Bookings" — "Every event booking across the club — confirmed, pending, cancelled, and refunded. Click a row to open the event the booking belongs to." Meta `{total} total · {confirmed} confirmed · {pending} pending`.

**Stat tiles:** Total, Confirmed, Pending, Revenue. **Filters:** search; status chips All/Confirmed/Pending/Cancelled/Refunded. **Columns:** Guest (Guest/Checked-in pills), Event (links to event), Status, Method, Amount (0 → **"Complimentary"** pill), Booked, actions.

Row click → `/dashboard/events/{event.id}`. **"Approve"** (pending) → confirm "Approve &amp; charge this booking?" → `POST /api/admin/bookings/decision {booking_id, action:'approve'}`. Toast "Booking approved". **"Reject"** (pending) → confirm "Reject this booking?" (danger) → `{action:'reject'}`. Toast "Booking rejected".

Empty: "No bookings yet" / "Bookings appear here as members pay for events via Stripe." or "No matches".

### CommissionsPage — `src/views/admin/commissions/CommissionsPage.tsx`

Header "Commissions" — "Every commission across introductions, concierge and referrals in one ledger... Receivable... and payable... are kept distinct."

**Stat cards:** Receivable — owed, Receivable — received, Payable — owed to members, Payable — paid out. **Filters:** Source, Direction, Status. **Columns:** Source, Direction, Counterparty, Commission, Date, Status, Actions.

Row click → origin record (`/dashboard/introductions/{id}`, `/dashboard/concierge`, `/dashboard/rewards`). **"Mark paid"/"Mark unpaid"** writes to origin: `introductions.commission_status`+`commission_paid_at`; `concierge_requests.commission_status`+`commission_paid_at`; `reward_referrals.status`.

Empty: "No commissions here" / "Commissions appear once recorded on a won introduction, a concierge request, or a member referral."

### CommunicationsPage — `src/views/admin/communications/CommunicationsPage.tsx`

Admin-only. Header "Communications" — "Member email templates, sends, and engagement". **"New template"** / **"Build with AI"** → editor.

**Stat tiles:** Templates, Drafts, Sent (30d), Open rate. **Templates card** (first 6): Name/Subject/Category/Status/Updated, **"Send"** (disabled on drafts). Empty: "No templates yet" / "Build your first member email with the AI assistant."

**Recent sends card** (last 15): row click → "Send details" modal (Template/Channel/Subject/Body preview/Timeline). Empty: "No sends yet".

### TemplatesListPage — `src/views/admin/communications/TemplatesListPage.tsx`

Admin-only. Header "Email Templates". **"New contract"** / **"New template"**. **Filters:** search + chips All/campaign/automation/transactional + "Contracts" chip (swaps body to `ContractsPanel`).

Row menu (⋮): **"Send to members…"** (`SendTemplateModal`); **"Publish (mark ready)"/"Move to drafts"**; **"Edit"**; **"Duplicate"**; **"Delete"** → confirm "Delete template?" ("Any campaigns or automations using it will need a new template.") → "Delete template".

Empty: "No templates yet" / "Use the AI builder to draft your first email template, or start from scratch."

### EmailLogPage — `src/views/admin/communications/EmailLogPage.tsx`

Header "Sent mail" — "Every email the platform has sent... Open any one to read exactly what went out." Embeds `GmailExtractionsPanel`. Merges `email_log`+`communications`. Search + category chips. **Columns:** Recipient, Subject, Type, Status, When. Row → "Email" modal (To/Type/Subject/Sent/Status/Opened/Clicked/Resend ID/sandboxed iframe of HTML). Read-only. Empty: "No emails sent yet" / "No matches".

### ConciergePage — `src/views/admin/concierge/ConciergePage.tsx`

Header "Concierge" — "Lifestyle requests worked through the pipeline — sourcing, quoting, margin and commission, from enquiry to feedback." **"New request"**.

**Stat cards:** Open, Quoting/booking, Delivered, Commission. **Filters:** Status Select (default "Open (in pipeline)"), Type Select, search.

**Statuses:** Enquiry (`pending`), Assigned, Sourcing, Quote sent (`quoted`), Accepted, Booked, Delivered, Feedback, Declined, Cancelled.

**Modal "New/Edit concierge request":** editing shows read-only "What the member asked for" block. Fields: Member* ("Member required"), Request type, Description, Event/occasion, Location, Dates, Guests, Owner, Priority; "Sourcing &amp; commercials": Status, Supplier, Budget (£), Supplier cost (£), Sale price (£), Quoted to member (£), Commission (£), live Margin readout; Internal notes.

Buttons: Delete (edit only, confirm "Delete this request?"), Cancel, **"Create request"/"Save changes"**. Setting Delivered/Feedback auto-stamps `delivered_at`. Table `concierge_requests`.

Empty: "No concierge requests here" / "Log a member's lifestyle request to start working it through the pipeline."

### EnquiriesListPage — `src/views/admin/enquiries/EnquiriesListPage.tsx`

Header "Enquiries" — "Notes from the public contact form. Read the brief, reply from your own email client — the row is marked replied automatically — and keep a private note for context." Meta `{total} total · {new} new · {replied} replied`.

**Stat tiles:** Total, New, Replied, Closed. **Filters:** search; status buttons (default New); Owner Select.

**Columns:** From (task-link icon if `related_task_id`), Subject (intent badge), Score (ScoreMeter), Source, Owner (inline Select), Received, Status.

**Detail modal:** status/intent badges, contact blocks, Lead score panel (`score_reasons`), Lead enrichment panel, message, "Private notes" (autosave 700ms), timestamps.

**Actions:** **"Reply via email"** modal — Subject (prefilled "Re: Your enquiry to The Club"), Message (prefilled greeting), both required → **"Send reply"** → `POST /api/admin/enquiries/reply {enquiry_id, subject, body}`. Toast "Reply sent" (marks replied automatically).
**"Mark replied"/"Close"/"Reopen"** → direct Supabase update. **"Delete"** → confirm "Delete this enquiry?". **"Enrich"/"Re-enrich"** → `POST /api/admin/enquiries/enrich {enquiryId}` → toast "Enrichment complete — Status: {status}". Owner dropdown → `enquiries.assigned_to`.

Empty: "No new enquiries" / "No enquiries match".

### NewsletterPage — `src/views/admin/newsletter/NewsletterPage.tsx`

Header "Newsletter" — "Subscribers, custom audience lists, and campaigns." Tabs: **Subscribers** (default), **Lists**, **Campaigns**.

### SubscribersTab.tsx

Table over `mailing_list`. Stat tiles Total/Active/Unsubscribed. Search + filter pills (default Active).

**"Export CSV"** — client-side download (`first_name, last_name, email, subscribed_at, unsubscribed_at, source`). **"Add subscriber"** modal: First/Last name, Email — all required → `mailing_list.upsert({...source:'admin', unsubscribed_at:null}, {onConflict:'email'})`. Toast "Subscriber added".

Row actions: Unsubscribe/Re-subscribe; Delete → confirm `Delete {email}?` ("use Unsubscribe instead" to keep on list). Empty: "No active subscribers yet" / "No subscribers match".

### ListsTab.tsx

Grid of `audiences` cards. **"New list"** modal: Name*, Description → **"Create"** → immediately opens the editor (toast "List created — now add recipients"). Delete: confirm `Delete "{name}"?` ("underlying subscribers and members remain").

**Audience editor modal:** sub-tabs Subscribers/Members, search, clickable checkbox rows writing to `audience_members` immediately (no Save button). Empty: "No active subscribers yet."/"No active members yet."/"No matches for that search." **"Done"** closes and refreshes counts.

### CampaignsTab.tsx

Table of `email_campaigns` — Name/Audience/Recipients/Status/Created/View (preview modal).

**"New campaign"** → 3-step wizard: **1. Template** (search `email_templates` where category='campaign' and not draft); **2. Audience** (All active subscribers / custom list / smart segment via `/api/admin/marketing/segments(/preview)`); **3. Review &amp; send** (live merge-tag preview) → **"Send to N recipient(s)"** → `POST /api/admin/campaigns/send {template_id, audience_id|null, segment?}`. Toast "Campaign sent to N recipients" or "Draft saved (SMTP not configured yet)".

Empty: "No campaigns yet" / "Create your first campaign — pick a template from /communications and send to a list."

### ReviewsAdminPage — `src/views/admin/reviews/ReviewsAdminPage.tsx`

Header "Reviews" — "submitted via /share-your-experience. Approve to publish to the public /reviews page. The active toggle hides an approved review without rejecting it." Meta `{total} total · {pending} pending · {approved} approved`.

**Stat tiles:** Total/Pending/Approved/Rejected. **Filters:** search + status pills (default Pending). **Columns:** From, Event, Review, Received, Status, Active toggle.

**Detail modal:** contact block, full review, "Private notes" (autosave), moderation trail. Buttons: **"Approve &amp; publish"** (sets approved+`approved_at`+`is_active:true`), **"Reject"**, **"Hide from public"/"Show on public"**, **"Return to pending"**, **"Reply via email"** (mailto), **"Delete"** → confirm "Delete this review?" ("To hide without deleting, switch it to inactive instead.").

All status/active changes call `POST /api/admin/revalidate {paths:['/reviews']}`. Empty: "No reviews waiting" / "No reviews match".

### RewardsPage — `src/views/admin/rewards/RewardsPage.tsx`

Header "Rewards &amp; Benefits" — "Partner directory, member offers, redemption tracking and the referral commission ledger — the whole benefits programme in one place." Header button contextual: **"New partner"**/**"New referral"**.

**Stat tiles:** Partners, Active offers, Claims, Redeemed, Commission owed. **Tabs:** "Partners &amp; offers", "Claims", "Referrals".

**Partners &amp; offers:** table + "Most popular partners". Partner modal: Name*, Category, Description, Logo, Website URL, Contact name/email/phone, Active/Public toggles. Delete confirm: "Delete this partner?" ("partner and all its offers are permanently removed").

**Offers drill-down:** "Back to partners", **"New offer"**. Offer modal: Title*, Summary, Details, Member benefit, Redemption process, Booking URL, Discount code, Valid until, Active toggle. Delete confirm: "Delete this offer?"

**Claims tab:** table with inline Status Select (Claimed/Redeemed/Cancelled) + **"Edit value"**. Modal: Status, Value £, Notes (Redeemed auto-stamps `redeemed_at`). Empty: "No claims yet".

**Referrals tab:** tiles Commission owed/paid; table. Modal: Referring member* ("Member required"), Referred name, Description, Revenue £, Commission £, Status. Delete confirm: "Delete this referral?" Empty: "No referrals logged" / "Record a member referral to track revenue and the commission owed back to them."

### TagsPage — `src/views/admin/tags/TagsPage.tsx`

Header "Tags" — "The vocabulary that powers matchmaking. Members are tagged by Industry (what they do), Looking for (what they want) and Interest. The matcher pairs one member's "Looking for" with another's "Industry"."

**"Add a tag" card:** name input (Enter submits) + category Select (Industry/Looking for/Interest/Service) + **"Add"** → `tags.insert`. Duplicate: "That tag already exists in this category." Tip: "for a match, a 'Looking for' tag should mirror an 'Industry' tag."

**Category groups:** Industry, Looking for (`need`), Interest, Service — each with subtitle. Per-tag: inline rename (Enter/Escape), delete → confirm `Delete "{name}"?` ("removed from every member it's assigned to") — confirm "Delete tag" — deletes `member_tags` rows first, then the `tags` row.

Empty per-category: "No tags in this category yet."; global: "No tags yet — add your first above."

### TasksPage — `src/views/admin/tasks/TasksPage.tsx`

Header "Tasks" — "Sales, events and admin tasks — with an owner, a deadline and a clear status. If it isn't in the system, it doesn't exist." **"New task"**.

**Stat tiles:** Open, In progress, Overdue, Done. **Filters:** Status (default "Open (not done)"), Category, search. **Columns:** Task, Category, Owner, Due (warm if overdue), Priority, Status (inline Select — Done stamps `completed_at`).

**Modal:** Title* ("Title required"), Description, Owner, Due date, Category, Priority, Status. Edit mode adds a comments thread (`task_comments`) — input + **"Post"** (Enter also posts). Delete → confirm "Delete this task?" ("task and all its comments are permanently removed"). Buttons: Cancel, **"Create task"/"Save changes"**.

Empty: "No tasks here" / "Create a task to start tracking work — every commitment with an owner and a deadline."

---

## A11. Website CMS — `src/views/admin/website/`

Shared patterns: React Hook Form + Zod; drag-reorder persists `display_order` via `Promise.all`; deletes go through `useConfirm()`; several pages call `POST /api/admin/revalidate {paths:[...]}` after mutations.

### HeroSlidesPage.tsx

Header "Page heroes", meta "{N} pages · {N} customised". Fixed list of 12 public pages (Homepage, About, Memberships, Events, Gallery, Private Events, Contact, Reviews, Share Your Experience, Membership Application, Club Rules, Privacy Policy). Rows: thumbnail, page label, "Using default"/"Hidden" badges, headline/lede preview, ActiveToggle, buttons.

**"Customise"/"Edit"** → modal "{Page label} hero": Live checkbox, Background media (`MediaPicker`, image/video, bucket `heroes`), Alt text, Eyebrow, Headline, Lede, CTA Primary/Secondary label+link. Zod: media required — "Please add the media (upload or paste a URL) before saving." Save upserts `hero_slides` (one row per page slug, `display_order:0`) + revalidate. Toast "Hero saved".

**Reset (trash)** → confirm `Reset {label} hero?` ("Reset to default") → deletes the row, page falls back to hardcoded default. Toast "Hero reset".

### MembershipPlansPage.tsx

Header "Membership plans". Drag-sortable: image, name, "Featured" badge, slug, prices, tier tag, lede, feature count, ActiveToggle, Edit/Delete.

**Modal:** Name*, Slug* (`^[a-z0-9-]+$`, used in `/membership-application?tier=`), Lede, Contract terms, Annual price (£→pence), Monthly price (£→pence), Features (dynamic list, **"Add feature"** + remove; empty "No features yet — the public card will show no bullet list."), Card image (bucket `content`, folder `memberships`, 3:4), Internal tier classification (None/Tier 1/2/3), Monthly intro quota (int ≥ −1, −1=unlimited), Display order, Active, Featured.

Delete confirm: `Delete "{name}"?` ("removed from public page and application tier picker; existing members unaffected"). Empty: "No membership plans yet" / "Add at least one plan so applicants have something to pick..."

### MembershipBenefitsPage.tsx

Locked set of exactly **9** cards (no Add/Delete, RLS-enforced). Rows: Roman-numeral chip, thumbnail, title, body preview, ActiveToggle (`is_visible`), Edit.

Modal `Edit card {numeral} · {title}`: Numeral* (≤8 chars), Title* (≤80), Body (≥20 chars), Image (bucket `content`, folder `membership-benefits`, 4:3). Toast "Saved — Card {numeral} updated." Revalidates `/memberships`. Empty (migration missing): "No benefit cards found." / "Run the `20260526_membership_benefits.sql` migration to seed the nine cards."

### MembershipComparisonPage.tsx

Header "Membership comparison". Columns Feature | Individual | Business | Corporate. Drag-sortable rows with check/minus icons, ActiveToggle, Edit/Delete.

Modal: Feature label*, "Included for" (3 checkboxes), Display order, Active. Delete confirm: "Delete this row?" Revalidates `/memberships`. Empty: "No comparison rows yet" / "Add rows so the comparison table is editable here..."

### GalleriesListPage.tsx

Header "Galleries", meta "{N} galler(y/ies) total · {N} published". Category tabs (All, Private Dining, Members Event, Curated Experience, Sponsored Event, Business Enrichment). Card grid: cover, "Draft" badge, category pill, title, venue, event date, photo count.

**"Create gallery"** → `/dashboard/website/galleries/new`. Card click → detail. Empty: "No galleries yet"/"No galleries in this category" / "Create a gallery to showcase event photos publicly." + **"Create first gallery"**.

### GalleryFormPage.tsx

Create/edit. Cards: Basic Information (Title, Slug auto-slugified on create, Category, Cover image bucket `gallery`/`covers`, 4:3), Event Details (Event Date, Venue, Location), Publishing (Published checkbox).

Buttons: **"Save as draft"/"Save changes"**, **"Save &amp; publish"** (create mode, forces `is_published:true`). Validation: title and slug required.

### GalleryDetailPage.tsx

Info card + 4-stat grid. Buttons: Publish/Unpublish, Edit, Delete → confirm "Delete gallery?" (deletes `gallery_photos` then `galleries`); **"Add Photo"**; per-photo Edit/Delete (confirm "Delete photo?").

Photo modal: Photo (bucket `gallery`, folder `photos/{id}`, required, 4:3), Caption, Display Order. Empty (photos): "No photos yet. Add your first photo above."

### TestimonialsPage.tsx

Header notes: "the homepage section is hidden entirely — no placeholder quotes are ever shown to the public" when all removed/inactive. Drag-sortable: initials avatar, name, title/company, quote preview, ActiveToggle, Edit/Delete.

Modal: Person name*, Title/role, Company, Quote*, "Active on the homepage". Delete confirm: "Delete testimonial?" Revalidates `/`. Empty: "No testimonials yet" / "Member quotes appear on the homepage and add credibility to the brand."

### PartnersPage.tsx

Header "Partners", meta "{N} partner(s) · {N} visible". Drag-sortable: logo (3:1), name, website link, ActiveToggle (Visible/Hidden), Edit/Delete.

Modal: Partner name*, Logo* (bucket `logos`, folder `partners`, 3:1), Website URL, "Visible on the homepage". Delete confirm: "Delete partner?" Empty: "No partners yet" / "Add sponsor or partner logos to display them on the homepage."

### VideosPage.tsx

Header "Video gallery". Page filter chips (All pages / About Sarah / Private Event Services). Drag-sortable with derived YouTube thumbnails.

Modal: Title*, YouTube URL* (validates `?v=`/`youtu.be/`/`/embed/` forms), Page Select, Active. Delete confirm: "Delete video?" Empty: "No videos yet" / "Add YouTube URLs to feature videos on the About or Private Event Services page."

### ExperiencesPage.tsx

Header "Curated experiences" (Private Event Services cards). Drag-sortable: thumbnail, title, description, link URL, ActiveToggle, Edit/Delete.

Modal: Title*, Description, Image (bucket `content`, folder `experiences`, 4:3), Link URL, "Active on Private Event Services". Delete confirm: "Delete experience?" Empty: "No experiences yet" / "Add curated experiences to feature on the Private Event Services page."

### DocumentsPage.tsx

Header "Documents", meta "{N} document(s) · {N} active". Flat list: icon, title, extension badge, slug, page slug, added date, **"Open"** (external link), ActiveToggle, Edit/Delete.

Modal: Title*, Slug* (auto-slugified on create), File (`FileUpload`, bucket `documents`), Page slug (optional), Active. Delete confirm: "Delete document?" Empty: "No documents yet" / "Upload brochures, PDFs, or any file resources to share publicly."

### InstagramAdminPage.tsx

Header "Instagram". **Profile card:** Avatar (bucket `content`, folder `instagram/avatar`, 1:1 "rendered as a circle"), Display name, Handle, Followers, Profile URL, Bio, "Show the Instagram chapter on the public site" checkbox, **"Open profile"**, **"Save profile"** → upserts single `instagram_settings` row + revalidates `/` and `/about`. Toast "Profile saved".

**Tiles section is disabled in code** (`{false &amp;&amp; ...}`) — would manage `instagram_posts` (only first six active tiles render publicly).

---

## A12. Settings &amp; Auth — `src/views/admin/settings/`, `src/views/auth/`

### SettingsPage.tsx

Header "Settings" — "Manage your club details, membership tiers, integrations, and team." Sections:

1. **Club Details** — Name, Contact Email, Phone, Website URL, Description + **"Save Changes"** ("Changes saved" for 2s). **Local component state only — does not persist anywhere.**
2. **Membership Plans** (read-only summary) — **"Manage plans"** → `/dashboard/website/memberships`.
3. **Tags** → `TagsManager`.
4. **Automation Send Time** → `AutomationTimeSettings`.
5. **Enquiry Routing** → `EnquiryRoutingSettings`.
6. **Email Sync** → `EmailSyncSettings`.
7. **Media Folders** → `MediaFoldersSettings`.
8. **Integrations** — Stripe/GoCardless/Xero/Resend status cards (`GET /api/admin/integrations/status`). Xero: **"Sync contacts"**, **"Sync invoices"**, **"Sync spend"**, **"Disconnect"**, or **"Connect"** (OAuth via `/api/admin/xero/connect`).
9. **Team** — **"Add Member"** (unwired) + hardcoded roster (Sarah Restrick, Leanne — both Admin).

### AutomationTimeSettings.tsx

Card "Automation Send Time" — Field "Daily send time" (24 hourly options), note "UK time (Europe/London)", **"Save"** (disabled until changed) → `app_settings.upsert({key:'daily_send_hour', value})`. Default hour 7.

### EnquiryRoutingSettings.tsx

Card "Enquiry Routing" — one owner dropdown per intent (Membership, Upcoming event, Private event, Concierge, Sponsorship, Venue/space hire, General enquiry, Press/media); default "First admin (default)". **"Save"** → `app_settings.upsert({key:'enquiry_routing', value})`.

### EmailSyncSettings.tsx

Card "Email Sync" — everything defaults OFF. Master toggle **"Enable email sync"**; per-inbox On/Off toggles; "Sync history (months)" (1–120); "Noise filter" toggle; **"Save"** → `GET`/`PUT /api/admin/google/gmail/config`.

### MediaFoldersSettings.tsx

Card "Media Folders". States: no owner → "Media owner" Select + **"Set media owner"** → `PUT /api/admin/google/drive/folders {ownerProfileId}`; owner set, non-owner viewing → informational text; owner viewing self → approved-folders chip list + browser (`GET /api/admin/google/drive/list?folderId=`) with **"Approve"/"Remove"** per folder + **"Save approved folders"** → `PUT .../folders {allowedFolders}`.

### TagsManager.tsx

Card "Tags". Add row: name input (Enter submits) + category Select + **"Add Tag"** → `tags.insert`. Duplicate (PG 23505): "A tag with that name already exists." Per-pill inline edit/delete — Delete uses **native `window.confirm`**: `Delete the tag "{name}"? It will be removed from every member who has it. This cannot be undone.`

### LoginPage — `src/views/auth/LoginPage.tsx`

Two doors: `role="member"` → `/login`; `role="admin"` → `/admin/login`. Fields: "Email Address", "Password" (visibility toggle). Submit: **"Sign In"**. Dev quick-login box (non-production) with hardcoded creds.

Validation (Zod): "Please enter a valid email address"; "Password must be at least 6 characters". Role-door mismatch signs out with an explanatory message; membership-status banners via `?reason=` (`membership_cancelled`/`membership_expired`/`no_membership`).

### SetPasswordPage — `src/views/auth/SetPasswordPage.tsx`

`/set-password` — lands from the Supabase invitation email. States: checking → ready (fields "New password"/"Confirm password", button **"Set password &amp; enter"**) → done (redirects to `/portal` after 1.5s). Validation: min 8 chars + letter + number + match. Guard: session email must match invite email.

---

## A13. Member Portal — `src/views/portal/`

### PortalDashboard.tsx

"Welcome back, {firstName}." KPI tiles: Upcoming Events, Introductions Remaining (`N/quota`), Intros Made This Month. Sections: "Upcoming evenings." ("View all" → `/portal/events`), "Introductions." ("View all" → `/portal/introductions`), "Curated for you." (up to 3 unbooked events), "In good standing." (Tier/Type/Renewal/Quota), "In the room." (`/portal/network`), "Recently joined." Optional Stripe-setup card + "Next charge" card. Read-only.

### PortalEventsPage.tsx

"The Calendar" — card grid of published/live future events, type badge, seats remaining, price. Card → `/portal/events/{id}`. Empty: "No upcoming evenings." / "Check back soon — the team is curating the next round."

### PortalEventDetailPage.tsx

Booking card states: already booked → **"View confirmation"**; non-member → **"Open admin members"**; sold out → disabled **"Fully booked"**; otherwise **"Bring a guest"** (reveals required guest name) + **"Add accommodation"** checkboxes then **"Reserve seat"**/**"Book · £X"**.

£0 → direct `bookings` insert (`pending` if `auto_confirm===false`, else `confirmed`). Paid → `POST /api/events/book {event_id, bring_guest, guest_name, add_accommodation}` → Stripe Checkout URL or held booking id.

### PortalBookingConfirmationPage.tsx

"Your request is in."/"Your seat is held." QR check-in pass (`/checkin/{bookingId}`) for confirmed bookings. **"Add to calendar"** (.ics download, client-side), **"Browse more events"**. Syncs via `POST /api/events/sync {session_id}` then polls up to 5×.

### PortalConciergePage.tsx

"Concierge." New-request form (type Select, occasion, "Tell us more"*, location, dates, guests, budget) → **"Send request"** → inserts `concierge_requests` `{status:'pending'}`. "Where things stand." — own requests with a coarse member-facing status. Empty: "No requests yet" / "When you make a request, you'll be able to follow its status here."

### PortalIntroductionsPage.tsx

"Introductions." Filter chips All/Requested/Active/Past. Respond block (own side pending): note textarea + **"Yes, introduce us"/"No, thank you"** → `POST /api/portal/introductions/respond {introduction_id, response, note}`. Visibility rule: a member sees an intro only once their own side's email has been sent, or it's their own pending "suggested" request. Empty: "No introductions yet." / "We'll match you with members who share your interests and ambitions."

### PortalNetworkPage.tsx

"The Network." Search + Industry/Looking-For chips. Profile modal with **"Request introduction"** (or "Requested — with The Club for review."). Request modal: "Reason for introduction"* + "Desired outcome" → **"Send request to The Club"** → `POST /api/portal/introductions/request {target_member_id, reason, desired_outcome}`. Duplicate: "An introduction with this member is already in progress." Empty: "No members match your search."

### PortalProfilePage.tsx

"Profile." Sections: identity (read-only), "Your details.", "Company.", "Company detail.", "Who you'd like to meet.", "What you're working towards.", "Tags &amp; interests." **"Save profile"** ("Saved" 3s). Validation: only First/Last name required. Prefill fallback from most recent `membership_applications` row matched by email. Writes `profiles` + `members` + `member_tags` (delete-all + re-insert).

### PortalRewardsPage.tsx

"Your privileges." Renders `DigitalCard`. Partner offers grouped by category — **"Claim this offer"** → `reward_claims.insert({member_id, offer_id, status:'claimed'})`; discount code revealed only after claiming. "What you've claimed." history. Empty: "No offers just yet"; "Nothing claimed yet".

### PortalBillingPage.tsx

"Billing." Current standing (Status/Plan/Amount incl. VAT/Next billing). **"Set up subscription"** (no sub) or **"Manage billing"** (has sub) → Supabase Edge Functions `subscription-checkout`/`billing-portal` → Stripe redirect. Reps (`parent_member_id`) see no billing buttons: "Billing for your membership is handled by your organisation's primary account." "Payments." table (up to 20 rows, type='membership'). Empty: "No membership payments yet."

---

## A14. Staff Views — `src/views/staff/`

### StaffHandoverPanel.tsx

"Daily handover" — 4 textareas ("What I completed today", "What I'm working on tomorrow", "What's blocked", "Support needed"). **"Submit handover"/"Update handover"** (validates ≥1 non-empty field) → `daily_handovers.upsert({...}, {onConflict:'staff_id,handover_date'})`. Toast "Handover saved".

### StaffScorecardPanel.tsx

"My scorecard" — Badge "{met}/{total} met · {score}%". Per-target cards with source label (Manual/Tasks completed (auto)/Hours logged (auto)), status badge, progress bar. Manual targets: **"My actual"** input, saves on blur/Enter. "Friday summary" block when generated. Empty: "No targets set for this week" / "Your manager sets weekly targets — check back once they're added."

### StaffSopPanel.tsx

"Playbook" — search + category-grouped accordion (single-open). Read-only, `sops` where `status='published'`. Empty: "No procedures have been published yet. Check back soon." / "Nothing matches your search."

### StaffTasksPage.tsx

"My tasks" — KPI cards Open/Overdue/Done. Filter (default "Open (not done)"). Task modal: Status Select (immediate save), Outcome textarea + **"Save outcome"** (independent of status), `TaskTimeLog` (Start timer/Stop &amp; save, manual entry, per-entry delete), `TaskCollab` (attachments/comments/activity — see A5). Empty: "Nothing to do here" / "You have no tasks in this view."

**Workflow:** filter → open task → move status along (Not started → In progress → [Blocked] → Done) → log time (timer or manual) → collaborate (comments/attachments) → record Outcome when finished.

---

## Cross-cutting notes for the help assistant

- **Deletes** in admin route through `useConfirm()` with explicit "This cannot be undone." — exceptions: `TagsManager` (native `window.confirm`) and staff task modal's per-row time-entry/attachment deletes (no confirmation).
- **Reorderable lists** (website CMS) persist order by writing `display_order` to every row after a drag — no dedicated reorder endpoint.
- **ISR cache flushes**: Hero Slides, Instagram, Membership Benefits, Membership Comparison, Testimonials, Reviews call `POST /api/admin/revalidate {paths:[...]}` after mutations.
- **Locked sets**: Membership Benefits fixed at exactly 9 cards; Hero Slides fixed at 12 pages — both omit Add/Delete, rely on RLS. Deleting a hero row reverts to hardcoded default rather than blanking the page.
- **Money** is stored in pence everywhere; pound inputs parsed leniently (strip `£`, commas, whitespace).
- **Human-in-the-loop gates**: Sponsorship outreach requires explicit "Approve" then "Send" (no automated send path); Automations distinguish "Preview"/"Refresh" (dry run) from "Run now" (real send, idempotent).
- **Two non-functional settings surfaces**: SettingsPage "Club Details" saves only to local state; Instagram "Tiles" manager is disabled behind `{false &amp;&amp; ...}` in code.
- **Key API routes**: `/api/cron/automations`, `/api/admin/bookings/decision`, `/api/admin/chief-of-staff/report`, `/api/admin/enquiries/reply|enrich`, `/api/admin/campaigns/send`, `/api/admin/marketing/{campaigns,generate,assets,library,segments,templates,voices,graphics}`, `/api/admin/sponsorship/{match,prospects,decision-makers,convert,outreach,outreach/draft,outreach/send,deck/parse}`, `/api/admin/sponsors/{invite,proposal,roi}`, `/api/admin/introductions/{create,send,reject,generate-suggestions,why}`, `/api/admin/members/{create,import,cancel,delete,enrich,recompute-scores,resend-invite,add-rep,suggest-tags}`, `/api/admin/applications/{approve,reject}`, `/api/admin/signatures/{send,status,view}`, `/api/admin/whatsapp/send`, `/api/admin/inbox/{mailboxes,threads,thread,access}`, `/api/admin/team/{create,resend-invite}`, `/api/admin/scorecards/summary`, `/api/admin/handover/report`, `/api/admin/revalidate`, `/api/admin/integrations/status`, `/api/admin/xero/*`, `/api/admin/google/{gmail,drive}/*`, `/api/events/{book,sync}`, `/api/portal/introductions/{request,respond}`, `/api/communications/send-template`, `/api/templates/{ai-generate,send-test}`, plus Supabase Edge Functions `subscription-checkout` and `billing-portal`.

---

# PART B — SHARED COMPONENTS (`src/components/`)

## B0. Scope note on the website layer

Two parallel design systems coexist under `src/components/website/`:

- **`website/night/`** — the live, actively-used design system for the current public marketing site (`src/app/(public)/*`). "Midnight + Bronze" editorial palette.
- **`website/*.tsx` (top level), `website/home/`, `website/events/`** — a legacy "cream + gold" design system, **mostly dead code**, superseded by `night/`. Confirmed unused anywhere in `src/app`: `CustomCursor.tsx`, `Footer.tsx`, `Header.tsx`, `LoadingScreen.tsx`, `Logo.tsx`, `MenuOverlay.tsx`, `StickyCTA.tsx`, and the entire `home/` and `events/` subdirectories. Only `MagneticButton.tsx`, `Resources.tsx`, `ThemeContext.tsx`, `SmoothScrolling.tsx`, `home/useReveal.ts` / `usePageHero.ts` are still consumed — only by three not-yet-migrated pages: `(public)/private-event-services`, `(public)/gallery`, `(public)/gallery/[slug]`.
- Within `night/`, a few components are also dead scaffolding, never wired into a page: `effects/BentoGrid.tsx`, `effects/StickyScrollReveal.tsx`, `home/NightSequence.tsx`, `home/PressMarquee.tsx`, `gallery/NightGalleryDetail.tsx`.

**For new work: point at `website/night/*`, never the legacy `website/*` top-level files.**

## B1. `src/components/ui/` — house primitives

All import `cn` from `@/lib/utils`; theme via CSS variables (`bg-surface`, `text-text`, `bg-gold`, etc — Tailwind v4 tokens from `globals.css`). Hand-built, don't wrap `ui-shadcn/`.

| File | What it is | Key props | Used by |
|---|---|---|---|
| `Button.tsx` | The house button | `variant: primary\|secondary\|ghost\|danger`, `size: sm\|md\|lg`, `loading`, `icon` | Nearly all admin views |
| `Input.tsx` | House text input | `label, error, hint, prefix, suffix` | Nearly all admin forms |
| `Textarea.tsx` | House textarea | `label, error, hint` | Admin forms |
| `Card.tsx` | `Card`/`CardHeader`/`CardTitle`/`CardContent` compound | `CardTitle.as?: h1-h4` | Nearly every admin panel |
| `Badge.tsx` | Status pill, 5 variants | `variant: active\|upcoming\|draft\|urgent\|info`, `dot` | Widely used |
| `StatCard.tsx` | KPI tile | `label, value, changeText, changeType` | Dashboards |
| `Table.tsx` | `Table/TableHeader/TableBody/TableRow/TableHead/TableCell` | — | All admin list pages |
| `Modal.tsx` | Custom (non-Radix) centred modal, escape-to-close, scroll-lock | `open, onClose, title, size: sm\|md\|lg\|xl` | ~40+ admin/portal call sites |
| `Select.tsx` | Custom absolute-positioned select (portal, keyboard nav) | `options, value, placeholder, error, hint` | Forms not needing Radix |
| `SelectMenu.tsx` | Radix-based portaled select — safer inside scrolling modals/tables | `value, onValueChange, options, size` | Tables/modals |
| `Avatar.tsx` | Circular avatar, image or initials | `src, name, size` | Member/staff UI |
| `DateField.tsx` | Radix-Popover date-only picker (date-fns) | `value (yyyy-MM-dd), onChange, label` | Forms |
| `DateTimeField.tsx` | Custom date+time picker | `value (datetime-local), onChange, dateOnly, min` | Event/booking forms |
| `FileUpload.tsx` | Drag/drop non-image upload → Supabase Storage | `value, onChange, bucket, maxMB, accept` | Document panels |
| `ImageUpload.tsx` | Drag/drop image upload + Drive import via `DriveGalleryPicker` | `value, onChange, bucket, aspect, maxMB` | CMS forms |
| `MultiImageUpload.tsx` | Ordered multi-image uploader | `value: string[], onChange, maxCount` | Gallery/event photo sets |
| `MediaPicker.tsx` | Universal image/video picker (Upload/URL/Drive tabs) | `value, onChange, mediaType, bucket, lockedToType` | Hero/CMS media |
| `CashflowChart.tsx` | Themed Recharts grouped bar chart | `data: CashflowBucket[]` | Finance dashboard |
| `ThemeToggle.tsx` | Day/night toggle | `variant: pill\|icon` | Admin sidebar, public header, portal |
| `chat/index.tsx` | `MessageScroller`, `Message`, `Bubble` (gold/ivory) | `side: inbound\|outbound, footer` | WhatsApp inbox |
| `index.ts` | Barrel export | — | Convenience import |

## B2. `src/components/ui-shadcn/` — raw shadcn primitives

Standard shadcn/Radix wrappers. Usage is narrow — almost exclusively the contracts/templates editor UI, plus `Toaster` mounted globally.

| File | Consumers |
|---|---|
| `button.tsx` | 10 files — contracts/templates editor chrome |
| `input.tsx` | 6 files (editor family) |
| `label.tsx` | 4 files |
| `select.tsx` | 5 files (`ContractSidebar`, `SendTemplateModal`, `BlockProperties`, `LeftSidebar`, `PreviewSlideout`) |
| `dialog.tsx` | 2 files (`SendTemplateModal`, `PreviewModal`) |
| `scroll-area.tsx` | 2 files |
| `popover.tsx` | 1 file (`MergeTagDropdown`) |
| `badge.tsx` | 1 file (`MergeTagDropdown`) |
| `switch.tsx`, `slider.tsx`, `textarea.tsx` | 1 file each (`BlockProperties`) |
| `toaster.tsx` | 3 root layouts — global toast host |
| `alert-dialog.tsx`, `alert.tsx`, `checkbox.tsx`, `collapsible.tsx`, `dropdown-menu.tsx`, `separator.tsx`, `skeleton.tsx`, `tabs.tsx`, `tooltip.tsx` | **0 consumers — unused dead code** |

No `components.json` — these were hand-copied in.

## B3. Admin components (`src/components/admin/`, `src/components/accountability/`)

| File | What it is | Used by |
|---|---|---|
| `ActiveToggle.tsx` | Optimistic active/inactive pill, reverts on throw | 14 admin list pages |
| `AdminEmptyState.tsx` | Standard "zero rows" empty state | 39 admin pages |
| `AdminPageHeader.tsx` | Standard page header (breadcrumbs/back/title/description/meta/actions) | 49 admin pages |
| `ConfirmDialog.tsx` | `useConfirm()` hook + provider — Promise-based `window.confirm` replacement, tone `danger\|warning\|neutral` | Mounted once in `(admin)/layout.tsx`; used in 41 files |
| `DriveGalleryPicker.tsx` | Google Drive media browser → imports into Supabase `gallery` bucket | `ImageUpload`, `MediaPicker` |
| `GmailExtractionsPanel.tsx` | "Detected from email" AI-surfaced contact/intro suggestions | `EmailLogPage` |
| `IntroOutcomeForm.tsx` | Shared commercial-outcome form for an introduction | `IntroductionDetailPage`, `MemberMatchesPanel` |
| `MemberRecommendationsPanel.tsx` | Self-fetching recommend-only panel | `MemberDetailPage` |
| `MemberRoiPanel.tsx` | Self-fetching commercial ROI rollup | `MemberDetailPage` |
| `MemberScoresPanel.tsx` | Relationship score meters + recompute | `MemberDetailPage` |
| `SortableList.tsx` | Generic drag-to-reorder wrapper (`@hello-pangea/dnd`) + `DragHandle` | 7 website content list pages |
| `Thumbnail.tsx` | Small image thumbnail w/ "no image" placeholder | 8 admin list pages |
| `TopProgressBar.tsx` | `useProgress()` hook + provider — gold top-of-viewport loading bar | `(admin)/layout.tsx`, plus `SendTemplateModal`, `EmailEditorPage`, `ApplicationsListPage` |
| `accountability/TaskCollab.tsx` | Comments + attachments + activity for one accountability task | `AccountabilityTasksPage`, `StaffTasksPage` |
| `accountability/TaskTimeLog.tsx` | Per-task time log — manual entry + start/stop timer | `StaffTasksPage` |
| `AuthHashRedirect.tsx` (root of `components/`) | Forwards a stray Supabase auth-token URL hash to `/set-password` | Root `layout.tsx` |

## B4. Portal components (`src/components/portal/`)

| File | What it is | Used by |
|---|---|---|
| `DigitalCard.tsx` | "Black card" membership card visual | `PortalRewardsPage` |
| `PortalChrome.tsx` | Portal's own "ui/" — night-palette primitives w/ `day:` variants: `PortalPageHeader`, `PortalCard`, `PortalSectionTitle`, `PortalBadge`, `PortalEmptyState`, `PortalLoading`, `PortalStatTile`, `PortalButton`, `PortalField`/`PortalInput`/`PortalTextarea`, `PortalModal` | Every `(portal)/portal/*` page (10 pages) |
| `PortalSelect.tsx` | Headless themed dropdown, RHF-`Controller`-friendly | `PortalConciergePage` |

`PortalChrome` is effectively the portal's own component kit — new portal work should use it rather than `ui/` directly.

## B5. Contracts editor (`src/components/contracts/`)

| File | What it is |
|---|---|
| `ContractsPanel.tsx` | Saved-contracts list, live DocuSign status polling, row actions edit/send/view/refresh/duplicate/delete |
| `SendContractModal.tsx` | Send-for-signature modal → `/api/admin/signatures/send` |
| `editor/useContractEditor.ts` | Editor state hook against `contract_templates` (parallel copy of `useEmailEditor`) |
| `editor/ContractEditorPage.tsx` | Full-screen builder shell (uses `ui-shadcn`, not house `ui/`) |
| `editor/ContractSidebar.tsx` | Sidebar reusing `templates/editor/BlockLibrary` and `BlockProperties` unchanged |
| `editor/ContractCanvas.tsx` | Fork of email `EditorCanvas` + "Insert field" menu (signature/initials/date tokens) |
| `editor/ContractAiPanel.tsx` | AI drafting chat, persists to `contract_ai_chats`/`contract_ai_messages`, `/api/contracts/ai-generate` |

Deliberate parallel fork of the templates/email editor ("so the email editor is left untouched").

## B6. Templates (email) editor (`src/components/templates/`)

| File | What it is |
|---|---|
| `SendTemplateModal.tsx` | Send-template modal, dry-run preview then send via `/api/communications/send-template` |
| `editor/EmailEditorPage.tsx` | Full-screen email builder shell |
| `editor/LeftSidebar.tsx` | Sidebar — settings + `BlockLibrary`/`BlockProperties` |
| `editor/BlockLibrary.tsx` | 10 addable block types |
| `editor/BlockProperties.tsx` | Per-block-type property inspector |
| `editor/EditorCanvas.tsx` | Drag/drop canvas rendering live HTML |
| `editor/AiPromptPanel.tsx` | AI drafting chat, attachments, event-pick suggestions |
| `editor/MergeTagDropdown.tsx` | Searchable merge-tag inserter — **unused/orphaned**, not wired into any page |
| `editor/PreviewModal.tsx` | Full email preview, desktop/mobile toggle |
| `editor/PreviewSlideout.tsx` | Slide-out preview + "TEST AS" persona + send-test |

## B7. SOPs (`src/components/sops/RichText.tsx`)

- **`RichTextRenderer`** — sanitized HTML render (DOMPurify) with shared prose styling. Props: `{html, className}`.
- **`RichTextEditor`** — `contentEditable` editor w/ formatting toolbar. Props: `{value, onChange, placeholder}`.

Used by `SopLibraryPage.tsx` and `StaffSopPanel.tsx`.

## B8. Chat (`src/components/ui/chat/index.tsx`)

`MessageScroller`, `Message`, `Bubble` — gold/ivory palette, used for WhatsApp inbox thread UI. Distinct from the night-palette inline reimplementation inside `night/ConciergeWidget.tsx` (which deliberately inlines its own slim equivalents rather than importing these).

## B9. Website components

### 9a. Legacy (`website/*.tsx`, `home/`, `events/`) — mostly dead, see B0
Still-used remnants: `MagneticButton.tsx` (GSAP magnetic-hover wrapper), `Resources.tsx` (public "downloads" section by `page_slug`), `ThemeContext.tsx` (a **second, separate** theme system — `'evening'|'day'` modes, static `themeColors` object, distinct from the real `@/providers/ThemeProvider`), `SmoothScrolling.tsx` (Lenis smooth scroll, disabled on `/dashboard`/`/portal`/`/login`), `home/useReveal.ts` (GSAP ScrollTrigger reveal hook), `usePageHero.ts` (Supabase hook for active hero slide).

### 9b. `website/night/` — the live design system
All use `cn` + ivory/bronze/ink tokens, generally read `useTheme` from `@/providers/ThemeProvider`.

**Top level:** `NightHeader.tsx` (public nav), `NightFooter.tsx`, `ConciergeWidget.tsx` (floating AI chat → `/api/concierge/chat`, creates enquiries), `JoinBadge.tsx` (sticky "Become a Member" badge), `PhoneField.tsx` (dial-code picker), `StoryCarousel.tsx`, `VideoGallery.tsx`.

**`effects/`:** `Aurora` (CSS glow), `Marquee` (infinite scroll), `Reveal` (scroll-reveal), `Sparkles` (canvas particles — NightHero only), `Spotlight` (cursor-follow halo), `TracingBeam` (scroll-tracked beam); `BentoGrid`/`StickyScrollReveal` — **unused**.

**`events/`:** `BookingWidget.tsx` (guest checkout via Stripe / member login link), `EventsBrowser.tsx` (filter-pill listing).

**`gallery/`:** `FeaturedGalleryCarousel.tsx`, `GalleriesBrowser.tsx`, `PhotoBento.tsx` (+ lightbox); `NightGalleryDetail.tsx` — **unused**.

**`home/`:** `NightHero.tsx`, `IntroChapter.tsx`, `ApproachChapter.tsx`, `LocationsChapter.tsx`, `EventsTeaser.tsx`/`EventsCarousel.tsx`, `GalleryBento.tsx`/`GalleryBentoGrid.tsx`, `VoicesChapter.tsx`/`VoicesCarousel.tsx`/`VoicesList.tsx`, `ApplyClose.tsx`, `HeroPartnersMarquee.tsx`, `InstagramChapter.tsx` — all wired into `(public)/page.tsx`. `NightSequence.tsx`, `PressMarquee.tsx` — **unused**.

**`memberships/`:** `BenefitsBento.tsx`, `TierExpandRow.tsx` — both on `memberships/page.tsx`.

**`primitives/`:** `Chapter.tsx`/`EditorialMeta` (narrative section wrapper, used nearly everywhere), `MediaBlocks.tsx` (`KenBurnsImage`, `VideoLoop`, `FullBleed`, `MemberVoice`), `PageHeroMedia.tsx` (~13 pages), `PullQuote.tsx`.

## B10. Theming / design-token system

### Two coexisting palettes, one Tailwind v4 token system
`src/app/globals.css` — Tailwind v4 `@theme` CSS-first config + two custom variants:
```css
@custom-variant day (&:where(html.theme-day *));
@custom-variant night (&:where(html.theme-night *));
```
usable directly as class prefixes (`day:bg-white night:bg-graphite/30`).

- **Brand/legacy palette** (`--color-bg`, `--color-gold`, `--color-text`, `--color-accent`) — warm cream+gold, used by admin dashboard, portal (light mode), `ui/`/`ui-shadcn/` primitives.
- **Night palette** (`--color-ink`, `--color-graphite*`, `--color-ivory*`, `--color-bronze*`, `--color-plum*`, `--color-aurora-*`) — "Midnight + Bronze", used by the public site and `PortalChrome`.
- Shadcn's bare-name aliases (`--background`, `--primary`, `--card`, `--popover`) map to the brand palette so `ui-shadcn/*` renders in-brand automatically.
- `.theme-night-admin` (on `(admin)` layout root) **remaps** legacy brand tokens onto night-palette values, letting the admin dashboard render dark by re-pointing CSS variables without touching components; also patches hardcoded `bg-[rgba(...)]` classes for dark-surface safety. `.escape-night-admin` (email/contract editor canvas) reverts to cream so the WYSIWYG preview stays true-white.
- `.theme-day` mirrors `.theme-night`'s architecture inverted for the public site.
- `.always-night` pins night tokens regardless of ambient theme (guaranteed-dark hero backdrops).
- `html.is-theming` (~280ms during toggle) transitions colour/background/border/fill/stroke so theme swaps fade.
- Also defines editorial typography (`.eyebrow`, `.display-xl/lg/md/sm`, `.lede`, `.body-prose`, `.pull-quote`) and scroll-reveal keyframes consumed by `night/effects/Reveal.tsx` / `night/primitives/Chapter.tsx`.

### Two separate theme *providers* — don't confuse them
1. **`@/providers/ThemeProvider.tsx`** (the real, live one) — `Theme = 'day'|'night'`. Resolves `localStorage['theclub:theme']` → OS preference → falls back to `'night'`. Applies `theme-day`/`theme-night` class + `data-theme` on `&lt;html&gt;`, no-flash boot script. `useTheme()` → `{theme, setTheme, toggle, isHydrating}`. Backs `ui/ThemeToggle.tsx`; used in root layout, `(admin)/layout.tsx`, `NightHeader`, `NightFooter`, 3 admin list pages.
2. **`components/website/ThemeContext.tsx`** — legacy, unrelated (`'evening'|'day'` modes, static `themeColors`), used only by the 3 not-yet-migrated legacy public pages. Never use for new work.

### `ThemeToggle.tsx` behaviour
Reads `{theme, toggle, isHydrating}` from the real `useTheme()`. `Moon`/`Sun` icon button, variants `"pill"` (public header/portal) or `"icon"` (admin sidebar footer).

### Guidance for new admin UI work

| Need | Use | Instead of | Why |
|---|---|---|---|
| Button | `ui/Button.tsx` | `ui-shadcn/button.tsx` | House variants map to brand tokens; shadcn reserved for the editor chrome that opts out intentionally. |
| Badge/status pill | `ui/Badge.tsx` | `ui-shadcn/badge.tsx` | House has the 5 CRM-specific variants used everywhere; shadcn badge only wired into the orphaned `MergeTagDropdown`. |
| Card/panel | `ui/Card.tsx` family | raw `&lt;div&gt;` | Consistent border/shadow/radius tokens used everywhere. |
| Dialog / confirm | `ui/Modal.tsx`; `admin/ConfirmDialog.tsx`'s `useConfirm()` | `ui-shadcn/dialog.tsx` / `window.confirm` | Matches brand chrome, ~40 call sites; `useConfirm()` is the styled replacement mounted once in `(admin)/layout.tsx` — never call native `confirm`. |
| Select / dropdown | `ui/Select.tsx` (simple forms) / `ui/SelectMenu.tsx` (Radix, portaled, inside modals/tables) | `ui-shadcn/select.tsx` | Both theme correctly; `SelectMenu` solves the "clipped inside overflow" problem. |
| Input / Textarea | `ui/Input.tsx` / `ui/Textarea.tsx` | `ui-shadcn/input.tsx` / `textarea.tsx` | Built-in `label/error/hint` slots matching admin form typography. |
| Date / date-time picker | `ui/DateField.tsx` / `ui/DateTimeField.tsx` | native `&lt;input type="date"&gt;` | Brand-styled, portal-safe. |
| Page header / breadcrumbs | `admin/AdminPageHeader.tsx` | ad-hoc `&lt;h1&gt;` | Standardises across 49 admin pages. |
| Empty state | `admin/AdminEmptyState.tsx` | custom markup | Consistent pattern across 39 pages. |
| Route/save loading feedback | `admin/TopProgressBar.tsx`'s `useProgress()` | ad-hoc spinners | Already wired into the admin shell. |
| Drag-to-reorder list | `admin/SortableList.tsx` | hand-rolled dnd wiring | Already handles optimistic reorder + revert; 7 pages depend on it. |
| Portal (member-facing) UI | `portal/PortalChrome.tsx` exports | `ui/*` directly | Portal always night-palette (with `day:` overrides), bronze corner-bracket motifs — its dedicated equivalent of `ui/`. |
| Public marketing site UI | `website/night/*` | `website/*.tsx` top-level / `home/`/`events/` | Legacy files are dead code superseded by `night/`. |
