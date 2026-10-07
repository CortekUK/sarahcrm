# API Route Map — The Club by Sarah Restrick (src/app/api)

Exhaustive map of every `route.ts` under `src/app/api` (~100 files). Grouped by area. Unless
noted otherwise, every admin route uses the pattern: `createClient()` (Supabase session) →
`auth.getUser()` → look up `profiles.role === 'admin'` → 401/403 on failure, then a
service-role Supabase client (`SUPABASE_SERVICE_ROLE_KEY`) for the actual reads/writes. Most
routes declare `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`;
deviations are called out per-route.

---

## 1. Admin — Core (applications, bookings, campaigns, chief-of-staff, DocuSign consent, enquiries, handover, inbox, integrations, introductions)

| Path | Methods | Purpose | Auth |
|---|---|---|---|
| `src/app/api/admin/applications/approve/route.ts` | POST | Approve a membership application: charge saved card (pending-charge flow), create/link auth user + profile, create/reactivate `members` row, carry over interests as tags, mark application approved | Admin |
| `src/app/api/admin/applications/reject/route.ts` | POST | Reject an application; cancel Stripe subscription, refund initial payment (or detach saved card if never charged), email applicant, mark rejected | Admin |
| `src/app/api/admin/bookings/decision/route.ts` | POST | Approve/reject a pending event booking whose card was only held; approve charges the held card and confirms, reject cancels and releases the card | Admin |
| `src/app/api/admin/campaigns/send/route.ts` | POST | Send a saved email template to all active subscribers, a static audience, or a rule-based segment; records send as `email_campaigns` history regardless of outcome | Admin |
| `src/app/api/admin/chief-of-staff/report/route.ts` | GET, POST | AI Chief of Staff daily briefing: POST (re)generates today's report via OpenAI (deterministic fallback), GET reads today's/latest/specific-date report | Admin |
| `src/app/api/admin/docusign/consent/route.ts` | GET | Redirect target for DocuSign's one-time JWT consent grant; shows a static branded confirmation/denial page | Public (DocuSign redirect target, no session check) |
| `src/app/api/admin/enquiries/enrich/route.ts` | POST | Manually (re-)run enrichment (Clay-backed) on a single public-contact-form enquiry — the only way enquiries get enriched | Admin |
| `src/app/api/admin/enquiries/reply/route.ts` | POST | Send an in-app branded reply to an enquiry via Resend and mark it replied | Admin |
| `src/app/api/admin/handover/report/route.ts` | POST | Generate/regenerate "Sarah's Daily Leadership Report" for a date from staff daily handovers, via OpenAI (templated fallback) | Admin |
| `src/app/api/admin/inbox/access/route.ts` | GET, POST | Manage-access UI for inbox mailbox grants: GET lists grantable CRM users/catalog/grants, POST grants or revokes a mailbox for a user | Admin (double-gated: inbox access + admin role) |
| `src/app/api/admin/inbox/mailboxes/route.ts` | GET | List the caller's readable inboxes for the account switcher | Any user with inbox access (admin sees all) |
| `src/app/api/admin/inbox/thread/[threadId]/route.ts` | GET | Full message feed for one Gmail thread (oldest-first); lazily fetches/sanitizes/persists rich HTML; marks thread read for caller | Any user with inbox access (mailbox-filtered) |
| `src/app/api/admin/inbox/threads/route.ts` | GET | Thread-level inbox listing with pagination/search/unread, mailbox-access enforced server-side via `inbox_thread_list` RPC | Any user with inbox access (mailbox-filtered) |
| `src/app/api/admin/integrations/status/route.ts` | GET | Report real connection status (credential presence only, never values) for Stripe, GoCardless, Xero, Resend for Settings → Integrations cards | Admin |
| `src/app/api/admin/introductions/create/route.ts` | POST | Approve a suggested match or promote a member-requested introduction to `approved`; returns paired member detail for the Review & Send composer | Admin |
| `src/app/api/admin/introductions/generate-suggestions/route.ts` | POST | Run deterministic tag-matching engine across all active members and insert new `suggested` introduction rows (never emails, never re-suggests existing pairs) | Admin |
| `src/app/api/admin/introductions/reject/route.ts` | POST | Decline an introduction (mark `declined`, store internal note), optionally email the requester a polite decline note | Admin |
| `src/app/api/admin/introductions/send/route.ts` | POST | Per-recipient introduction email sender: for each side (a/b) send now, schedule for a date, or skip; tracks quota usage against monthly intro allowance | Admin |
| `src/app/api/admin/introductions/why/route.ts` | POST | AI-generated explanation (OpenAI structured output) of why two members are a good introduction match, grounded in each member's profile facts | Admin |

### Notes

**`applications/approve`** (POST) — Body: `{ application_id, tier?: 'tier_1'|'tier_2'|'tier_3', send_invite? (default true) }`. Response: `{ ok, member_id, profile_id, tier, membership_type, invite_sent, stripe_linked }` or `{ error, charge_failed? }` (402 on card decline). External: Stripe (create price + subscription, off-session charge), Supabase Auth Admin (createUser/invite), Resend (`sendInviteEmail`). Tables: `membership_applications` (r/u), `membership_plans` (r), `profiles` (r/u), `members` (r/i/u), `payments` (r/i), `bookings` (u — link guest bookings by email), `tags` (r/i), `member_tags` (r/i).

**`applications/reject`** (POST) — Body: `{ application_id, reason? }`. Response: `{ ok, application_id, refund_id, refund_amount_pence, refund_attempted, subscription_cancelled, refund_error, email_sent, email_error }`. External: Stripe (cancel subscription, multi-path refund lookup across latest_invoice/invoices.list/paymentIntents.list, detach payment method), Resend (`sendClubEmail`). Tables: `membership_applications` (r/u).

**`bookings/decision`** (POST) — Body: `{ booking_id, action: 'approve'|'reject' }`. Response: `{ ok, status:'cancelled' }` or `{ ok, status:'confirmed', charged }`. External: Stripe (detach PM on reject; retrieve customer, create+confirm off-session PaymentIntent on approve), Resend. Tables: `bookings` (r/u), `events`/`members`/`profiles` (r, joined), `payments` (r/i idempotent on payment_intent id).

**`campaigns/send`** (POST) — Body: `{ template_id, audience_id?, segment?: { segment_id?, rules? } }`. Response: `{ ok, delivered, campaign_id, recipient_count, sent_count, reason?, error? }`. External: Resend batch API (`/emails/batch`, chunks of 90). Tables: `email_templates` (r), `mailing_list` (r), `audiences`/`audience_members` (r), `members`+`profiles` (r), `marketing_segments` (r), `email_campaigns` (i/u). Falls back to `status:'draft'` (still 200) if Resend/from-email not configured.

**`chief-of-staff/report`** (GET/POST) — POST: no body (implicit today, Europe/London tz) → `{ ok, report }`. GET: `?date=YYYY-MM-DD` optional → `{ report }`. External: OpenAI chat completions (deterministic fallback on error/no key — same lib the daily cron uses). Tables: `chief_of_staff_reports` (r/upsert). `maxDuration=60`.

**`docusign/consent`** (GET) — Query: `?code=` or `?error=` from DocuSign's redirect. Returns static HTML confirmation/denial page; no DB writes (JWT grant flow doesn't need the code). No auth check — this IS the OAuth redirect target.

**`enquiries/enrich`** (POST) — Body: `{ enquiryId }`. Response: `{ ok, status }`, or HTTP 502 `{ error, status:'failed' }` when the provider failed (e.g. Clay search error / quota used up — the row is marked `failed`). `maxDuration = 60`. External: Clay Public Search API (via `enrichEnquiry`) — one company search by domain, plus one person search when first+last name are known; spends Clay search quota. Tables: `enquiries` (r/u, inside lib).

**`enquiries/reply`** (POST) — Body: `{ enquiry_id, subject, body }`. Response: `{ ok, replied_at }` or `{ ok:true, warning }`. External: Resend (`sendClubEmail`, category `enquiry_reply`). Tables: `enquiries` (r/u).

**`handover/report`** (POST) — Body: `{ report_date: 'YYYY-MM-DD' }`. Response: `{ ok, report }` (400 if no handovers submitted for that date yet). External: OpenAI (gpt-4o default, templated fallback). Tables: `profiles` (r, active team_member/freelancer staff), `daily_handovers` (r), `daily_reports` (upsert on report_date).

**`inbox/access`** (GET/POST) — GET → `{ users, catalog, grants }`. POST body: `{ action:'grant'|'revoke', profile_id, mailbox }` → `{ ok:true }`. Tables: `profiles` (r), inbox grant table via `lib/inbox/access`. Auth double-gated: `requireInboxAccess()` then explicit `role==='admin'`.

**`inbox/mailboxes`** (GET) — Response: `{ mailboxes:[{email,label}], is_admin }`. Auth via `requireInboxAccess()` — admin sees all enabled catalog inboxes, others see granted ∩ enabled.

**`inbox/thread/[threadId]`** (GET) — Response: `{ messages:[...], subject }` (403 if no accessible rows, 404 if empty). External: Gmail API (`getMessageHtml`, lazy HTML fetch, impersonating the mailbox). Tables: `gmail_messages` (r/u body_html), `inbox_read_state` (upsert).

**`inbox/threads`** (GET) — Query: `?mailbox=all|<email>&q=&includeNoise=0|1&limit=30&offset=0`. Response: `{ threads:[...], nextOffset }` (403 if mailbox not allowed). Tables: via `inbox_thread_list` Postgres RPC (reads `gmail_messages`/threads + read-state).

**`integrations/status`** (GET) — Response: `{ stripe, gocardless, xero, resend }` each `{connected, detail}` — presence-only. Tables: `app_settings` (r, key `xero_oauth`). Env checked: `STRIPE_SECRET_KEY`, `GOCARDLESS_ACCESS_TOKEN`/`GC_ACCESS_TOKEN`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`/`FROM_EMAIL`.

**`introductions/create`** (POST) — Body: `{ introduction_id? }` or `{ target_member_id, match_member_id, match_score?, match_reason?, matching_tags?[] }`. Response: `{ introduction_id, member_a, member_b, state }`. Tables: `introductions` (r/i/u), `members`+`profiles` (r, joined).

**`introductions/generate-suggestions`** (POST, no body) — Response: `{ created, skipped }`. Deterministic tag-matching engine (`lib/introductions/suggest`), MIN_SCORE=0.5, cap 20, dedupes against all existing pairs of any status; recommend-only, no email sent. Tables: `members` (r), `member_tags`+`tags` (r), `introductions` (r/i as `status='suggested'`).

**`introductions/reject`** (POST) — Body: `{ introduction_id, note?, notify?, message? }`. Response: `{ ok, status:'declined', emailed }`. External: Resend (only if `notify:true`). Tables: `introductions` (r/u).

**`introductions/send`** (POST) — Body: `{ introduction_id, a?:{action:'now'|'schedule'|'skip',date?,subject?,body?}, b?:{...} }`. Response: `{ ok, results:{a,b}, status, quotaWarning }`. External: Resend (category `introduction`). Tables: `introductions` (r/u per-side), `members` (r/u — `intros_used_this_month` quota), `profiles` (r).

**`introductions/why`** (POST) — Body: `{ member_id, other_id }`. Response: `{ reasoning:{summary,points[]}, target, other }` (500 no key, 502 AI failure). External: OpenAI structured JSON schema `match_reasoning`, model `OPENAI_MODEL_TEMPLATE_AI`/`OPENAI_MODEL`/default gpt-4o. Tables: `members` (r, joined `profiles`).

---

## 2. Admin — Marketing, Templates & Contract Generation

| Path | Methods | Purpose | Auth |
|---|---|---|---|
| `src/app/api/admin/marketing/assets/[id]/route.ts` | PATCH | Save/approve/reject/in-review a marketing asset; approve publishes via adapter | Admin |
| `src/app/api/admin/marketing/campaigns/[id]/route.ts` | GET | Fetch one marketing campaign + its assets | Admin |
| `src/app/api/admin/marketing/campaigns/route.ts` | GET, POST | List campaigns (+asset counts); create a campaign source record | Admin |
| `src/app/api/admin/marketing/generate/route.ts` | POST | Generate marketing content (text channels, LinkedIn fan-out, newsletter, graphics assignment) from a campaign source | Admin |
| `src/app/api/admin/marketing/graphics/preview/route.ts` | GET | Live PNG preview of a template graphic | Admin |
| `src/app/api/admin/marketing/graphics/render/route.ts` | POST | Render template+values to PNG, upload to storage, return public URL | Admin |
| `src/app/api/admin/marketing/library/[id]/reuse/route.ts` | POST | Clone a finished library asset into a fresh topic campaign | Admin |
| `src/app/api/admin/marketing/library/route.ts` | GET | Search/filter the library of finished (approved/published/designer-linked) assets | Admin |
| `src/app/api/admin/marketing/segments/preview/route.ts` | POST | Live count + sample of members matching segment rules | Admin |
| `src/app/api/admin/marketing/segments/route.ts` | GET, POST, PATCH, DELETE | CRUD for saved audience segments | Admin |
| `src/app/api/admin/marketing/templates/route.ts` | GET, POST, PATCH, DELETE | CRUD for graphic template layouts (slots/background/shape) | Admin |
| `src/app/api/admin/marketing/transcribe/route.ts` | POST | Transcribe uploaded audio (Whisper) to text for campaign source | Admin |
| `src/app/api/admin/marketing/voices/route.ts` | GET, PATCH, PUT | Manage brand-voice guidance/samples (club, sarah) | Admin |
| `src/app/api/templates/ai-chats/[id]/route.ts` | GET, DELETE | Fetch/delete one AI email-template chat + its messages | Admin (own chat only) |
| `src/app/api/templates/ai-chats/route.ts` | GET | List current admin's AI template chats, optional `template_id` filter | Admin (own rows) |
| `src/app/api/templates/ai-generate/route.ts` | POST | AI chat/build/enhance loop for the email template builder canvas | Admin |
| `src/app/api/templates/send-test/route.ts` | POST | Send a test render of an in-progress template to the logged-in user | Any authenticated user (self-send) |
| `src/app/api/contracts/ai-generate/route.ts` | POST | AI chat/build/enhance loop for the contract/e-sign document builder canvas | Admin |
| `src/app/api/communications/send-template/route.ts` | POST | Bulk-send a saved email template to resolved recipients, merge-tag substituted | Admin |

### Notes

**`marketing/assets/[id]`** (PATCH) — Body: `{ action:'save'|'approve'|'reject'|'in_review', title?, body?, graphic_url?, slot_values?, template_id? }`. Response: `{ asset }`. Approve is the sole human publish gate: non-newsletter channels call `getPublisher(channel).publish()` (mock adapter today), stamp `status='published'`, `published_at`, `publish_target`; newsletter approval is rejected here (400, handled by email designer instead). Tables: `marketing_assets` (r/u).

**`marketing/campaigns/[id]`** (GET) — Response: `{ campaign, assets:[] }`. Tables: `marketing_campaigns`, `marketing_assets` (r).

**`marketing/campaigns`** (GET/POST) — GET → `{ campaigns:[...with asset_count] }` (last 100). POST body: `{ title, source_type:'event'|'topic'|'audio', event_id?, topic_brief?, transcript?, audio_url? }` → inserts `marketing_campaigns` row (`status='draft'`); does not generate assets. Response: `{ campaign }` (201).

**`marketing/generate`** (POST) — Body: `{ campaign_id, channels[], regenerate_asset_id?, default_voice?, template_id?, graphic_mode? }`. Text channels (seo_blog, recap_blog, instagram_feed/carousel/reel, press_release, sponsor_recap): one structured OpenAI call per channel (json_schema, temp 0.6). LinkedIn: separate call producing 4 variants (voice_club, voice_sarah, sponsor, founder_spotlight, temp 0.7). Newsletter: delegates to `generateNewsletterDraft` → upserts `email_templates` (category='campaign', is_draft). Graphics: best-effort slot_values assignment via `marketing_templates`, never renders image here unless mode='none' skips it. Marks campaign `status='ready'`. Response: `{ assets:[...] }`. Tables: `marketing_campaigns`, `marketing_assets`, `events`, `bookings`, `sponsorships`, `members`, `marketing_voices`, `email_templates`, `marketing_templates`. External: OpenAI.

**`marketing/graphics/preview`** (GET) — Query: `state` (base64url JSON `{template,values,shape}`) or `template_id`. Renders via `next/og` `ImageResponse`/satori. Response: `image/png`. Reads `marketing_templates` if `template_id` given; no writes.

**`marketing/graphics/render`** (POST) — Body: `{ template_id?, template?, values, shape? }`. Renders PNG, uploads to public Storage bucket `social-graphics`. Response: `{ graphic_url, path }`.

**`marketing/library/[id]/reuse`** (POST) — Reads source `marketing_assets` (read-only). Creates new `marketing_campaigns` row (`source_type='topic'`, seeded from original) + new draft `marketing_assets` row. Response: `{ campaign_id }` (201).

**`marketing/library`** (GET) — Query: `channel, voice, event_id, sponsor_member_id, member_id, q`. Filter: `status in (approved,published) OR email_template_id is not null`. Response: `{ items, facets:{events,sponsors,channels,voices} }`. Tables: `marketing_assets`, `events`, `members`, `marketing_campaigns` (all read-only).

**`marketing/segments/preview`** (POST) — Body: `{ rules }` or `{ segment_id }` (Zod-validated: tiers, statuses, types, tag_ids, tag_match). Response: `{ count, sample:[{name,email}] }` (first 8). Tables: `marketing_segments` (r if segment_id).

**`marketing/segments`** (GET/POST/PATCH/DELETE) — GET → `{ segments }`. POST `{ name, rules }` → insert → `{ segment }`. PATCH `{ id, name?, rules? }` → update → `{ segment }`. DELETE `?id=` → `{ ok:true }`. Tables: `marketing_segments`.

**`marketing/templates`** (GET/POST/PATCH/DELETE) — Zod schemas for slots (photo/heading/subtext/fixed, zone, align, text_source, style) and background (color/photo). GET → `{ templates }`. POST → insert → `{ template }`. PATCH (body has `id`) → update → `{ template }`. DELETE `?id=` → `{ ok }`. Tables: `marketing_templates`.

**`marketing/transcribe`** (POST, multipart `file`, max 25MB) — OpenAI Whisper (`audio.transcriptions.create`, `whisper-1`). Response: `{ transcript }`.

**`marketing/voices`** (GET/PATCH/PUT) — GET → `{ voices:[club, sarah] }`. PATCH/PUT body: `{ key:'club'|'sarah', name?, guidance?, samples?:[{label,text}] }` → updates row keyed by `key`. Response: `{ voice }` (404 if key not found). Tables: `marketing_voices`.

**`templates/ai-chats/[id]`** (GET/DELETE) — GET → `{ chat, messages }` scoped to the owning admin (`chat.user_id === profile.id`, else 404). DELETE scoped the same way → `{ ok:true }`. Tables: `template_ai_chats`, `template_ai_messages`.

**`templates/ai-chats`** (GET) — Query: `template_id?`. Response: `{ chats }` scoped to `user_id = profile.id`, limit 50. Tables: `template_ai_chats`.

**`templates/ai-generate`** (POST) — Body: `{ prompt, mode:'create'|'enhance', category?, existingBlocks?, existingSubject?, existingTheme?, chat_id?, attachments?, template_id? }`. Structured OpenAI call (json_schema) returns `{ intent, reply, name, subject, preheader, blocks, theme, event_picks }`; fetches upcoming published events as selectable context; supports image/text attachments. Persists chat turns. Response: `{ intent, reply, name, subject, preheader, blocks, theme, chat_id, event_picks }`. Tables: `events` (r), `template_ai_chats`, `template_ai_messages` (i/r).

**`templates/send-test`** (POST) — Body: `{ blocks, subject, theme }`. Renders via `renderBlocksToHTML` + `replaceMergeTags` with sample data + logged-in user's own profile as sender. Sends to caller's own email via Resend, subject prefixed `[TEST]`. Response: `{ success, sent_to, resend_id }`. Auth: any authenticated user (not gated to admin role in this file). Tables: `profiles` (r, sender fields only).

**`contracts/ai-generate`** (POST) — Body: `{ prompt, mode:'create'|'enhance', docType?, existingBlocks?, existingTheme?, chat_id?, contract_id? }`. Contract-focused system prompt (agreements/NDAs), injects DocuSign signature tokens (`[[signature]]`, `[[initials]]`, `[[signed_name]]`, `[[date_signed]]`) + member merge tags. OpenAI json_schema, temp 0.4. Persists to `contract_ai_chats`/`contract_ai_messages`. Response: `{ intent, reply, name, blocks, theme, chat_id }`.

**`communications/send-template`** (POST) — Body: `{ template_id, recipients:{kind:'all_active'}|{kind:'member_ids',ids}|{kind:'event_attendees',event_id}, event_id?, introduction_id?, dry_run? }`. Resolves recipients (hard cap 500); per-recipient merge-tag substitution + Resend send (skipped if dry_run), 120ms rate-limit sleep between sends. Logs to both `communications` and `email_log`. Response: `{ sent, failed, skipped, total, errors, preview, dry_run }`. Tables: `email_templates`, `members`, `profiles` (joined), `events`, `introductions`, `bookings`, `communications` (i), `email_log` (i).

---

## 3. Admin — Members, Team & Signatures (DocuSign)

| Path | Methods | Purpose | Auth |
|---|---|---|---|
| `src/app/api/admin/members/[id]/suggest-tags/route.ts` | POST | AI-suggested relationship-intelligence tags for a member, picked only from the existing tag vocabulary | Admin |
| `src/app/api/admin/members/add-rep/route.ts` | POST | Add a representative (portal login) to a business/partner membership, billed under the parent | Admin |
| `src/app/api/admin/members/cancel/route.ts` | POST | Cancel a membership: sets status, cancels Stripe sub at period-end, signs out sessions | Admin |
| `src/app/api/admin/members/create/route.ts` | POST | Manually provision a member (non-application path) with auth user, profile, members row, tags | Admin |
| `src/app/api/admin/members/delete/route.ts` | POST | Hard-delete a member (cascades via auth.users delete); cancels Stripe immediately; falls back to soft delete | Admin |
| `src/app/api/admin/members/enrich/route.ts` | POST | Manually (re-)run best-effort company data enrichment (Clay) for one member, filling gaps only | Admin |
| `src/app/api/admin/members/import/route.ts` | POST | Bulk CSV-based member onboarding (rows already parsed client-side), idempotent per email | Admin |
| `src/app/api/admin/members/recompute-scores/route.ts` | POST | Recompute relationship/churn/engagement scores for one or all active members | Admin |
| `src/app/api/admin/members/resend-invite/route.ts` | POST | Re-send portal login credentials (branded email) to an existing member | Admin |
| `src/app/api/admin/members/success/route.ts` | GET | Member Success dashboard data: active members with churn/renewal/engagement/upgrade flags | Admin |
| `src/app/api/admin/revalidate/route.ts` | POST | Flush Next.js ISR cache for given paths after admin content edits | Admin |
| `src/app/api/admin/scorecards/summary/route.ts` | POST | Generate/regenerate a staff member's weekly scorecard summary + AI narrative | Admin |
| `src/app/api/admin/team/create/route.ts` | POST | Provision a staff (team_member/freelancer) login for the Accountability system | Admin |
| `src/app/api/admin/team/resend-invite/route.ts` | POST | Re-send staff login credentials to an existing team member/freelancer | Admin |
| `src/app/api/admin/signatures/send/route.ts` | POST | Send a document (contract HTML or PDF) to a member for e-signature via DocuSign | Admin |
| `src/app/api/admin/signatures/status/route.ts` | POST | Poll DocuSign for envelope status, sync `signature_requests`, file signed PDF to vault | Admin |
| `src/app/api/admin/signatures/view/route.ts` | GET | Stream the current (sent or signed) combined PDF of a DocuSign envelope inline | Admin |
| `src/app/api/admin/signatures/void/route.ts` | POST | Cancel/void a sent DocuSign envelope and mark the request row voided | Admin |
| `src/app/api/check-member-email/route.ts` | POST | Check whether an email already has an account, to block duplicate membership applications | Public (uses service role internally) |

All routes: `runtime='nodejs'`, `dynamic='force-dynamic'`. No `maxDuration` overrides.

### Notes

**`members/[id]/suggest-tags`** (POST) — Path param `id`; no body. Response: `{ suggestions:[{tag_id,name,category,reason}] }` (cap 6) or `{ suggestions:[], note }`. External: OpenAI (json_schema structured output, model `OPENAI_MODEL_TEMPLATE_AI`/`OPENAI_MODEL`/default gpt-4o-2024-08-06). Tables: `members` (r, joined `profiles`), `tags` (r). Model may only choose from supplied tag catalogue; hallucinated ids dropped server-side.

**`members/add-rep`** (POST) — Body: `{ parent_member_id, first_name, last_name, email, rep_role?, phone?, is_primary?, send_invite? (default true) }`. Response: `{ ok, member_id, profile_id, invite_sent, reused_existing_user }`. External: Resend (`sendInviteEmail`). Tables: `members` (r/i/u — parent lookup, rep insert/reactivate, demote other primary reps), `profiles` (r/u).

**`members/cancel`** (POST) — Body: `{ member_id, reason? }`. Response: `{ ok, stripe:'cancelled'|'failed'|'none', stripe_error }` (idempotent `{already_cancelled:true}`). External: Stripe (`subscriptions.update` cancel_at_period_end, non-blocking failure), Supabase Auth `signOut`. Tables: `members` (r/u).

**`members/create`** (POST) — Body: `{ first_name, last_name, email, phone?, job_title?, company_name?, company_description?, company_website?, membership_tier?, status?, send_invite? (default true), notes?, tag_ids?[] }`. Response: `{ ok, member_id, profile_id, invite_sent, reused_existing_user }`. External: Resend. Tables: `profiles` (r/u), `members` (r/i/u), `bookings` (u — link prior guest bookings), `member_tags` (clear+insert). Tier/quota derived server-side via `planForTier`/`introQuotaForTier`.

**`members/delete`** (POST) — Body: `{ member_id }`. Response: `{ ok, soft_deleted:false }` or `{ ok, soft_deleted:true, message }` fallback. External: Stripe (`subscriptions.cancel`, best-effort). Tables: `members` (r, soft-delete fallback); relies on FK cascade from `auth.users` deletion for hard delete. Guards against admin deleting own account.

**`members/enrich`** (POST) — Body: `{ memberId }`. Response: `{ ok, status }` / `{ error }` (HTTP 502 `{ error, status:'failed' }` when the provider failed). `maxDuration = 60`. External: Clay Public Search API (`enrichMember`); spends Clay search quota.

**`members/import`** (POST) — Body: `{ rows:[...] (max 1000), send_invites? (default false), default_tier?, default_status?, tag_ids?[] }`. Response: `{ ok, summary:{total,created,reused,skipped}, results:[...] }`. External: Resend (only if send_invites). Tables: `profiles` (r/u per row), `members` (r/i/u per row), `member_tags` (upsert additive). Processes sequentially to avoid auth rate limits.

**`members/recompute-scores`** (POST) — Query: `?member_id=` optional (else all active/non-deleted). Response: `{ updated:1, scores }` or `{ updated:n }`. Tables: `members` (r/u via `computeMemberScores`).

**`members/resend-invite`** (POST) — Body: `{ member_id }`. Response: `{ ok, email, sent:true }`. External: Resend (`resetPasswordAndSendCredentials` or `sendInviteEmail`). Tables: `members` joined `profiles` (r).

**`members/success`** (GET) — Query: `?flag=at_risk|renewal_soon|no_intros|dormant|upgrade_ready`. Response: `{ members, counts, total, thresholds }`. Tables: `members` (joined `profiles`), `bookings`, `introductions`. Thresholds: churn ≥60 at_risk, renewal ≤30 days, dormant >90 days no attendance, upgrade_potential ≥70.

**`revalidate`** (POST) — Body: `{ paths: string[] }` (each must start with `/`). Response: `{ ok, revalidated:paths }`. No tables — pure Next.js `revalidatePath`.

**`scorecards/summary`** (POST) — Body: `{ staff_id, week_start }`. Response: `{ ok, summary }` (upserted). External: OpenAI (narrative, model default gpt-4o-2024-08-06, temp 0.5; templated fallback if no key). Tables: `scorecard_targets`, `profiles`, `accountability_tasks`, `time_entries` (r), `scorecard_summaries` (upsert).

**`team/create`** (POST) — Body: `{ first_name, last_name, email, role:'team_member'|'freelancer', job_title?, send_invite? (default true) }`. Response: `{ ok, profile_id, invite_sent, invite_error, reused_existing_user }`. External: Resend (redirect `/admin/login`). Tables: `profiles` (r/u).

**`team/resend-invite`** (POST) — Body: `{ profile_id }`. Response: `{ ok, email, sent:true }`. External: Resend.

**`signatures/send`** (POST) — Body: `{ member_id, signer_name?, signer_email?, doc_type?, title?, subject, message?, body_html?, contract_template_id?, file_base64?, file_name? }` (contract-HTML mode with merge tags→DocuSign anchor tabs, or legacy PDF base64 mode, max 12MB). Response: `{ ok, request }` or `{ error, envelope_id }`/`{ error, consentUrl }`. External: DocuSign (`getAccessToken`, `createEnvelope`/`createEnvelopeFromHtml`). Tables: `members` (joined `profiles`), `contract_templates` (r), `signature_requests` (i).

**`signatures/status`** (POST) — Body: `{ id? }` or `{ member_id? }`. Response: `{ ok, requests }`. External: DocuSign (`syncSignatureRequest`, shared with the DocuSign Connect webhook). Tables: `signature_requests` (r/u).

**`signatures/view`** (GET) — Query: `?id=`. Response: raw PDF stream (inline). External: DocuSign (`getCombinedDocument`). Tables: `signature_requests` (r).

**`signatures/void`** (POST) — Body: `{ id, reason? }`. Response: `{ ok, request }`. External: DocuSign (`voidEnvelope`). Tables: `signature_requests` (r/u — blocks voiding if already completed/declined/voided).

**`check-member-email`** (POST) — Body: `{ email }`. Response: `{ exists, isMember }`. Tables: `profiles` (r, case-insensitive), `members` (r, by profile_id, non-deleted). Public — uses service-role client so anon callers don't need RLS read access to emails.

---

## 4. Admin — Sponsorship, Xero, Google Workspace (Drive/Gmail), WhatsApp

| Path | Methods | Purpose | Auth |
|---|---|---|---|
| `src/app/api/admin/sponsors/invite/route.ts` | POST | Send a sponsor a personalised event-booking invite email with merge-tag substitution | Admin |
| `src/app/api/admin/sponsors/proposal/route.ts` | POST | Generate (AI) or send a sponsorship proposal for a sponsorship | Admin |
| `src/app/api/admin/sponsors/roi/route.ts` | POST | Build and store a post-event ROI report for a sponsorship | Admin |
| `src/app/api/admin/sponsorship/convert/route.ts` | POST | Convert a ranked `sponsor_prospect` into a real `sponsorships` row | Admin |
| `src/app/api/admin/sponsorship/decision-makers/route.ts` | GET, POST | Discover (via the enrichment provider — Clay) and list decision-maker contacts for a prospect | Admin |
| `src/app/api/admin/sponsorship/deck/parse/route.ts` | POST | Extract text from a sponsorship deck (PDF/DOCX/pasted text) and summarise into a structured brief via OpenAI | Admin |
| `src/app/api/admin/sponsorship/match/route.ts` | POST | Sponsor-matching engine: warm CRM candidates + selective cold enrichment + OpenAI ranking, persisted as `sponsor_prospects` | Admin |
| `src/app/api/admin/sponsorship/outreach/draft/route.ts` | POST | Generate a draft multi-step outreach email sequence for a prospect (never sends) | Admin |
| `src/app/api/admin/sponsorship/outreach/route.ts` | GET, PATCH | List outreach queue; edit content and toggle draft⇄approved status (human gate) | Admin |
| `src/app/api/admin/sponsorship/outreach/send/route.ts` | POST | Send an approved outreach message via the outreach sender seam (Resend/Instantly) | Admin |
| `src/app/api/admin/sponsorship/prospects/route.ts` | GET, PATCH | List an event's sponsor prospects and update pipeline status | Admin |
| `src/app/api/admin/whatsapp/send/route.ts` | POST | Send a WhatsApp template or free-text message via Meta Cloud API | Admin |
| `src/app/api/admin/xero/connect/route.ts` | GET | Start Xero OAuth2 authorization flow (redirect) | Admin |
| `src/app/api/admin/xero/disconnect/route.ts` | POST | Revoke Xero connection and clear stored tokens | Admin |
| `src/app/api/admin/xero/sync-contacts/route.ts` | POST | Find-or-create Xero Contacts for all members | Admin |
| `src/app/api/admin/xero/sync-invoices/route.ts` | POST | Push paid payments into Xero as invoices | Admin |
| `src/app/api/admin/xero/sync-spend/route.ts` | POST | Pull historic Xero invoice totals into `members.xero_spend_pence` | Admin |
| `src/app/api/admin/google/drive/file/[id]/route.ts` | GET | Proxy bytes of a private Drive file for preview | Admin |
| `src/app/api/admin/google/drive/folders/route.ts` | GET, PUT | Manage Drive media owner + folder allow-list | Admin (PUT partially owner-only) |
| `src/app/api/admin/google/drive/import/route.ts` | POST | Copy a Drive file into public Supabase `gallery` bucket | Admin |
| `src/app/api/admin/google/drive/list/route.ts` | GET | List Drive folder/media children for the media picker | Admin |
| `src/app/api/admin/google/gmail/config/route.ts` | GET, PUT | Read/write Gmail sync configuration | Admin |
| `src/app/api/admin/google/gmail/create-draft/route.ts` | POST | Save an AI/manual reply as a real Gmail draft in a thread | Admin |
| `src/app/api/admin/google/gmail/draft-reply/route.ts` | POST | Generate (not save) an AI reply draft for a Gmail thread | Admin |
| `src/app/api/admin/google/gmail/extract/route.ts` | GET, POST | AI-extract potential contacts/introductions from unmatched inbound Gmail messages | Admin OR `Bearer CRON_SECRET` |
| `src/app/api/admin/google/gmail/extractions/route.ts` | GET, POST | List pending extractions; approve (creates `enquiries` row) or dismiss | Admin |
| `src/app/api/admin/google/gmail/filtered/route.ts` | GET, POST | List noise-filtered senders; restore one as a lead or dismiss | Admin |
| `src/app/api/sponsor/[token]/submit/route.ts` | POST | **PUBLIC** — sponsor uploads a deliverable asset/note via their unique booking-token link | **Public / token-in-URL**, no admin session |
| `src/app/api/xero/callback/route.ts` | GET | **Public-facing OAuth redirect target** — Xero sends the browser here after consent | State-cookie CSRF check + admin session required to complete |
| `src/app/api/whatsapp/webhook/route.ts` | GET, POST | **PUBLIC webhook** — Meta Cloud API verification handshake + delivery/inbound callbacks | GET: `hub.verify_token` match; POST: no auth (always 200) |

### Notes

**`sponsors/invite`** (POST) — Body: `{ sponsorship_id, template_id }`. Resolves sponsor email, builds booking link `/events/<slug>?s=<booking_token>`, merge-tag substitution, sends via Resend. Response: `{ ok, to }` (502 on failure). Tables: `sponsorships`, `events`, `members`, `profiles`, `email_templates` (r), `email_log` (i), `sponsorships.invite_sent_at` (u).

**`sponsors/proposal`** (POST) — Body: `{ sponsorship_id, action:'generate'|'send' }`. Generate: OpenAI writes proposal prose (fallback templated), stores `sponsorships.proposal_html`. Send: resolves recipient, sends via `sendClubEmail`. Response: `{ ok, proposal_html }` or `{ ok, to, sponsor }`. Tables: `sponsorships` (r/u), `members`/`profiles` (r).

**`sponsors/roi`** (POST) — Body: `{ sponsorship_id }`. Computes reach/attendance from `bookings`, OpenAI narrative (fallback templated), stores `roi_report_html` + `roi_reach`. Response: `{ ok, roi_report_html, stats }`. Tables: `sponsorships` (r/u), `bookings` (r), `events` (joined).

**`sponsorship/convert`** (POST) — Body: `{ prospect_id, decision_maker_id?, package_name?, amount_pence? }`. Idempotent via `sponsor_prospects.converted_sponsorship_id`. Inserts `sponsorships` (status `proposed`), marks prospect `status='won'`. Response: `{ ok, sponsorship_id, already? }`. Tables: `sponsor_prospects` (r/u), `sponsor_decision_makers` (r), `sponsorships` (i). No external calls.

**`sponsorship/decision-makers`** (GET/POST) — POST body: `{ prospect_id, role_filters? }` → enrichment vendor `searchDecisionMakers(domain, roleFilters)` (Clay people search: current leadership — Founder/Owner/Partner/C-suite/VP/Director/Head — or current job titles similar to `role_filters`; up to 10 people; NO emails (Clay search doesn't return them) and seniority is derived from the title. Degrades to 200 with `status:unavailable|upgrade_required|error` on failure — `upgrade_required` = Clay search quota used up for the period); deletes+reinserts `sponsor_decision_makers`. GET `?prospect_id=` → lists persisted rows. Response: `{ status, decision_makers }` / `{ decision_makers }`. Tables: `sponsor_prospects` (r), `sponsor_decision_makers` (r/d/i). External: enrichment vendor (vendor-agnostic wrapper).

**`sponsorship/deck/parse`** (POST) — Body: `{ text? , asset_path? }` (storage bucket `sponsor-assets`). Extracts text (pdfjs-dist for PDF, mammoth for DOCX), truncates 12000 chars, OpenAI structured summary `{ positioning, target_sectors[], keywords[] }` (fallback: raw truncated text). Always 200. Response: `{ ok, deck_brief, target_sectors, keywords }` or `{ ok:false, message }`. External: OpenAI, `logOpenAIUsage('sponsorship_deck_parse')`.

**`sponsorship/match`** (POST) — Body: `{ event_id, brief?, deck_brief? }`. Pipeline: warm CRM candidates (past sponsors + aligned members) → derive audience sectors from `bookings` → if warm <8, cold candidates via enrichment `searchSponsorCompanies` (Clay company search: audience sectors → Clay `industry` values — unrecognised sectors are dropped — and — only when no sector matched an industry — event type/city/brief words → company-description keywords; up to 10 companies; degrades silently, `cold_status:'upgrade_required'` = Clay search quota used up, `'unavailable'` = no usable criteria) → dedupe → OpenAI ranks 0-100 (warm +20 bonus) or rule-based fallback → upsert `sponsor_prospects` (preserves human status progress). Response: `{ ok, event_id, counts:{warm,cold,total}, cold_status, prospects }`. Tables: `events`, `sponsorships`, `members`, `bookings` (r), `sponsor_prospects` (r/i/u). External: OpenAI, enrichment provider (Clay). Logs usage (`sponsorship_match`).

**`sponsorship/outreach/draft`** (POST) — Body: `{ prospect_id, decision_maker_id?, voice?, steps? (1-5, default 3), note? }`. OpenAI structured sequence (subject + body_paragraphs per step) rendered via `renderClubEmail` (fallback: single templated first-touch). Inserts each step as `sponsor_outreach` row `status='draft'`. Never sends. Response: `{ ok, drafts }`. Tables: `sponsor_prospects`, `events`, `sponsor_decision_makers`, `marketing_voices` (r), `sponsor_outreach` (i).

**`sponsorship/outreach`** (GET/PATCH) — GET `?event_id=&status=` → joined listing. PATCH body: `{ id, subject?, body_html?, body_text?, to_email?, status? }` — content edits always allowed; only `draft⇄approved` status transition permitted (approve stamps `approved_by`/`approved_at`); setting `status='sent'` is rejected (send route only). Tables: `sponsor_outreach` (r/u), `sponsor_prospects`, `sponsor_decision_makers` (joined r).

**`sponsorship/outreach/send`** (POST) — Body: `{ outreach_id }`. Guard: only sends if `status==='approved'`. Sends via `getSender(channel)` seam (`resend` today, `instantly` planned); on failure marks `status='failed'` (502); on success `status='sent'`, bumps prospect to `contacted` (never downgrades responded/won). Response: `{ ok, external_id }` or `{ error }`. Tables: `sponsor_outreach` (r/u), `sponsor_prospects` (r/u).

**`sponsorship/prospects`** (GET/PATCH) — GET `?event_id=` → sorted warm-first then score desc. PATCH body: `{ id, status }` (`suggested|shortlisted|approved|contacted|responded|won|lost|dismissed`). Tables: `sponsor_prospects` (r/u). No sends/enrichment.

**`whatsapp/send`** (POST) — Body: `{ to, mode:'template'|'text', templateName?, languageCode?, text?, memberId? }`. Delegates to `sendClubWhatsApp` (template requires templateName; text requires open 24h window). Response: `{ ok, id }` or `{ ok:false, error }` (502). External: Meta WhatsApp Cloud API. Tables: `whatsapp_log` (written by lib).

**`xero/connect`** (GET) — Mints random `state`, stores in httpOnly cookie `xero_oauth_state` (10 min), redirects to Xero OAuth2 consent. Non-admin → redirect `?xero=forbidden`.

**`xero/disconnect`** (POST) — Best-effort revoke via Xero `/connections` API, always clears local tokens (`app_settings`). Response: `{ ok:true }`.

**`xero/sync-contacts`** (POST) — Body: `{ force? }`. `syncAllMembers` — find-or-create Xero Contact per non-deleted member, stores `members.xero_contact_id`. 400 if not connected (`XeroNotConnectedError`).

**`xero/sync-invoices`** (POST) — `pushAllRevenue` — pushes paid payments lacking a Xero invoice as ACCREC sales invoices, writes `payments.xero_invoice_id`.

**`xero/sync-spend`** (POST) — `pullMemberSpend` — pages Xero ACCREC invoices, sums paid amounts matched via `members.xero_contact_id`, stores `members.xero_spend_pence`.

**`google/drive/file/[id]`** (GET) — Proxies Drive file bytes/stream with short cache. External: Google Drive API.

**`google/drive/folders`** (GET/PUT) — GET: current media owner, allow-listed folders, admin roster. PUT: `{ ownerProfileId? }` settable only if no owner yet or by current owner; `{ allowedFolders? }` settable only by current owner. Tables: `app_settings`, `profiles` (r).

**`google/drive/import`** (POST) — Body: `{ file_id }`. Downloads via Drive API, uploads to Storage `gallery` bucket (public). Response: `{ ok, url, path }`. `maxDuration=60`.

**`google/drive/list`** (GET) — Query: `?folderId=`. Lists children, enforces folder allow-list (unless owner/no allow-list), walks parent chain (depth 10). Response: `{ ok, folders, media, folderId }`.

**`google/gmail/config`** (GET/PUT) — GET: `gmail_sync_config` (or defaults). PUT: `{ enabled, noiseFilter, historyMonths (clamped 1-120), inboxes:[{email,label,enabled}] }`. Tables: `app_settings`.

**`google/gmail/create-draft`** (POST) — Body: `{ thread_id, subject, body_html, to? }`. Derives recipient + threading headers, creates a real Gmail draft (never sends). Response: `{ ok, draft_id, to }`. External: Gmail API.

**`google/gmail/draft-reply`** (POST) — Body: `{ thread_id, guidance? }`. OpenAI structured `{ subject, body_html }` in Club voice; does not save. Response: `{ ok, subject, body_html }`. 503 if no OpenAI key. Logs usage (`gmail-draft-reply`).

**`google/gmail/extract`** (GET/POST, same handler) — Runs AI extraction over up to 15 unmatched non-noise inbound `gmail_messages`; OpenAI proposes `contact`/`introduction`, upserted into `gmail_extractions` (`status='pending'`). Auth: admin OR `Bearer <CRON_SECRET>` (cron-callable). `maxDuration=60`. Response: `{ ok, processed, created }`.

**`google/gmail/extractions`** (GET/POST) — GET: pending extractions (limit 100). POST body: `{ id, action:'approve'|'dismiss' }` — approving a `new_contact` kind creates an `enquiries` row. Tables: `gmail_extractions` (r/u), `enquiries` (i).

**`google/gmail/filtered`** (GET/POST) — GET: distinct noise-filtered sender list (scan capped 1000 rows). POST body: `{ email, action:'add_lead'|'dismiss' }` — add_lead creates an `enquiries` row and clears `is_noise` for that sender. Tables: `gmail_messages` (r/u), `enquiries` (i).

**`sponsor/[token]/submit`** (POST) — **PUBLIC, TOKEN-GATED**. The `booking_token` path segment IS the credential (resolves to one `sponsorships` row); verifies posted `deliverable_id` belongs to that sponsorship (identical 404 for missing/foreign to avoid leaking existence). Body: multipart — `deliverable_id`, `note?`, `file?` (max 15MB, allow-listed extensions). Response: `{ ok, file_name }` / `{ error }`. Tables: `sponsorships` (r), `sponsor_deliverables` (r/u). Storage: private `sponsor-assets` bucket.

**`xero/callback`** (GET) — OAuth redirect target: (1) CSRF — `state` query param must match `xero_oauth_state` cookie; (2) still requires active admin session (`requireAdmin`). Exchanges `code` for tokens, fetches tenant, persists via `saveXeroTokens`. Redirects to `/dashboard/settings?xero=connected` or `?xero=error&reason=<denied|state|missing_code|forbidden|no_tenant|exchange>`.

**`whatsapp/webhook`** (GET/POST) — GET: verification handshake, requires `hub.mode=subscribe` + `hub.verify_token===WHATSAPP_VERIFY_TOKEN`, echoes `hub.challenge` (else 403). POST: no auth (Meta calls directly), always 200 to avoid retry storms; updates `whatsapp_log.status` for delivery/read/failed callbacks, inserts new rows for inbound messages.

---

## 5. Public Intake, Portal, Cron & Webhooks

| Path | Methods | Purpose | Auth |
|---|---|---|---|
| `src/app/api/concierge/chat/route.ts` | POST | AI website concierge chat widget: qualifies visitors, creates a CRM enquiry once name+email+goal known | Public (self-built rate limits + honeypot) |
| `src/app/api/cron/automations/route.ts` | GET, POST | Daily heartbeat for automated email flows (idempotent per-day) | `Authorization: Bearer <CRON_SECRET>` OR admin session |
| `src/app/api/cron/gmail-backfill/route.ts` | GET, POST | Resumable historical Gmail backfill (store+match only, no AI) into `gmail_messages` | Cron secret OR admin session |
| `src/app/api/cron/gmail-sync/route.ts` | GET, POST | Incremental Gmail sync of configured inboxes into `gmail_messages` | Cron secret OR admin session |
| `src/app/api/docusign/webhook/route.ts` | GET, POST | DocuSign Connect push notifications; reconciles envelope status | Public; shared-secret query param `?t=` vs `DOCUSIGN_CONNECT_SECRET` |
| `src/app/api/enquiries/intake/route.ts` | POST | Public contact/concierge form intake: scores, routes, acknowledges, notifies, tasks (does NOT auto-enrich) | Public |
| `src/app/api/events/book/route.ts` | POST | Member event booking; charges saved card, holds, or falls back to Stripe Checkout | Logged-in member (Supabase session) |
| `src/app/api/events/checkout/route.ts` | POST | Guest (non-member) event booking via Stripe Checkout, incl. sponsor-link bookings | Public |
| `src/app/api/events/sync/route.ts` | POST | On-demand reconciliation of a booking with a Stripe Checkout session | Public (gated by possession of `session_id`) |
| `src/app/api/membership-application/confirm/route.ts` | POST | Second half of pending-charge application flow: records saved card, sends "application received" email | Public (gated by `setup_intent`/`application_id`) |
| `src/app/api/membership-application/setup/route.ts` | POST | First half of application flow: creates pending application + Stripe customer + SetupIntent | Public |
| `src/app/api/portal/introductions/request/route.ts` | POST | Member requests an introduction to another member (status `suggested`) | Logged-in member (Supabase session) |
| `src/app/api/portal/introductions/respond/route.ts` | POST | Member accepts/declines an introduction; rolls up overall status | Logged-in member (Supabase session) |
| `src/app/api/webhooks/resend/route.ts` | POST | Resend email engagement webhook (delivered/opened/clicked/bounced) → updates `communications`/`email_log` | Public; Svix signature via `RESEND_WEBHOOK_SECRET` (optional but recommended) |

### Notes

**`concierge/chat`** (POST) — Body: `{ session_token, message, company_url? (honeypot) }`. Response: `{ reply, qualified, done }` — never 500s; failures degrade to a canned reply. Abuse controls: honeypot, 1000-char cap, 20 messages/conversation cap, 12 new-conversations/IP/hour, 500 max completion tokens, 24-turn history. External: OpenAI (gpt-4o-2024-08-06, structured output); internally calls `/api/enquiries/intake` once qualified (name+valid email+goal, once per conversation). Tables: `concierge_conversations` (r/w, service-role).

**`cron/automations`** (GET/POST) — Query `?dryRun=true`. `maxDuration=60`. Vercel cron runs hourly but only fires the real batch during the configured UK send-hour (`app_settings.daily_send_hour`, default 07:00 Europe/London); admin-triggered/dry-run always proceeds. Idempotent. Response: `{ ok, triggeredBy, ...runAllAutomations result }` or `{ ok, skipped, reason }`. Tables: `app_settings`, `profiles`; delegates sends to `runAllAutomations`.

**`cron/gmail-backfill`** (GET/POST) — `maxDuration=60`. Config-gated via `app_settings.gmail_sync_config`. Resumable per-mailbox via Gmail `pageToken` + `done` flag persisted in `app_settings.gmail_backfill_state`, saved after every page. Run budget: 200 messages/invocation, no AI extraction. Response: `{ ok, triggeredBy, processed, perInbox }`. External: Gmail API. Tables: `app_settings`, `gmail_messages`.

**`cron/gmail-sync`** (GET/POST) — `maxDuration=60`. Same config gate. Syncs each enabled inbox via `syncInboxIncremental`. Response: `{ ok, triggeredBy, inboxes, fetched, upserted, matched }`. External: Gmail API. Tables: `app_settings`, `gmail_messages`.

**`docusign/webhook`** (GET/POST) — GET answers `ok` (Connect config validation probe). POST body: DocuSign Connect event JSON, extracts `envelopeId`. Auth: shared secret `?t=` vs `DOCUSIGN_CONNECT_SECRET` (skipped if unconfigured). Always responds 200 to avoid retry storms. External: DocuSign (`syncSignatureRequest`). Tables: `signature_requests` (r/w).

**`enquiries/intake`** (POST) — Body: `{ first_name, last_name, email, phone?, company?, position?, intent?:string[], message, source? }` (first_name/last_name/email/message required, email regex-validated). Response: `{ ok, id }` or `{ ok:false, error }`. Flow (insert is the only hard-fail step, rest best-effort): score (`scoreEnquiry`) + insert `enquiries` → resolve owner from `app_settings.enquiry_routing` by intent else first admin, update `assigned_to` → acknowledgement email via Resend (`sendClubEmail`) → `notifyAdmins` → follow-up `tasks` row. No enrichment here — enrichment is manual via the admin Enrich button (`/api/admin/enquiries/enrich`) to control Clay search-quota usage. Tables: `enquiries`, `app_settings`, `profiles`, `tasks`.

**`events/book`** (POST) — Body: `{ event_id, bring_guest?, guest_name?, add_accommodation? }`. Auth: logged-in member. Validates event published/live, capacity, no existing active booking, sponsorship rate if applicable, computes total. Creates `bookings` (pending); if member has usable saved card: auto-confirm→off-session charge (confirmed) or hold (pending, no charge); else falls back to Stripe Checkout (payment or setup mode), returns redirect `url`. Flips `event_invitations`, notifies admins. Response: `{ ok, booking_id, status }` or `{ url, hold }` or `{ error }`. External: Stripe, Resend. Tables: `members`, `events`, `bookings`, `sponsorships`, `event_invitations`, `payments`.

**`events/checkout`** (POST) — No explicit `runtime` export. Body: `{ event_id, guest_name, guest_email, guest_company?, dietary_requirements?, special_requests?, add_accommodation?, sponsor_token? }` (event_id/guest_name/guest_email required). Public guest booking. Resolves sponsor rate via `sponsor_token` if present; enforces capacity + guest sub-cap (bypassed for sponsors); links booking to a member profile if sponsor matches one; duplicate-booking guard; inserts `bookings` (pending), flips `event_invitations`; creates Stripe customer + Checkout Session (setup mode if `auto_confirm=false`, else payment mode); notifies admins. Response: `{ url, hold }` or `{ error }`. Tables: `events`, `sponsorships`, `profiles`, `members`, `bookings`, `event_invitations`.

**`events/sync`** (POST) — Body: `{ session_id }`. Public, gated by possession of the Stripe session id — only writes data Stripe itself confirms. Retrieves Checkout session (expand payment_intent/setup_intent), resolves `booking_id` from metadata. Setup mode: persists saved card as customer default + on booking (stays pending). Payment mode: if paid, flips booking confirmed, inserts idempotent `payments` row (dedup on payment_intent), sends confirmation email for guest bookings only (webhook covers members). Tables: `bookings`, `payments`, `events` (joined).

**`membership-application/confirm`** (POST) — Body: `{ setup_intent?, application_id? }` (one required). Public, gated by possession of setup_intent/application_id. Retrieves Stripe SetupIntent (requires `succeeded`), sets saved card as customer default; sends "application received" email exactly once (idempotent via `pending_email_sent_at`), also notifies admins on that first send; updates application row. Response: `{ ok, application_id, email_sent, email_error }`. External: Stripe, Resend (`sendClubEmail`, `notifyAdmins`). Tables: `membership_applications`.

**`membership-application/setup`** (POST) — Body: large applicant object; requires `preferred_tier`, `payment_preference`, `email`, `first_name`, `last_name`; optional `application_id` for repeat calls. Resolves plan pricing from `membership_plans` (fallback hardcoded pricing), computes quoted gross incl. 20% VAT; upserts `membership_applications` (status `pending`, auto-routes `track='pitch'` for early-stage/investment applicants); creates/reuses Stripe customer + SetupIntent (`usage:'off_session'`, no charge — charge happens on admin approval). Response: `{ clientSecret, applicationId }`. Tables: `membership_plans`, `membership_applications`.

**`portal/introductions/request`** (POST) — Body: `{ target_member_id, reason?, desired_outcome? }`. Auth: logged-in member. Rejects self-introduction; target must be active; orders pair canonically (`orderedPair`); blocks new request only if a pair is currently "in flight" (suggested/approved/sent/scheduled/accepted); else inserts `introductions` row at `status='suggested'` with auto-generated `match_reason`. Response: `{ ok:true }` or `{ ok:true, already:true, status, message }`. Tables: `members`, `profiles` (joined), `introductions`.

**`portal/introductions/respond`** (POST) — Body: `{ introduction_id, response:'accepted'|'declined', note? }`. Auth: logged-in member, must be member_a or member_b. Records per-side response + note (internal-only, never shown to other member) + timestamp; rolls up overall status (any decline → declined; both accepted → accepted). Response: `{ ok, response, overall }`. Tables: `members`, `introductions`.

**`webhooks/resend`** (POST) — Body: raw Resend webhook JSON `{ type, data:{email_id|id} }`; handles `email.opened`, `email.clicked` (implies opened), `email.delivered`, `email.bounced` (others acked/ignored). Auth: Svix signature (`svix-id`/`svix-timestamp`/`svix-signature`) vs `RESEND_WEBHOOK_SECRET`; processes unverified with a warning if secret unset. Matches `resend_message_id` across `communications` and `email_log`; sets `opened_at`/`clicked_at` only if null (idempotent); status promotion never demotes (clicked > opened > sent; bounced always terminal). Always responds 200 even on processing error.

---

## Cross-cutting patterns

- **Admin auth pattern**: nearly every `/api/admin/*` route re-implements the same `requireAdmin()` shape inline (session via `createClient()` → `auth.getUser()` → `profiles.role === 'admin'` check → 401/403), then switches to a service-role client (`createClient` from `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY`) for the actual work — RLS is bypassed by design once admin is confirmed.
- **AI usage tracking**: routes calling OpenAI consistently call `logOpenAIUsage(feature, ...)` for internal cost accounting (features seen: `sponsorship_deck_parse`, `sponsorship_match`, `sponsorship_outreach_draft`, `gmail-extract`, `gmail-draft-reply`, and others per-feature).
- **Graceful AI degradation**: most AI-touching routes (deck parse, ROI, proposals, chief-of-staff report, handover report, scorecards) fall back to templated/deterministic output rather than erroring when `OPENAI_API_KEY` is absent or the call fails — the app is designed to run without AI keys configured.
- **Public routes are token/secret gated, not sessionless**: every genuinely public write endpoint (`sponsor/[token]/submit`, `events/checkout`, `events/sync`, `membership-application/*`, `enquiries/intake`, `concierge/chat`) is scoped by an unguessable token, a Stripe session id, or heavy rate-limiting rather than being wide open.
- **Webhooks always return 200**: `docusign/webhook`, `whatsapp/webhook`, `webhooks/resend` all return HTTP 200 even on internal processing failure, specifically to prevent the external provider's retry storm.
- **Cron secret pattern**: `cron/automations`, `cron/gmail-backfill`, `cron/gmail-sync`, and `admin/google/gmail/extract` accept either an admin session or `Authorization: Bearer <CRON_SECRET>`, letting Vercel Cron and an admin "run now" button share one implementation.
- **Payments duality**: Stripe-charging routes (`applications/approve`, `bookings/decision`, `events/book`, `events/checkout`) consistently write an idempotent `payments` row keyed off the Stripe payment_intent/subscription id, so the webhook and the interactive route can't double-record revenue.
