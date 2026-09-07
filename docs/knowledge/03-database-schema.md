# Database Map — The Club by Sarah Restrick

Source of truth used to build this doc:
- `supabase/migrations/*.sql` (70 files, `20260216201825_initial_schema.sql` → `20260805_inbox_thread_list.sql`)
- Every `.from('table')` call under `src/` (79 distinct tables actually queried by the app)
- `src/types/database.ts` (generated Supabase types, 4117 lines)
- `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`
- `scripts/*` (seed + one-off migration-apply scripts)

**Important caveat inherited from other project research:** the migration file ledger in `supabase/migrations/` may not perfectly reflect what's actually applied to the live Supabase project. Several `scripts/apply-*-migration.mjs` files push SQL directly via the Supabase Management API (using `SUPABASE_ACCESS_TOKEN`, project ref `owjnsljovmaaxgxpxxtw`) rather than `supabase db push`, and multiple migrations explicitly say things like "column was added out-of-band and never captured in a migration, re-declared here". Treat the migrations as *strong evidence*, not infallible ground truth — when in doubt, the actual Postgres schema wins.

---

## 1. How the pieces fit together (read this first)

**Three ways the app talks to Postgres:**

1. **Browser client** (`src/lib/supabase/client.ts`) — anon key, used in client components. Subject to RLS as the logged-in user (`auth.uid()`).
2. **Server client** (`src/lib/supabase/server.ts`) — anon key + cookies, used in Server Components / route handlers that need "as the logged-in user" access. Also subject to RLS.
3. **Service-role client** — instantiated **ad hoc, inline, per-file** (there is no shared `src/lib/supabase/admin.ts` helper). The pattern, copy-pasted into ~65 API route files:
   ```ts
   import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
   function getAdminDb() {
     return createSupabaseAdminClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.SUPABASE_SERVICE_ROLE_KEY!,
       { auth: { persistSession: false } },
     )
   }
   ```
   This client **bypasses RLS entirely**. It's used for: webhooks (Stripe, DocuSign, Resend, WhatsApp), cron jobs, admin API routes that need to write data the requesting admin's session shouldn't directly touch (e.g. creating an auth user), and any table intentionally kept out of `database.ts` (see §4).

**How the app knows if you're staff/admin (`is_admin` pattern):**
- Every login is a Postgres `auth.users` row. A trigger (`handle_new_user`, in the initial migration) auto-creates a matching `public.profiles` row on signup, with `role` defaulting to `'member'`.
- `profiles.role` is an enum `user_role`: originally `'admin' | 'member'`, later extended (in `20260723_accountability_foundation.sql`) with `'team_member'` and `'freelancer'` for internal staff.
- A Postgres helper function `public.is_admin()` (`security definer`, defined in the initial schema) returns `true` if `profiles.role = 'admin'` for the current `auth.uid()`. Almost every RLS policy in the database is gated on this one function — `using (public.is_admin())`.
- A sibling function `public.is_staff()` (added later, in `20260723_accountability_foundation.sql`) returns `true` for `role in ('team_member', 'freelancer')` — used for the internal "Team Accountability" module (SOP reading, etc.) where staff need *some* access short of full admin.
- **In application code**, admin-gating in API routes is done explicitly by re-checking the caller's profile row rather than trusting the client, e.g. (`src/app/api/admin/members/create/route.ts`):
  ```ts
  const { data: profile } = await supabase.from('profiles').select('id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return { error: 'Admin only.', status: 403 }
  ```
- Members (the paying customers) have their own `members` row (`members.profile_id -> profiles.id`), separate from `profiles`. A profile is "just a login"; a `members` row is "an active/pending/expired membership with a tier, quota, Stripe IDs, etc." Staff (`team_member`/`freelancer`) normally have a `profiles` row but **no** `members` row.
- **Business accounts with multiple people:** a business membership can have several logins, each with their own `members` row, linked via `members.parent_member_id -> members.id` (the billed account). `is_primary_rep` flags the main contact. This lets every existing "profile → members" query keep working unchanged for a rep.

**RLS overall shape:** almost every table follows the same two-tier pattern:
- `"Admins can do everything on X"` / `"Admins manage X"` — `for all using (is_admin()) with check (is_admin())`.
- Then, per table, a narrower policy for the row's owner (a member seeing only their own bookings/payments/introductions, a staff member seeing only their own accountability tasks/time entries/handovers). Many later "internal ops" tables (finance, chief-of-staff, marketing, sponsorship intelligence, daily reports, concierge conversations) are **admin-only with no other policy at all** — meaning staff, members and anon get zero access, by omission.
- Public-facing website content tables (`hero_slides`, `testimonials`, `galleries`, etc.) instead use `"Public read X" using (is_active/is_visible/is_published = true)` for anon SELECT, plus an admin-all policy.

---

## 2. Table inventory

Grouped by feature area. "Used by" lists the top-level directories under `src/` where `.from('table')` calls for that table were found (not exhaustive file-by-file, but covers every call site's containing feature area).

### 2.1 Identity & membership core

#### `profiles`
*What it means for the business:* every person who can log in — members, staff, admins. One row per Supabase auth user.
- **Migration:** `20260216201825_initial_schema.sql`, extended by `20260723_accountability_foundation.sql` (staff fields).
- **Key columns:** `id uuid PK` (= `auth.users.id`), `role user_role` (`admin | member | team_member | freelancer`, default `member`), `first_name`, `last_name`, `email`, `phone`, `avatar_url`, `company_name`, `job_title`, `bio`, `linkedin_url`, `website_url`, `staff_status text` (`active | inactive`, added later — deactivate a staff login without deleting it), `created_at`, `updated_at`.
- **FKs:** `id -> auth.users(id)` (cascade delete).
- **RLS:** admins do everything; any authenticated user can SELECT any profile (`using (true)` — deliberately open, see note in `20260724_time_tracking.sql` about why staff hourly rates live in a *separate* table, not on `profiles`, because of this); a user can UPDATE only their own row.
- **Used by:** almost everywhere — admin member management, auth (`src/providers/AuthProvider.tsx`, `src/middleware.ts`), staff views, chief-of-staff, marketing (created_by), inbox mailbox grants, enrichment jobs.

#### `members`
*What it means for the business:* an active/pending/expired/cancelled **membership** — the commercial relationship, separate from the login. Holds the tier, quota, Stripe/Xero IDs and a huge amount of relationship-intelligence data added over time (life-of-club section below).
- **Migration:** `20260216201825_initial_schema.sql`, massively extended by `20260608_member_profile_expansion.sql`, `20260609_business_account_reps.sql`, `20260617_plan_tier_consolidation.sql`, `20260708_rewards_benefits.sql` (member_number), `20260720_member_enrichment.sql`, `20260720_member_xero_spend.sql`.
- **Key columns (original):** `id uuid PK`, `profile_id -> profiles` (unique — one member row per login, except reps, see below), `membership_type membership_type` (`individual | business`, later `partner` added), `membership_tier membership_tier` (`tier_1 | tier_2 | tier_3`), `membership_status membership_status` (`active | pending | expired | cancelled`, later `paused` added), `monthly_intro_quota int`, `intros_used_this_month int`, `company_name/description/website`, `showcase_enabled bool`, `sponsor_aligned bool`, `membership_start_date/end_date/renewal_date`, `stripe_customer_id`, `gocardless_mandate_id`, `xero_contact_id`, `source`, `referred_by -> members`, `notes`, `deleted_at` (soft delete).
- **Key columns (added later, selected):** `parent_member_id -> members` + `is_primary_rep` + `rep_role` (multi-rep business accounts), `intro_quota int` (post plan-tier-consolidation), `payment_frequency`, `membership_manager`, `membership_value_pence`, `contract_signed/contract_url/membership_agreement_url/introducer_agreement_url/nda_url`, company enrichment fields (`sector`, `sub_sector`, `employee_count`, `annual_turnover`, `estimated_profit`, `offices`, addresses, accounts/invoice contacts), relationship-intelligence fields (`career_history`, `awards`, `media_features`, `achievements`, `charitable_interests`, `hobbies`, `sporting_interests`, `favourite_brands`), matching preferences (`intro_target_types`, `intro_target_criteria`, `dream_introductions`, `what_they_can_offer`), lifestyle/events prefs (`business_objectives`, `budgets`, `interest_flags[]`, `event_preferences[]`, `travel_profile`, `dietary_requirements`, `allergies`, `drink_preferences`, `favourite_restaurants`, `birthday`, `partner_name`, `assistant_name/contact`, `important_dates`), success tracking (`success_stories`, `member_testimonial`, `member_satisfaction_score`, `nps_score`), AI/CRM scores (`churn_risk_score`, `upgrade_potential`, `engagement_score`, `ltv_forecast_pence`, `relationship_health_score`, `relationship_capital_score`, `ai_intelligence jsonb`), `member_number int`, `enrichment_status/enriched_at/enrichment_source/enrichment_raw` (AI company enrichment), `xero_spend_pence`, `xero_spend_synced_at`.
- **FKs:** `profile_id -> profiles`, `referred_by -> members`, `parent_member_id -> members`.
- **RLS:** admin-all; any authenticated user can SELECT non-deleted members (`deleted_at is null`) — this is the "member directory"; a member can UPDATE only their own row (`profile_id = auth.uid()`).
- **Used by:** admin member management, portal (member-facing self-service), events/bookings, communications, chief-of-staff, enrichment jobs, Xero sync, marketing segments, sponsorship module, `src/middleware.ts` (route gating).

#### `member_tags` / `tags`
*What it means for the business:* the industry/interest/need/service labels used to describe and match members (this is the raw material the introduction-matching engine scores against).
- **Migration:** `20260216201825_initial_schema.sql`; uniqueness tightened in `20260615_tags_unique_per_category.sql`; starter set seeded in `20260615_seed_starter_tags.sql`.
- **`tags`:** `id`, `name text unique`, `category tag_category` (`industry | interest | need | service`).
- **`member_tags`:** join table, composite PK `(member_id, tag_id)`.
- **RLS:** tags readable by any authenticated user, writable by admin; member_tags readable by all, a member can add/remove their own.
- **Used by:** admin member profile editing, portal (self-tagging), automations (tag-based routing), marketing segments (rule matching).

---

### 2.2 Events, bookings & sponsorship

#### `events`
*What it means for the business:* a Club event — a members' networking evening, a curated luxury trip, a retreat. Everything (bookings, sponsorships, comms, profitability) hangs off this.
- **Migration:** `20260216201825_initial_schema.sql`.
- **Key columns:** `title`, `slug unique`, `description`, `event_type event_type` (`member_event | curated_luxury | retreat`), `status event_status` (`draft | published | live | completed | cancelled`), venue fields, `start_date/end_date/doors_open`, `capacity`, `guest_ticket_capacity`, pricing (`member_price_pence`, `guest_price_pence`, `sponsor_price_pence`), `travel_included`, `accommodation_available/price_pence`, `cover_image_url`, `gallery_urls text[]`, `speakers jsonb`, `agenda jsonb`, `guest_list_visible`, `auto_confirm`, `created_by -> profiles`.
- **RLS:** admin-all; authenticated users can view events with status in `('published','live','completed')`; a separate public policy (`20260505_public_events_policy.sql`) lets **anon** view published events too (for the public events page).
- **Used by:** public events pages, admin events management, bookings/checkout, sponsorship, marketing engine (campaign source), chief-of-staff, event automation.

#### `bookings`
*What it means for the business:* one ticket/attendance record for an event — a member's own booking, or a guest they bring.
- **Migration:** `20260216201825_initial_schema.sql`, extended by `20260615_booking_card_hold.sql` (Stripe card-hold columns), `20260717_event_automation.sql` (`attendance`, `checked_in_at`).
- **Key columns:** `event_id -> events`, `member_id -> members`, `status booking_status` (`confirmed | pending | cancelled | refunded`), `is_guest`, `guest_name/email/company`, `accommodation_booked`, `sponsor_package`, `guests_invited`, `amount_pence`, `payment_method payment_method` (`stripe | gocardless | invoice | manual`), `stripe_payment_intent_id`, `dietary_requirements`, `special_requests`, `table_assignment`, `checked_in bool`, `checked_in_at`, `attendance text` (`attended | no_show`, nullable — distinct from the door check-in toggle), plus card-hold columns (`stripe_customer_id`, `stripe_payment_method_id`, `stripe_setup_intent_id`, `charge_error`).
- **RLS:** admin-all; a member can SELECT/INSERT their own bookings (via `members.profile_id = auth.uid()`).
- **Used by:** admin(layout gating), events booking/checkout API, check-in flow (`src/app/checkin/[bookingId]`), portal, communications templates, automations (reminder sequences).

#### `event_invitations`
*What it means for the business:* the team's actual invite list for an event — distinct from bookings. Lets staff track who was *invited* vs who actually *confirmed/booked*, for members or external (non-member) contacts.
- **Migration:** `20260618_event_invitations.sql`.
- **Key columns:** `event_id -> events`, `member_id -> members` (nullable, for external invitees), `invitee_name/email/company`, `status text` default `'invited'` (flips to confirmed on booking), `booking_id -> bookings`, `notes`, `invited_at`, `responded_at`, `created_by -> profiles`. Unique per `(event_id, lower(invitee_email))`.
- **RLS:** admin-only (`for all using (is_admin())`).
- **Used by:** `src/app/api/events`, admin event guest-list views, `src/lib/members`.

#### `event_comms_sent`
*What it means for the business:* an idempotency ledger — "we already sent this reminder/thank-you for this booking, don't send it twice" even if the automation cron runs late or twice.
- **Migration:** `20260717_event_automation.sql`.
- **Key columns:** `event_id -> events`, `booking_id -> bookings` (nullable for event-level stages), `kind text` (`reminder_14d | reminder_7d | reminder_48h | reminder_morning | thank_you | feedback | intro_recs | conversion`), `sent_at`. Unique on `(booking_id, kind)` where booking_id not null.
- **RLS:** admin-only.
- **Used by:** `src/lib/automations` (event reminder/follow-up sequences).

#### `event_expenses`
*What it means for the business:* the cost side of an event's P&L — one line item per cost (venue, catering, AV, talent). Combined with confirmed booking revenue + sponsorship, this drives the event profitability dashboard.
- **Migration:** `20260717_event_expenses.sql`.
- **Key columns:** `event_id -> events`, `label`, `amount_pence`, `category`.
- **RLS:** admin-only.
- **Used by:** `src/views/admin` (finance dashboards).

#### `event_profitability`
*What it means for the business:* manually-entered revenue figure per event, paired against staff time cost (from `time_entries`) to compute profit — admin-only finance view.
- **Migration:** `20260724_time_tracking.sql`.
- **Key columns:** `event_id uuid PK -> events`, `revenue numeric`, `updated_by -> profiles`.
- **RLS:** admin-only (staff have zero access, even though their own logged hours feed the cost side).
- **Used by:** `src/views/admin` (finance).

#### `sponsorships`
*What it means for the business:* an agreed sponsorship deal — a member/company paying to sponsor a specific event.
- **Migration:** `20260216201825_initial_schema.sql`, extended by `20260617_sponsor_booking_links.sql` (booking token for the no-login sponsor portal), `20260718_sponsorship_module.sql` (generated docs), `20260719_xero_sync_columns.sql`.
- **Key columns:** `member_id -> members`, `event_id -> events`, `package_name`, `amount_pence`, `benefits jsonb`, `showcase_slot`, `brand_alignment`, `status text` (free text, default `pending`), `sponsor_name/email/company` (for a sponsor who isn't a member), `event_price_pence`, `booking_token text` (auto-generated, powers the token-gated public Sponsor Portal — no login needed), `invite_sent_at`, `proposal_html` (AI-generated proposal), `roi_report_html` + `roi_reach` (post-event ROI report), `xero_invoice_id`.
- **RLS:** admin-all; a member can SELECT their own sponsorships.
- **Used by:** public events (sponsor showcase), admin sponsorship management, `/api/sponsor/[token]` public portal, chief-of-staff, automations, Xero sync.

#### `sponsor_deliverables`
*What it means for the business:* the delivery checklist for a sponsor — assets required, branding deadlines, guest allocation — each with a due date/status, and (via a later migration) the actual files a sponsor uploads through their token-gated portal.
- **Migration:** `20260718_sponsorship_module.sql`, extended by `20260718_sponsor_uploads.sql` (submission columns).
- **Key columns:** `sponsorship_id -> sponsorships`, `label`, `category text` (`asset | branding | guest_allocation | other`), `due_date`, `status text` (`pending | received | done`), `notes`, `file_path/file_name/file_size` (in the private `sponsor-assets` bucket), `submitted_at`, `sponsor_note`.
- **RLS:** admin-only (the sponsor portal writes via service-role, bypassing RLS, keyed by the sponsorship's `booking_token`).
- **Used by:** `/api/sponsor/[token]/submit`, admin sponsor management (`SponsorManageModal.tsx`), chief-of-staff.

#### `sponsor_comms_sent`
*What it means for the business:* idempotency ledger for the staged sponsor follow-up sequence (mirrors `event_comms_sent`/`member_comms_sent`).
- **Migration:** `20260718_sponsorship_module.sql`.
- **Key columns:** `sponsorship_id -> sponsorships`, `kind text` (`followup_3d | followup_7d | followup_14d`), `sent_at`. Unique on `(sponsorship_id, kind)`.
- **RLS:** admin-only.
- **Used by:** `src/lib/automations`.

#### `sponsor_prospects`, `sponsor_decision_makers`, `sponsor_outreach` (Sponsorship Intelligence, Aug 2026)
*What it means for the business:* the "find and win new sponsors" pipeline — an AI-assisted funnel of *candidate* companies for an event (before they've agreed to anything), enriched with contact people, and the AI-drafted outreach emails sent to them, with a human-approval gate before anything actually sends.
- **Migration:** `20260801_sponsorship_intelligence.sql`.
- **`sponsor_prospects`:** `event_id -> events`, `company_name/domain`, `website_url`, `linkedin_url`, `industry`, `employee_count`, `revenue_printed`, `description`, `source text` (`past_sponsor | crm_member | crm_contact | warm_lead | cold`), `temperature text` (`warm | cold`), `vendor`/`vendor_raw jsonb` (enrichment vendor payload), `match_score int`, `match_reasons jsonb`, `ai_rationale`, `status text` (`suggested | shortlisted | approved | contacted | responded | won | lost | dismissed`), `converted_sponsorship_id -> sponsorships` (once won). Unique per `(event_id, lower(company_domain))`.
- **`sponsor_decision_makers`:** `prospect_id -> sponsor_prospects`, `first_name/last_name/title/seniority/email/linkedin_url`, `vendor/vendor_raw`, `is_primary bool`.
- **`sponsor_outreach`:** `prospect_id -> sponsor_prospects`, `decision_maker_id -> sponsor_decision_makers`, `event_id -> events`, `step int` (sequence position), `channel`, `sender text` (`resend | instantly`), `voice`, `subject/body_html/body_text`, `status text` (`draft | approved | scheduled | sent | failed | replied | bounced`), `to_email`, `approved_by -> profiles` + `approved_at` (the human gate), `sent_at`, `external_id`, `response_at/response_snippet`.
- **RLS:** all three admin-only.
- **NOTE:** these tables are intentionally **absent from `src/types/database.ts`** (written by the untyped service-role client) — this is deliberate per the migration comments, not an oversight, though it means TypeScript gives no autocomplete/type-safety for them.
- **Used by:** `src/app/api/admin/sponsors*`, sponsorship intelligence admin views.

---

### 2.3 Introductions (the core matchmaking feature)

#### `introductions`
*What it means for the business:* a proposed (and tracked) connection between two members — the Club's signature "warm introduction" networking mechanic, from AI-suggested match through to a closed deal.
- **Migration:** `20260216201825_initial_schema.sql`, heavily extended by `20260615_intro_responses_and_settings.sql`, `20260616_intro_per_side_send.sql`, `20260707_introduction_request_fields.sql`, `20260705_introduction_outcomes.sql`, `20260717_commission_tracking.sql`, `20260719_xero_sync_columns.sql`.
- **Key columns:** `member_a_id`/`member_b_id -> members` (constrained `member_a_id < member_b_id` and `<>`, so a pair is stored exactly once, order-independent), `status intro_status` (`suggested | approved | sent | accepted | completed | declined`, later `scheduled` added), `match_score decimal`, `match_reason text`, `matching_tags uuid[]`, `requested_by -> members` (member-initiated request), `approved_by -> profiles` (staff approval), `event_id -> events` (if the intro happened at/around an event), `outcome text`, `business_converted bool`, `estimated_value_pence`, timestamps for every stage (`suggested_at/approved_at/sent_at/accepted_at/followed_up_at`), `request_reason`/`desired_outcome` (member's own words when requesting), per-side response tracking (`member_a_response`/`member_b_response` — enum `intro_response`: `pending | accepted | declined` — with notes + timestamps), per-side scheduled/actual send (`scheduled_send_at`, `email_a/b_subject/body`, `email_a/b_scheduled_at`, `email_a/b_sent_at`), outcome tracking (`meeting_held_at`, `proposal_sent_at`, `deal_status` (null/`won`/`lost`), `deal_closed_at`, `revenue_pence`, `testimonial_obtained/testimonial_note`), commission tracking (`commission_pence`, `commission_status` `pending|paid`, `commission_paid_at`), `agreement_commission_pct`, `xero_invoice_id`.
- **RLS:** admin-all; a member can SELECT introductions where they're `member_a` or `member_b`.
- **Used by:** admin introductions workflow (create/send/reject/why), portal (member request/respond), communications, chief-of-staff, Xero sync, automations (follow-up nudges).

---

### 2.4 Payments & billing

#### `payments`
*What it means for the business:* a generic payment ledger row — could back a membership fee, an event booking, a sponsorship, etc. (`reference_id` points at whichever).
- **Migration:** `20260216201825_initial_schema.sql`.
- **Key columns:** `member_id -> members`, `payment_type text`, `reference_id uuid` (untyped FK — points at whatever `payment_type` says), `amount_pence`, `currency` (default `GBP`), `status payment_status` (`paid | pending | overdue | refunded | failed`), `payment_method payment_method`, `stripe_payment_intent_id`, `gocardless_payment_id`, `xero_invoice_id`, `due_date`, `paid_at`, `description`.
- **RLS:** admin-all; a member can SELECT their own payments.
- **Used by:** admin(layout), events, chief-of-staff, automations, portal, Xero sync.

#### `membership_tiers`
*What it means for the business:* early Stripe-subscription tier catalogue (from the original Stripe integration).
- **Migration:** `20260507_stripe_subscriptions.sql`.
- **RLS:** admin manage, authenticated read.
- **Note:** superseded in practice by `membership_plans` (below) — `20260616_membership_plans_table.sql`'s header comment notes `membership_plans` existed live before that migration properly captured it, and `20260617_plan_tier_consolidation.sql` consolidates tier logic. `membership_tiers` doesn't appear in the current `.from()` call list — likely legacy/unused now, but still exists on disk.

#### `membership_plans`
*What it means for the business:* the current, authoritative catalogue of membership plans/tiers — pricing, quotas, what's shown on the public pricing page and in the application flow.
- **Migration:** `20260616_membership_plans_table.sql`, extended by `20260617_plan_tier_consolidation.sql`.
- **RLS:** public read of active plans; admin manage.
- **Used by:** public memberships page, membership-application flow, admin, chief-of-staff, `src/lib/membership`, portal.

#### `membership_applications`
*What it means for the business:* a prospective member's application — the public 8-step form (contact, location, events interest, profile, online presence, business, tier choice, payment) plus the internal review/approval workflow and Stripe pending-charge flow (card saved at application, only charged on approval).
- **Migration:** `20260506_website_content.sql`, extended by `20260524_extend_membership_applications.sql` (8-step form fields), `20260605_pending_charge_applications.sql` (Stripe SetupIntent flow), `20260608_application_due_diligence.sql` (matchmaking intake + pitch track).
- **Key columns:** applicant identity/contact fields, `preferred_tier`, `preferred_location`, `industry`, `referral_source/name`, `bio`, `interests text[]`, `status text` (default `pending`), `notes`, `reviewed_by -> profiles`, `reviewed_at`; extended-form fields (address, `photo_url`, `nationality`, `identifies_as`, `pronouns`, social URLs, `work_email`, `annual_turnover`, `employees`, `payment_preference`); Stripe (`stripe_customer_id/subscription_id`, `paid_at`, `amount_paid_pence`, `refunded_at/refund_id/refund_amount_pence`, `stripe_setup_intent_id`, `stripe_payment_method_id`, `quoted_amount_pence`, `charge_error`, `pending_email_sent_at`); matchmaking intake (`looking_for`, `what_they_can_offer`, `applicant_stage`, `track text` default `'membership'` — or `'pitch'` for early-stage founders seeking investment).
- **RLS:** public INSERT (anyone can apply); admin/service-role manages the rest.
- **Used by:** admin(layout), applications API (approve/reject), membership-application public flow, chief-of-staff, portal.

#### `membership_benefits`
*What it means for the business:* the CMS copy for the 9 fixed "membership benefits" tiles on the public `/memberships` page. Editors can edit text/image and hide a tile, but the 9 positions are fixed (no create/delete).
- **Migration:** `20260526_membership_benefits.sql` (ships pre-seeded with the live copy).
- **Key columns:** `position int` (1–9, unique), `numeral text` (Roman numeral shown on the card), `title`, `body`, `image_url`, `is_visible bool`.
- **RLS:** public read of visible cards; admin read-all + update (no insert/delete grant even for admins — the set is fixed).
- **Used by:** public `/memberships`, admin website content editor.

#### `membership_comparison`
*What it means for the business:* the "compare tiers" feature-matrix table shown on the public memberships page.
- **Migration:** `20260617_membership_comparison.sql`.
- **RLS:** public read; admin insert/update/delete (separate policies).
- **Used by:** public `/memberships`, admin.

---

### 2.5 Public website content (CMS-style, low business-logic)

All in `20260506_website_content.sql` unless noted; pattern is `public read where is_active/is_visible/is_published` + `admin all` (via `auth.jwt() ->> 'role' = 'service_role'` in this migration specifically, rather than `is_admin()` — an earlier/inconsistent pattern vs. later migrations).

| Table | Business meaning | Key columns |
|---|---|---|
| `hero_slides` | Hero banner images/video per page. Extended in `20260619_hero_slides_cms_columns.sql` to support video heroes with CTA buttons and copy (`media_type` image/video, `video_url`, `eyebrow`, `headline`, `lede`, `cta_primary/secondary_label/href`). | `page_slug`, `image_url`, `alt_text`, `overlay_text`, `display_order`, `is_active` |
| `partner_logos` | Logo strip of partner brands. | `name`, `image_url`, `website_url`, `display_order`, `is_visible` |
| `testimonials` | Member/guest quotes shown on the site. | `person_name/title`, `company_name`, `quote_text`, `display_order`, `is_active` |
| `galleries` / `gallery_photos` | Event photo galleries and their photos. | `galleries`: `title`, `slug`, `cover_image_url`, `event_date`, `venue_name`, `location`, `category`, `is_published`. `gallery_photos`: `gallery_id -> galleries`, `image_url`, `caption`, `display_order` |
| `curated_experiences` | Tiles on the Private Event Services page. | `title`, `description`, `image_url`, `link_url`, `display_order`, `is_active` |
| `video_gallery` | YouTube embeds (About/Gallery pages). | `title`, `youtube_url`, `page_slug`, `display_order`, `is_active` |
| `documents` | Downloadable PDFs (brochures etc). | `title`, `slug`, `file_url`, `page_slug`, `is_active` |
| `instagram_settings` / `instagram_posts` | Instagram feed embed config + cached posts shown on the public site. (`20260619_instagram_cms_tables.sql`) | admin-managed, public read of active rows |

#### `reviews`
*What it means for the business:* public-facing customer/guest reviews (distinct from `testimonials`) — visitors submit via a form, admin approves before it's shown.
- **Migration:** originally created loosely, properly captured with columns in `20260617_schema_drift_catchup.sql`.
- **Key columns:** `first_name/last_name/email/company/title`, `event_id -> events`, `body`, `status text` (default `pending`), `is_active bool`, `admin_notes`, `reviewed_at/reviewed_by -> profiles`, `approved_at`.
- **RLS:** public INSERT (only as `status='pending', is_active=true` — can't self-approve); public read of approved+active; admin all.
- **Used by:** public reviews page, share-your-experience page, admin.

#### `mailing_list`
*What it means for the business:* newsletter/mailing-list signups from the public site.
- **Migration:** `20260506_website_content.sql`, reconciled in `20260619_mailing_list_reconcile.sql` (adds `subscribed_at`, `unsubscribed_at`, `unsubscribe_token`, `notes`).
- **RLS:** public insert; admin all.
- **Used by:** public unsubscribe page, mailing signups, marketing audiences, admin.

#### `enquiries`
*What it means for the business:* every inbound contact-form/website enquiry — the top of the sales funnel. Extended over time into a full lead-routing + AI-enrichment system.
- **Migration:** `20260506_website_content.sql`, extended by `20260716_enquiry_routing.sql` (lead scoring + routing), `20260617_schema_drift_catchup.sql` (admin review fields), `20260720_enquiry_enrichment.sql` (AI company/person enrichment).
- **Key columns:** contact fields, `intent text[]`, `message`, `status text` (default `new`), routing (`source`, `lead_score int` 0–100, `score_reasons jsonb`, `assigned_to -> profiles`, `acknowledged_at`, `related_task_id -> tasks`), review (`admin_notes`, `reviewed_at/by`, `replied_at`), enrichment (`enrichment_status/enriched_at/enrichment_source`, `company_domain/website/linkedin_url/industry/employee_count/revenue(_printed)`, `person_title/seniority/linkedin_url`, `enrichment_raw jsonb`).
- **RLS:** public insert; admin/service-role manages the rest.
- **Used by:** public contact forms, `/api/enquiries/intake`, `/api/enquiries/enrich`, `/api/enquiries/reply`, AI lead enrichment (`src/lib/enrichment`, `src/lib/ai`).

---

### 2.6 Communications & marketing

#### `communications`
*What it means for the business:* a log of every email/message sent to a specific member (template sends, campaign sends) — tracks open/click via Resend webhooks.
- **Migration:** `20260216201825_initial_schema.sql`.
- **Key columns:** `member_id -> members`, `template_name`, `channel` (default `email`), `subject`, `body_preview`, `sent_at/opened_at/clicked_at`, `resend_message_id` (matched against Resend webhook `data.email_id`), `status text` (default `draft`).
- **RLS:** admin-all; member can SELECT own.
- **Used by:** communications send API, Resend webhook, portal, admin members view.

#### `email_log`
*What it means for the business:* mirrors `communications` but for transactional/automation-triggered sends (not per-member template sends) — same Resend webhook matches both by `resend_message_id`.
- **Migration:** `20260615_email_log.sql`.
- **Key columns:** `status text` default `sent` (`sent | failed`), plus message metadata.
- **RLS:** admin read only (service-role writes).
- **Used by:** automations, communications API, Resend webhook, email lib.

#### `email_templates`, `template_ai_chats`, `template_ai_messages`
*What it means for the business:* the drag-and-drop email template builder (used for member comms and campaigns), plus its "AI co-writer" chat history.
- **Migration:** `20260520_email_template_builder.sql`.
- **`email_templates`:** `category text check in ('automation','campaign','transactional')`, `from_name_type check in ('sender','fixed')`, plus name/subject/body-block-JSON/rendered HTML (exact remaining columns not all captured here — see file for full DDL).
- **`template_ai_chats`:** one chat thread per template per user.
- **`template_ai_messages`:** `role check in ('user','assistant')`, chat messages; a trigger touches the parent chat's `updated_at` on new messages.
- **RLS:** `email_templates`: admin-all. Chats/messages: owner-only (`template_ai_chats_owner`, `template_ai_messages_owner` policies).
- **Used by:** admin email template builder, communications send flow, hooks (`useTemplateStats`, `useTemplates`, `useEmailEditor`).

#### `email_campaigns`, `audiences`, `audience_members`
*What it means for the business:* bulk email campaigns sent to a hand-picked or rule-based list of recipients.
- **Migration:** `20260617_schema_drift_catchup.sql` (re-declares live schema).
- **`audiences`:** a named, hand-curated recipient list (`name`, `description`, `created_by`).
- **`audience_members`:** join table — a member of an audience is EITHER a `mailing_list` subscriber OR a CRM `member` (`audience_members_one_side` check constrains exactly one side to be set).
- **`email_campaigns`:** one send batch — `template_id -> email_templates`, `audience_id -> audiences`, `audience_label`, `name`, `subject`, `body_html`, `recipient_count/sent_count/failed_count`, `status text` (default `draft`), `error_message`, `scheduled_at/sent_at`.
- **RLS:** all three admin-only.
- **Used by:** admin campaigns send API, admin marketing/comms views.

#### `marketing_campaigns`, `marketing_assets`, `marketing_voices`, `marketing_segments`, `marketing_templates` (Marketing AI Engine, July 2026, 5 modules)
*What it means for the business:* the AI content-generation pipeline — from a source (an event, a free-text brief, or an uploaded audio transcript), generate draft social/blog/newsletter/press content across channels, route it through an approval queue, personalise voice ("The Club" formal vs "Sarah" the founder), target rule-based member segments, and render on-brand social graphics from a template builder.
- **Migration:** `20260723_marketing_engine_foundation.sql` (campaigns + assets), `20260723_marketing_voices.sql`, `20260723_marketing_segments.sql`, `20260725_marketing_templates.sql`, `20260725_marketing_default_photo_templates.sql`.
- **`marketing_campaigns`:** one generation batch — `title`, `source_type text check in ('event','topic','audio')`, `event_id -> events`, `topic_brief`, `transcript` (Whisper transcription of uploaded audio), `audio_url`, `status text check in ('draft','generating','ready','archived')`, `created_by -> profiles`.
- **`marketing_assets`:** one draft piece per channel within a campaign — `campaign_id -> marketing_campaigns`, `channel text check in (seo_blog, recap_blog, linkedin, instagram_feed, instagram_carousel, instagram_reel, newsletter, press_release, sponsor_recap)`, `voice text check in ('club','sarah')`, `variant text` (distinguishes multiple LinkedIn drafts: `voice_club | voice_sarah | sponsor | founder_spotlight`), `title/body/body_html/body_json`, `email_template_id -> email_templates`, `status text check in ('draft','in_review','approved','scheduled','published','rejected')`, `publish_target jsonb`, `scheduled_at/published_at`, library tagging (`event_id`, `sponsor_member_id`, `member_id`), and graphic-rendering columns (`template_id -> marketing_templates`, `graphic_url`, `slot_values jsonb`).
- **`marketing_voices`:** exactly 2 editable rows, `key check in ('club','sarah')` — the AI's brand-voice guidance + reference sample posts.
- **`marketing_segments`:** saved rule-based member audiences (`rules jsonb` — tiers/statuses/types/tag_ids/tag_match) that auto-collect matching members at send time, layered on top of the hand-picked `audiences`.
- **`marketing_templates`:** saved social-graphic layouts (`shape check in ('square','portrait','landscape')`, `background jsonb`, `slots jsonb` — ordered photo/heading/subtext/fixed blocks), plus `is_default_photo`/`is_default_color` flags the generator uses to auto-pick a layout for event-sourced posts with/without a photo. Renders to the public `social-graphics` storage bucket.
- **RLS:** all admin-only, no exceptions.
- **NOTE:** `marketing_campaigns`, `marketing_segments`, `marketing_templates`, `marketing_voices` are **absent from `src/types/database.ts`** — stale generated types, not a real gap (confirmed they exist and are actively used, e.g. `src/lib/marketing`).
- **Used by:** `src/app/api/admin/*` marketing routes, `src/lib/marketing`.

---

### 2.7 Concierge (member-facing lifestyle service) & AI Website Concierge

#### `concierge_requests`
*What it means for the business:* a member's request to the Club's luxury concierge service (book a table, source an experience, etc.) — from raw enquiry through sourcing/quoting/delivery/feedback, with commission tracking.
- **Migration:** `20260216201825_initial_schema.sql`, heavily extended by `20260706_concierge_pipeline.sql` (full pipeline + commercial fields), `20260717_commission_tracking.sql`, `20260719_xero_sync_columns.sql`.
- **Key columns:** `member_id -> members`, `request_type`, `description`, `event_name/location/dates/guests/budget_pence`, `status text check in (pending, assigned, sourcing, quoted, accepted, booked, delivered, feedback, declined, cancelled)`, `quoted_amount_pence`, `fulfilled_by -> profiles`, `notes`, `assigned_to -> profiles`, `supplier_name`, `supplier_cost_pence`, `sale_price_pence`, `commission_pence`, `priority text check in (low,medium,high)`, `delivered_at`, `feedback_note/rating`, `commission_status check in (pending,paid)`, `commission_paid_at`, `xero_invoice_id`.
- **RLS:** admin-all; a member can SELECT/INSERT their own requests.
- **Used by:** chief-of-staff, members lib, Xero sync, portal (member submits requests), admin concierge pipeline view.

#### `concierge_conversations`
*What it means for the business:* full chat transcripts from the public AI "Website Concierge" widget (the chatbot on the marketing site, not the member-facing service above) — captures visitor Q&A, qualifies leads, and can spawn an `enquiries` row.
- **Migration:** `20260803_concierge_conversations.sql`.
- **Key columns:** `session_token unique`, `messages jsonb` (`[{role, content, at}]`), `message_count int` (abuse cap), `visitor_name/email/goal`, `qualified bool`, `enquiry_id -> enquiries`, `ip`, `user_agent`.
- **RLS:** admin-only; the public `/api/concierge/chat` endpoint writes via service-role (bypassing RLS) — browsers never touch this table directly.
- **NOTE:** absent from `database.ts` deliberately (untyped service-role writer).
- **Used by:** `src/app/api/concierge/chat`.

---

### 2.8 Documents & e-signature

#### `member_documents`
*What it means for the business:* a private document vault per member — onboarding forms, introducer/commission agreements, NDAs, signed contracts. Files live in the private `member-documents` storage bucket; only signed URLs are ever handed out.
- **Migration:** `20260704_member_documents.sql`.
- **Key columns:** `member_id -> members`, `title`, `doc_type text` (default `other`), `file_name`, `file_path` (object path in the bucket), `content_type`, `size_bytes`, `uploaded_by -> profiles`.
- **RLS:** admin-only.
- **Used by:** `src/lib/docusign` (drops signed PDFs here), `src/views/admin/members/MemberDocumentsPanel.tsx`.

#### `signature_requests`
*What it means for the business:* a DocuSign e-signature request sent to a member — tracks the envelope lifecycle from creation through completion or decline.
- **Migration:** `20260704_signature_requests.sql`, linked to contracts in `20260704_contract_templates.sql`.
- **Key columns:** `member_id -> members`, `envelope_id` (DocuSign), `status text check in (created,sent,delivered,completed,declined,voided,error)`, `doc_type` (default `contract`), `title`, `signer_name/email`, `subject/message`, `source_file_name`, `signed_document_id -> member_documents` (the completed signed PDF, once pulled back), `declined_reason`, `error`, `sent_by -> profiles`, `sent_at/completed_at/last_checked_at`, `contract_template_id -> contract_templates`.
- **RLS:** admin-only.
- **Used by:** `/api/admin/signatures/*`, `/api/docusign/*`, `src/lib/docusign`, `src/components/contracts`.

#### `contract_templates`, `contract_ai_chats`, `contract_ai_messages`
*What it means for the business:* a saved, reusable contract authored in a block editor (same UX pattern as the email template builder) that gets sent for e-signature via DocuSign, plus its AI-drafting chat history.
- **Migration:** `20260704_contract_templates.sql`.
- **`contract_templates`:** `name` (default `Untitled contract`), `doc_type` (default `contract`), `body_html`, `body_json`, `theme jsonb`, `attachments jsonb`, `is_draft bool`, `created_by_id -> profiles`.
- **`contract_ai_chats`:** `user_id -> profiles`, `contract_id -> contract_templates`, `title`.
- **`contract_ai_messages`:** `chat_id -> contract_ai_chats`, `role`, `content`, `blocks_snapshot jsonb`.
- **RLS:** all admin-only.
- **Used by:** `/api/contracts/*`, `src/components/contracts`.

---

### 2.9 Rewards & referrals

#### `reward_partners`, `reward_offers`, `reward_claims`, `reward_referrals`
*What it means for the business:* a member perks/rewards program — partner businesses (`reward_partners`) offer perks (`reward_offers`) that members can claim (`reward_claims`); members can also refer new business and earn a referral payout (`reward_referrals`).
- **Migration:** `20260708_rewards_benefits.sql`.
- **`reward_claims.status`:** `claimed | redeemed | cancelled`. **`reward_referrals.status`:** `pending | paid`.
- **RLS:** admin manage all four; anyone/authenticated can read active partners/offers; a member can read/create/update their own claims and read their own referrals.
- **Used by:** public `/rewards` page, portal, admin rewards management.

---

### 2.10 Task management, staff accountability & team ops

#### `tasks`, `task_comments`
*What it means for the business:* general-purpose staff task tracking (sales/events/admin follow-ups) — "the first layer of the 'if it isn't in the system, it doesn't exist' rule."
- **Migration:** `20260704_tasks_module.sql`, extended by `20260716_enquiry_routing.sql` (`related_enquiry_id`).
- **Key columns (`tasks`):** `title/description`, `status text check in (todo,in_progress,blocked,done)`, `priority text check in (low,medium,high)`, `category text` (default `general`; sales/events/admin/general), `assigned_to -> profiles`, `due_date`, `related_member_id -> members`, `related_event_id -> events`, `related_enquiry_id -> enquiries`, `created_by -> profiles`, `completed_at`.
- **`task_comments`:** `task_id -> tasks`, `author_id -> profiles`, `body`.
- **RLS:** admin-only on both.
- **Used by:** `src/app/api/enquiries` (auto-created follow-up tasks), automations, admin task board.

#### `accountability_tasks`, `accountability_task_comments`, `accountability_task_attachments`, `accountability_task_activity`
*What it means for the business:* a **separate, self-contained** task system for the "Team Accountability" program — staff (`team_member`/`freelancer`) see and act only on tasks where they're the owner; a full append-only audit trail is kept automatically via triggers. Deliberately not merged with the general `tasks` table above.
- **Migration:** `20260723_accountability_foundation.sql`, extended by `20260724_time_tracking.sql` (`event_id` link).
- **`accountability_tasks`:** `title/description`, `owner_id -> profiles` (`on delete restrict` — can't delete a staff profile with tasks still assigned), `created_by -> profiles`, `deadline`, `status text check in (not_started,in_progress,blocked,done)`, `outcome` (filled on close), `event_id -> events` (nullable — links time logged against the task up to an event for profitability).
- **`accountability_task_comments`:** `task_id`, `author_id -> profiles`, `body`.
- **`accountability_task_attachments`:** `task_id`, `uploaded_by -> profiles`, `file_path` (in the private `accountability-files` bucket), `file_name`.
- **`accountability_task_activity`:** append-only history — `task_id`, `actor_id -> profiles`, `event_type text` (`created | status_changed | reassigned | outcome_recorded | comment_added | attachment_added`), `detail jsonb`. Written by `security definer` triggers so it can never be skipped by the app.
- **RLS:** admins manage everything; a staff member (`is_staff()`) can act only on rows tied to tasks they own.
- **Used by:** `src/components/accountability`, `src/lib/accountability.ts`, admin/staff views.

#### `staff_rates`
*What it means for the business:* each staff member's hourly cost rate — deliberately kept in its **own admin-only table**, not a column on `profiles`, because `profiles` is readable by every authenticated user (staff included) and Postgres RLS can't hide a single column. Putting rates here is the only way to stop staff seeing each other's pay rate.
- **Migration:** `20260724_time_tracking.sql`.
- **Key columns:** `staff_id uuid PK -> profiles`, `hourly_rate numeric(10,2)`, `updated_by -> profiles`.
- **RLS:** admin-only, no staff access at all.
- **Used by:** `src/views/admin` (finance/profitability calc).

#### `time_entries`
*What it means for the business:* staff time logged against an accountability task — manual hours or a start/stop timer — the input to event profitability and weekly scorecards.
- **Migration:** `20260724_time_tracking.sql`.
- **Key columns:** `staff_id -> profiles`, `task_id -> accountability_tasks`, `hours numeric(6,2)` (null while a timer runs), `entry_date`, `note`, `source text check in (manual,timer)`, `started_at/ended_at`. Unique partial index enforces **at most one running timer per staff member**.
- **RLS:** admin manages all; a staff member can SELECT/INSERT/UPDATE/DELETE only their own entries, and only on tasks they own.
- **Used by:** `src/components/accountability`, admin/staff time-tracking views.

#### `scorecard_targets`, `scorecard_summaries`
*What it means for the business:* weekly performance targets set by an admin for each staff member (manual, or auto-computed from tasks completed / hours logged), rolled up into a Friday summary with a performance score and AI narrative.
- **Migration:** `20260725_weekly_scorecards.sql`.
- **`scorecard_targets`:** `staff_id -> profiles`, `week_start date` (a Monday), `label`, `target_value numeric`, `source text check in (manual,tasks_completed,hours_logged)`, `manual_actual numeric`, `created_by -> profiles`.
- **`scorecard_summaries`:** `staff_id -> profiles`, `week_start`, `performance_score numeric` (0–100), `targets_met/targets_total int`, `narrative text`, `generated_by -> profiles`. Unique per `(staff_id, week_start)`.
- **RLS (notable):** admin manages all; a staff member can SELECT their own targets/summaries, and UPDATE only `manual_actual` on their own `source='manual'` targets — enforced not just by RLS but by a **`before update` trigger** (`scorecard_targets_guard_columns`) that forces every other column back to its old value for non-admins, since RLS alone can't do column-level protection when admin and staff share the same DB role.
- **Used by:** `/api/admin/scorecards`, admin/staff scorecard views.

#### `daily_handovers`, `daily_reports`
*What it means for the business:* every staff member submits a short end-of-day handover (completed today / working on tomorrow / blocked / support needed); an admin can generate an AI-condensed "Sarah's Daily Leadership Report" summarising everyone's handovers for a given day.
- **Migration:** `20260726_daily_handover.sql`.
- **`daily_handovers`:** `staff_id -> profiles`, `handover_date`, `completed_today/working_tomorrow/blocked/support_needed`. Unique per `(staff_id, handover_date)`.
- **`daily_reports`:** `report_date` (unique), `narrative`, `submitted_count/staff_total`, `generated_by -> profiles`.
- **RLS:** `daily_handovers` — admin all; staff SELECT/INSERT/UPDATE only their own (no DELETE). `daily_reports` — **admin-only, staff have zero access** (it aggregates everyone's private handovers).
- **Used by:** `/api/admin/handover/report`, admin/staff handover views.

#### `finance_tasks`, `finance_task_occurrences`
*What it means for the business:* recurring finance obligations (Monthly Management Accounts, VAT Return, Payroll, Cashflow Forecast, …) that auto-escalate through three named contacts (accountant → Finance Director → Sarah) if they go overdue — "the system chases, not Sarah."
- **Migration:** `20260727_finance_tasks.sql`.
- **`finance_tasks`:** `title`, `cadence text check in (monthly,quarterly,annual)`, `due_day int` (1–28), three contact pairs (`accountant/escalation/final _name/_email`), `active bool`, `created_by -> profiles`.
- **`finance_task_occurrences`:** one row per period — `finance_task_id -> finance_tasks`, `period_label` (e.g. `'2026-07'`), `due_date`, `status text check in (pending,completed)`, `completed_at/by -> profiles`, `escalation_level int` (0=none,1=accountant,2=FD,3=final), `last_notified_at`. Unique per `(finance_task_id, period_label)`.
- **RLS:** admin-only on both — no staff/member access at all (finance data).
- **Used by:** `src/lib/automations` (hourly escalation cron), admin finance views.

#### `sops`
*What it means for the business:* the internal Standard Operating Procedures library — "knowledge that doesn't walk out the door." Admins author, staff can read published ones.
- **Migration:** `20260728_sop_library.sql`.
- **Key columns:** `title`, `category text` (default `General`, free text — suggestions like Onboarding/Sponsorship/Events/Finance not enforced), `body text` (sanitized rich-text HTML), `status text check in (draft,published)`, `created_by/updated_by -> profiles`.
- **RLS:** admin manages all incl. drafts; staff (`is_staff()`) can SELECT only `status='published'`. No staff write.
- **Used by:** admin/staff SOP library views.

#### `app_settings`
*What it means for the business:* a generic admin-editable key/value config store (jsonb value) — e.g. enquiry routing rules mapping intent → owner profile, Gmail sync mailbox catalogue.
- **Migration:** `20260615_intro_responses_and_settings.sql`.
- **RLS:** admin manage-all.
- **Used by:** `src/app/api/admin`, cron jobs, enquiries intake (routing lookup), automations, Google integration, Xero.

#### `automation_log`
*What it means for the business:* a run log for the automations cron (`status: sent | failed` per attempted automation action) — used for debugging what the automation engine actually did.
- **Migration:** `20260608_automation_log.sql`.
- **RLS:** admin-only (implied — file not fully quoted above, but follows the same pattern).
- **Used by:** `src/lib/automations`.

---

### 2.11 Xero, Gmail & WhatsApp integrations

#### Xero
No dedicated Xero tables — sync state is columns bolted onto existing tables: `members.xero_contact_id`, `members.xero_spend_pence`/`xero_spend_synced_at` (`20260720_member_xero_spend.sql`), `payments.xero_invoice_id`, `sponsorships.xero_invoice_id`, `concierge_requests.xero_invoice_id`, `introductions.xero_invoice_id`, `reward_referrals.xero_bill_id` (all in `20260719_xero_sync_columns.sql`). Synced via `/api/admin/xero/*` and `src/lib/xero` using the service-role client.

#### `gmail_messages`
*What it means for the business:* every email synced from the connected Gmail inbox (Sarah's), matched to a CRM member by counterpart email — gives every contact a full email history inside the CRM. Unmatched messages surface as "possible new contacts."
- **Migration:** `20260721_gmail_messages.sql`, extended by `20260804_inbox.sql` (`body_html` for the reading pane).
- **Key columns:** `gmail_message_id unique`, `gmail_thread_id`, `direction check in (inbound,outbound)`, `from_email`, `to_emails text[]`, `counterpart_email` (match key), `subject/snippet/body_text/body_html`, `internal_date`, `member_id -> members` (null = unmatched).
- **RLS:** admin-only SELECT (service-role writes via sync cron). Deliberately **not touched** by the newer Unified Inbox feature — the Inbox API enforces per-user mailbox access in application code instead.
- **Used by:** `/api/admin/google/gmail/*`, `src/lib/google`, admin inbox/CRM views.

#### `gmail_extractions`
*What it means for the business:* AI-proposed data extracted from unmatched inbound Gmail messages — potential new contacts or detected introduction opportunities. Recommendation-only; a human reviews and approves (creates an `enquiries` row) or dismisses. Nothing is auto-created.
- **Migration:** `20260721_gmail_extractions.sql`.
- **Key columns:** `gmail_message_id -> gmail_messages`, `kind text check in (new_contact, introduction)`, `payload jsonb`, `status text check in (pending,approved,dismissed)`, `reviewed_by/at -> profiles`. Unique per `(gmail_message_id, kind)`.
- **RLS:** admin-only SELECT.
- **Used by:** `/api/admin/google/gmail/extract(ions)`.

#### `mailbox_access`, `inbox_read_state` (Unified Inbox, Aug 2026)
*What it means for the business:* the Gmail-style unified inbox UI in the CRM. Admins see every configured mailbox by role; every other user (staff) sees only mailboxes explicitly granted to them.
- **Migration:** `20260804_inbox.sql`.
- **`mailbox_access`:** `profile_id -> profiles`, `mailbox text` (an inbox email address), `created_by -> profiles`. Unique per `(profile_id, lower(mailbox))`.
- **`inbox_read_state`:** per-user read tracking keyed by Gmail thread — `(profile_id, gmail_thread_id)` composite PK, `mailbox`, `read_at`. Drives unread-bold styling.
- **RLS:** `mailbox_access` — admin manage-all; a user can read their own grants. `inbox_read_state` — a user manages only their own rows (or admin).
- **NOTE:** written by the untyped service-role client per the migration comment, intentionally absent from `database.ts`.
- **Used by:** `src/lib/inbox`, admin inbox UI.

#### `whatsapp_log`, `whatsapp_contacts`
*What it means for the business:* every WhatsApp message sent/received via the Meta Cloud API, plus a derived per-contact thread list (like an inbox sidebar) kept in sync automatically by a database trigger.
- **Migration:** `20260719_whatsapp_log.sql`, `20260719_whatsapp_contacts.sql`.
- **`whatsapp_log`:** `to_phone`, `direction check in (outbound,inbound)`, `template_name`, `body`, `category`, `status text check in (sent,failed,delivered,read,received)`, `error`, `whatsapp_message_id` (Cloud API `wamid`), `member_id -> members`.
- **`whatsapp_contacts`:** `phone text PK` (= `whatsapp_log.to_phone`), `display_name`, `member_id -> members`, `last_message_at/preview`, `last_direction`, `unread_count int`, `admin_read_at`. Kept current by a `security definer` `after insert` trigger on `whatsapp_log` (`whatsapp_contacts_sync`) — works automatically regardless of whether the write came from the outbound lib or the inbound webhook, no app code change needed.
- **RLS:** `whatsapp_log` — admin read-only. `whatsapp_contacts` — admin all.
- **Used by:** `/api/whatsapp/webhook`, `src/lib/whatsapp`, admin WhatsApp inbox view.

---

### 2.12 AI Operational Agents (Chief of Staff / Website Concierge)

#### `chief_of_staff_reports`
*What it means for the business:* Sarah's daily AI-generated leadership briefing — one row per date, aggregating sections (jsonb) plus a prose narrative summarising the whole business (members, events, sponsorships, finance, tasks) for that day.
- **Migration:** `20260802_chief_of_staff.sql`.
- **Key columns:** `report_date date unique`, `sections jsonb`, `narrative text`, `generated_at`, `generated_by -> profiles`.
- **RLS:** admin-only, no other access.
- **NOTE:** absent from `database.ts` (untyped service-role writer).
- **Used by:** `/api/admin/chief-of-staff/report`, `src/lib/chief-of-staff`.

(`concierge_conversations`, the AI Website Concierge's transcript table, is covered in §2.7.)

---

## 3. Enums & status vocabularies (full list)

### True Postgres enums (`create type ... as enum`)
| Enum | Values | Table.column | Notes |
|---|---|---|---|
| `membership_type` | `individual`, `business`, `partner` (added `20260608`) | `members.membership_type` | Was recreated (not just `ALTER TYPE ADD VALUE`) during `20260617_plan_tier_consolidation.sql` — check current live values if debugging. |
| `membership_tier` | `tier_1`, `tier_2`, `tier_3` | `members.membership_tier` | |
| `membership_status` | `active`, `pending`, `expired`, `cancelled`, `paused` (added `20260608`) | `members.membership_status` | |
| `event_type` | `member_event`, `curated_luxury`, `retreat` | `events.event_type` | |
| `event_status` | `draft`, `published`, `live`, `completed`, `cancelled` | `events.status` | |
| `booking_status` | `confirmed`, `pending`, `cancelled`, `refunded` | `bookings.status` | |
| `intro_status` | `suggested`, `approved`, `sent`, `accepted`, `completed`, `declined`, `scheduled` (added `20260615`) | `introductions.status` | |
| `intro_response` | `pending`, `accepted`, `declined` | `introductions.member_a_response` / `member_b_response` | Added `20260615`, per-side response tracking. |
| `payment_method` | `stripe`, `gocardless`, `invoice`, `manual` | `payments.payment_method`, `bookings.payment_method` | |
| `payment_status` | `paid`, `pending`, `overdue`, `refunded`, `failed` | `payments.status` | |
| `user_role` | `admin`, `member`, `team_member` (added `20260723`), `freelancer` (added `20260723`) | `profiles.role` | Drives `is_admin()`/`is_staff()`. |
| `tag_category` | `industry`, `interest`, `need`, `service` | `tags.category` | |

### Text columns with `CHECK (... IN (...))` vocabularies (not true enums — easier to extend, but must match exactly)
| Table.column | Allowed values | Migration |
|---|---|---|
| `email_templates.category` | `automation`, `campaign`, `transactional` | `20260520_email_template_builder.sql` |
| `email_templates.from_name_type` | `sender`, `fixed` | `20260520_email_template_builder.sql` |
| `template_ai_messages.role` / `contract_ai_messages.role` | `user`, `assistant` | resp. builder migrations |
| `signature_requests.status` | `created`, `sent`, `delivered`, `completed`, `declined`, `voided`, `error` | `20260704_signature_requests.sql` |
| `concierge_requests.status` | `pending`, `assigned`, `sourcing`, `quoted`, `accepted`, `booked`, `delivered`, `feedback`, `declined`, `cancelled` | `20260706_concierge_pipeline.sql` |
| `concierge_requests.priority` | `low`, `medium`, `high` | `20260706_concierge_pipeline.sql` |
| `concierge_requests.commission_status` | `pending`, `paid` | `20260717_commission_tracking.sql` |
| `introductions.commission_status` | `pending`, `paid` | `20260717_commission_tracking.sql` |
| `introductions.deal_status` | `null` (undecided), `won`, `lost` | `20260705_introduction_outcomes.sql` |
| `tasks.status` | `todo`, `in_progress`, `blocked`, `done` | `20260704_tasks_module.sql` |
| `tasks.priority` | `low`, `medium`, `high` | `20260704_tasks_module.sql` |
| `accountability_tasks.status` | `not_started`, `in_progress`, `blocked`, `done` | `20260723_accountability_foundation.sql` |
| `profiles.staff_status` | `active`, `inactive` | `20260723_accountability_foundation.sql` |
| `reward_claims.status` | `claimed`, `redeemed`, `cancelled` | `20260708_rewards_benefits.sql` |
| `reward_referrals.status` | `pending`, `paid` | `20260708_rewards_benefits.sql` |
| `sponsor_deliverables.category` | `asset`, `branding`, `guest_allocation`, `other`, or `null` | `20260718_sponsorship_module.sql` |
| `sponsor_deliverables.status` | `pending`, `received`, `done` | `20260718_sponsorship_module.sql` |
| `sponsor_prospects.source` | `past_sponsor`, `crm_member`, `crm_contact`, `warm_lead`, `cold` | `20260801_sponsorship_intelligence.sql` |
| `sponsor_prospects.temperature` | `warm`, `cold` | `20260801_sponsorship_intelligence.sql` |
| `sponsor_prospects.status` | `suggested`, `shortlisted`, `approved`, `contacted`, `responded`, `won`, `lost`, `dismissed` | `20260801_sponsorship_intelligence.sql` |
| `sponsor_outreach.sender` | `resend`, `instantly` | `20260801_sponsorship_intelligence.sql` |
| `sponsor_outreach.status` | `draft`, `approved`, `scheduled`, `sent`, `failed`, `replied`, `bounced` | `20260801_sponsorship_intelligence.sql` |
| `marketing_campaigns.source_type` | `event`, `topic`, `audio` | `20260723_marketing_engine_foundation.sql` |
| `marketing_campaigns.status` | `draft`, `generating`, `ready`, `archived` | `20260723_marketing_engine_foundation.sql` |
| `marketing_assets.channel` | `seo_blog`, `recap_blog`, `linkedin`, `instagram_feed`, `instagram_carousel`, `instagram_reel`, `newsletter`, `press_release`, `sponsor_recap` | `20260723_marketing_engine_foundation.sql` |
| `marketing_assets.status` | `draft`, `in_review`, `approved`, `scheduled`, `published`, `rejected` | `20260723_marketing_engine_foundation.sql` |
| `marketing_assets.voice` | `club`, `sarah`, or `null` | `20260723_marketing_voices.sql` |
| `marketing_voices.key` | `club`, `sarah` | `20260723_marketing_voices.sql` |
| `marketing_templates.shape` | `square`, `portrait`, `landscape` | `20260725_marketing_templates.sql` |
| `whatsapp_log.direction` | `outbound`, `inbound` | `20260719_whatsapp_log.sql` |
| `whatsapp_log.status` | `sent`, `failed`, `delivered`, `read`, `received` | `20260719_whatsapp_log.sql` |
| `gmail_messages.direction` | `inbound`, `outbound` | `20260721_gmail_messages.sql` |
| `gmail_extractions.kind` | `new_contact`, `introduction` | `20260721_gmail_extractions.sql` |
| `gmail_extractions.status` | `pending`, `approved`, `dismissed` | `20260721_gmail_extractions.sql` |
| `bookings.attendance` | `attended`, `no_show`, or `null` | `20260717_event_automation.sql` |
| `time_entries.source` | `manual`, `timer` | `20260724_time_tracking.sql` |
| `scorecard_targets.source` | `manual`, `tasks_completed`, `hours_logged` | `20260725_weekly_scorecards.sql` |
| `finance_tasks.cadence` | `monthly`, `quarterly`, `annual` | `20260727_finance_tasks.sql` |
| `finance_task_occurrences.status` | `pending`, `completed` | `20260727_finance_tasks.sql` |
| `sops.status` | `draft`, `published` | `20260728_sop_library.sql` |
| `hero_slides.media_type` | `image`, `video` | `20260619_hero_slides_cms_columns.sql` |
| `membership_applications.track` | `membership`, `pitch` | `20260608_application_due_diligence.sql` |

### Free-text status columns with no CHECK constraint (convention only — verify current usages in code before assuming exhaustiveness)
- `enquiries.status` — seen: `new`, plus admin-set values; also `enquiries.status` reused in status filters elsewhere.
- `sponsorships.status` — free text, default `pending`.
- `communications.status` — free text, default `draft`.
- `email_campaigns.status` — free text, default `draft`.
- `event_invitations.status` — free text, default `invited` (flips to confirmed on booking).
- `automation_log.status` — `sent` | `failed` (by convention, not enforced).
- `membership_applications.status` — free text, default `pending` (application review states like approved/rejected are set by admin routes, not DB-enforced).

---

## 4. RLS policies — summary by access tier

**Tier 1 — Admin-only, no exceptions** (staff/members/anon get zero access):
`chief_of_staff_reports`, `concierge_conversations`, `daily_reports`, `finance_tasks`, `finance_task_occurrences`, `marketing_campaigns`, `marketing_assets`, `marketing_voices`, `marketing_segments`, `marketing_templates`, `sponsor_prospects`, `sponsor_decision_makers`, `sponsor_outreach`, `sponsor_deliverables`, `sponsor_comms_sent`, `event_comms_sent`, `member_comms_sent`, `member_documents`, `signature_requests`, `contract_templates`, `contract_ai_chats`, `contract_ai_messages`, `tasks`, `task_comments`, `event_expenses`, `event_profitability`, `staff_rates`, `email_campaigns`, `audiences`, `audience_members`, `gmail_messages`, `gmail_extractions`, `whatsapp_log` (admin read), `app_settings`, `event_invitations`, `sops` (staff read published only).

**Tier 2 — Admin-all + owner-can-read-own** (member sees only their own rows):
`bookings`, `payments`, `sponsorships`, `communications`, `introductions`, `concierge_requests`, `reward_claims`, `reward_referrals`.

**Tier 3 — Admin-all + owner-can-read/write-own** (member manages their own):
`profiles` (update own), `members` (update own), `member_tags` (insert/delete own).

**Tier 4 — Admin-all + staff-owns-their-work** (`is_staff()`):
`accountability_tasks`/comments/attachments/activity (owner staff only), `time_entries` (own entries, own tasks only), `scorecard_targets` (read own; update only `manual_actual` on own manual targets, column-guarded by trigger), `scorecard_summaries` (read own), `daily_handovers` (own, no delete), `mailbox_access`/`inbox_read_state` (own grants/read-state).

**Tier 5 — Public read (anon), admin write:**
`hero_slides`, `partner_logos`, `testimonials`, `galleries`, `gallery_photos`, `curated_experiences`, `video_gallery`, `documents`, `membership_benefits`, `membership_comparison`, `membership_plans` (active only), `instagram_settings`/`instagram_posts` (active only), `events` (published/live/completed — anon AND authenticated), `reward_partners`/`reward_offers` (active).

**Tier 6 — Public insert (anon), admin/service-role manages the rest:**
`mailing_list`, `enquiries`, `membership_applications`, `reviews` (insert constrained to `status='pending', is_active=true`).

**Tier 7 — Token/session-gated, not RLS-based at all:**
Sponsor Portal (`/api/sponsor/[token]/*`) and the AI Website Concierge (`/api/concierge/chat`) are public-facing but use the **service-role client** server-side, keyed by an opaque token (`sponsorships.booking_token`) or session (`concierge_conversations.session_token`) validated in application code — RLS on the underlying tables stays admin-only throughout; the "auth" is entirely at the API layer.

---

## 5. Storage buckets

| Bucket | Public? | Purpose | Access policy |
|---|---|---|---|
| `content` | public (implied, pre-existing) | General public site assets (heroes, gallery images); the `applicants/` folder inside it is opened for anonymous applicant photo uploads. | Public insert+read scoped to `applicants/` prefix (`20260525_applicant_photos_storage_policy.sql`); everything else in the bucket is admin-only by omission. |
| `member-documents` | **private** | Member document vault (onboarding, NDAs, signed contracts). | Admin-only read/write/update/delete; access is via short-lived signed URLs. |
| `sponsor-assets` | **private** | Files a sponsor uploads through their token-gated portal. | Admin-only read/write/update/delete (sponsors write via service-role, bypassing policy). |
| `accountability-files` | **private** | Attachments on Team Accountability tasks. | Same admin-scoped model as the accountability tables (staff access to their own tasks' attachments is enforced in the table RLS, not shown fully here — check `20260723_accountability_foundation.sql` for the object policies if extending). |
| `social-graphics` | **public** | Rendered PNG social graphics from the marketing template builder. | Public read (graphics get posted to social anyway); admin-only write/update/delete. |

---

## 6. Views, RPC functions & triggers

**No SQL `VIEW`s exist anywhere in the migrations** — everything is a plain table.

### Functions
| Function | Type | Purpose |
|---|---|---|
| `public.is_admin()` | `security definer stable` | `true` if the current `auth.uid()`'s `profiles.role = 'admin'`. The backbone of almost every RLS policy in the database. |
| `public.is_staff()` | `security definer stable` | `true` if `profiles.role in ('team_member','freelancer')`. Used for the Team Accountability module. |
| `public.handle_new_user()` | trigger fn, `security definer` | Auto-creates a `profiles` row when a new `auth.users` row is inserted (on signup). |
| `public.handle_updated_at()` | trigger fn | Generic `before update` — bumps `updated_at = now()`. Reused by most tables added after the initial schema (rather than each table defining its own). |
| `public.touch_membership_benefits()`, `public.tg_signature_requests_touch()`, `public.tg_contract_templates_touch()`, `public.tg_tasks_touch()`, `public.email_templates_touch_updated_at()`, `public.template_ai_messages_touch_chat()` | trigger fns | Module-local `updated_at`/parent-touch triggers, functionally identical to `handle_updated_at()` but kept self-contained per module (a deliberate "don't touch shared code" pattern visible across migrations). |
| `public.whatsapp_contacts_sync()` | trigger fn, `security definer` | On every `whatsapp_log` insert, upserts the matching `whatsapp_contacts` row (thread preview, unread count) — works regardless of whether the insert came from the outbound lib or the inbound webhook. |
| `public.scorecard_targets_guard_columns()` | trigger fn | Column-level write guard: for non-admins, forces every column except `manual_actual` (and only when `source='manual'`) back to its old value on UPDATE — the mechanism that gives column-level protection RLS alone cannot express. |

### Triggers (selected, by table)
- `on_auth_user_created` (`auth.users` after insert) → `handle_new_user()`.
- `set_updated_at` before update, on: `profiles`, `members`, `tags`, `events`, `bookings`, `introductions`, `payments`, `sponsorships`, `communications`, `concierge_requests`, `event_expenses`, `sponsor_prospects`, `sponsor_outreach`, `staff_rates`, `time_entries`, `event_profitability`, `accountability_tasks`, `finance_tasks`, `finance_task_occurrences`, `daily_handovers`, `sops`, `chief_of_staff_reports`, `marketing_campaigns`, `marketing_segments`, `marketing_voices`, `marketing_templates`, `concierge_conversations` — all → `handle_updated_at()`.
- `membership_benefits_touch`, `trg_signature_requests_updated_at`, `trg_contract_templates_updated_at`, `trg_contract_ai_chats_updated_at`, `trg_tasks_updated_at`, `email_templates_touch_updated_at_trigger`, `template_ai_messages_touch_chat_trigger` — module-local equivalents of the above.
- `whatsapp_contacts_sync_trg` (`whatsapp_log` after insert) → `whatsapp_contacts_sync()`.
- `scorecard_targets_guard` (`scorecard_targets` before update) → `scorecard_targets_guard_columns()`.
- Accountability activity-logging triggers exist on `accountability_tasks`/comments/attachments (writing to `accountability_task_activity`) — see `20260723_accountability_foundation.sql` for the exact trigger names/bodies if modifying that module.

---

## 7. Discrepancies: code vs. migrations vs. generated types

**Tables used in app code (`.from(...)`) and present in migrations, but MISSING from `src/types/database.ts`** (12 tables — the generated types file is stale, not regenerated after several later migrations):
`chief_of_staff_reports`, `concierge_conversations`, `inbox_read_state`, `mailbox_access`, `marketing_assets`, `marketing_campaigns`, `marketing_segments`, `marketing_templates`, `marketing_voices`, `sponsor_decision_makers`, `sponsor_outreach`, `sponsor_prospects`.

This is **partly deliberate**: the migrations for `chief_of_staff_reports`, `concierge_conversations`, `inbox_read_state`, and `mailbox_access` explicitly say they're "written by the untyped service-role client... intentionally absent from src/types/database.ts." The marketing-engine and sponsorship-intelligence tables have no such disclaimer — those look like the types file simply wasn't regenerated after those features shipped. **Practical implication for anyone writing code against these 12 tables:** `.from('table_name')` calls on them lose TypeScript type-checking/autocomplete; there's no `supabase gen types` script wired into `package.json`, so this won't self-heal — it needs a manual `supabase gen types typescript` run against the live schema.

**Tables in migrations but never referenced by `.from()` in `src`:** `membership_tiers` (created in `20260507_stripe_subscriptions.sql`) — appears superseded by `membership_plans` and looks unused by current app code, though it still physically exists.

**No tables referenced by app code are missing from the migration files** — every one of the 79 `.from()` table names traces to a `create table` in `supabase/migrations/`.

**Reminder on ledger drift:** several migrations (`20260605_pending_charge_applications.sql`, `20260617_schema_drift_catchup.sql`) explicitly document that columns/tables were added to the live database "out-of-band" (via the Supabase dashboard or ad-hoc SQL) before being retroactively captured in a migration file — so this migrations folder is a *reconstruction* of the live schema in places, not a guaranteed original source. `scripts/apply-*.mjs` (accountability, daily-handover, finance-tasks, scorecards, sop-library, time-tracking) push migration SQL straight to the live project via the Supabase Management API rather than the CLI's migration tracking, which is consistent with this drift pattern.

---

## 8. Seed / one-off scripts (non-schema)

`scripts/seed-data.sql`, `scripts/seed-fix.sql` — demo-data population/correction (fake member companies/bios, tier distribution fixes) for local/dev use; no schema changes.
`scripts/seed-*.mjs` (about-videos, event-galleries, events, hero-extras, galleries, placeholder-testimonials, private-events, sarah-admin, users) — Node scripts that INSERT rows into the CMS/content tables above via the JS client; no DDL.
`scripts/apply-*-migration.mjs` — one-off scripts that read a migration `.sql` file and POST it to the Supabase Management API (`PROJECT_REF = owjnsljovmaaxgxpxxtw`) using `SUPABASE_ACCESS_TOKEN` from `.env.local`, bypassing `supabase db push`. This is *why* the migrations ledger can't be trusted as 100% authoritative for what's live.
`scripts/backfill-member-stripe.mjs`, `scripts/migrate-membership-plans.mjs`, `scripts/migrate-hero-cms.mjs`, `scripts/check-tiers.mjs`, `scripts/check-video-gallery.mjs`, `scripts/verify-events-data.mjs`, `scripts/verify-supabase.mjs` — data backfill/verification utilities, no schema changes.
`scripts/provision-dev-accounts.mjs`, `scripts/provision-stripe-tiers.py`, `scripts/push-supabase-auth-config.mjs`, `scripts/seed-users.sh` — environment/account provisioning, not schema.
