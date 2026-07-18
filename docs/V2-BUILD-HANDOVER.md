# The Club by Sarah Restrick — CRM V2 Build Handover

**Purpose:** A reference for anyone reviewing what has been built. It covers the features delivered in this
build cycle (WhatsApp + Xero, plus a Finance addition), the automation/cron system, database migrations,
environment variables, where to find each feature in the admin UI, and what still needs client-provided
accounts before go-live.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · Supabase (Postgres + Auth + Storage
+ RLS) · Stripe · Resend (email) · OpenAI · DocuSign · Xero · WhatsApp Cloud API.

**Environments:** Local dev at `localhost:3000`; production at `https://sarahcrm.vercel.app` (Vercel).
Single Supabase project (ref `owjnsljovmaaxgxpxxtw`).

---

## 1. The 8 Headline V2 Tasks — Status

| # | Headline task | Status |
|---|---|---|
| 1 | **Finance integration (Xero)** | ✅ **Done** (this build) |
| 2 | Finance dashboards (MRR, cashflow, P&L, renewal rate, revenue-by-member, LTV) | ✅ Done |
| 3 | Gmail ↔ CRM (history, AI replies, extraction) | ⛔ Blocked — needs client Google account + OAuth review |
| 4 | Google Drive gallery link | ⛔ Blocked — needs client Google account |
| 5 | Sales pipeline dashboard | ✅ Done |
| 6 | Commission tracker | ✅ Done |
| 7 | **AI lead enrichment (Apollo)** | ✅ **Done** (this build) — company data live; person/seniority on client's paid key |
| 8 | Lead scoring & enquiry routing | ✅ Done |

**Plus (from the detailed brief, not the 8 headlines): WhatsApp channel** — built this cycle (see §2).

Every *buildable* headline is complete. **The only remaining headlines are #3 Gmail and #4 Google Drive** —
both blocked solely on the client providing a Google account (OAuth app + restricted-scope review).

---

## 2. Built This Cycle

### 2A. WhatsApp Cloud API Integration

A full WhatsApp channel: send messages, a team inbox, and inbound receiving — mirroring the existing
email infrastructure.

**What it does**
- **Outbound send** — approved templates (e.g. `hello_world`) and free-text messages, via the Meta Cloud API.
- **Team inbox** (`/dashboard/whatsapp`) — a web.whatsapp-style two-pane view: conversation list on the left
  (one row per contact, last-message preview, unread badge, member-name resolution), full message thread on
  the right (inbound/outbound chat bubbles with delivery-status ticks), and a **window-aware reply composer**
  (free-text inside WhatsApp's 24-hour window, otherwise a template picker).
- **Inbound receiving** — a public webhook captures delivery/read status and incoming replies, which flow
  into the inbox automatically (via a DB trigger).
- **Logging** — every message (in and out) is recorded in `whatsapp_log`.

**Key files**
- `src/lib/whatsapp/client.ts` — `sendClubWhatsApp()` + `normalizeE164()` phone normaliser.
- `src/app/api/admin/whatsapp/send/route.ts` — admin send endpoint (template or text).
- `src/app/api/whatsapp/webhook/route.ts` — public webhook (verify handshake + status + inbound messages).
- `src/views/admin/whatsapp/` — the inbox (`WhatsAppInboxPage`, `ConversationList`, `ConversationThread`,
  `ReplyComposer`, `NewConversationModal`).
- `src/components/ui/chat/` — themed chat bubble/message/scroller primitives.

**Verified on dev:** outbound template + free-text delivered to a real phone; inbox renders threads with
member resolution; the receiving pipe proven end-to-end via Meta's test-webhook.

**Go-live TODO (Meta account, not code):**
1. **Publish the Meta app** (currently in Development mode) — only then does Meta deliver *real* inbound
   messages from real phones (test mode only delivers dashboard test webhooks).
2. **Business verification** + register a **real phone number** + get a **display name** approved.
3. Swap the **temporary access token for a permanent System-User token** (the test token expires ~24h).
4. Get **custom message templates approved** (event reminders etc.); free-text only works inside the 24h window.
5. Re-point the webhook to the production WABA.
> The **code does not change** for go-live — it's swapping 3 env values + re-subscribing the webhook.

**Future extensions** (designed for, not yet built): the **WhatsApp AI Assistant** (member messages → AI intent
→ create concierge/ticket enquiry or route to team → reply) and wiring WhatsApp into the automation cadence.

---

### 2B. Xero Accounting Integration (Headline #1)

Built in four chunks, each independently reviewed and verified. Connects the CRM to Xero, pushes all revenue
streams as invoices, and pulls each member's historic spend back into the dashboard.

**Chunk 1 — OAuth2 connection**
- Standard Authorization-Code flow with refresh-token rotation. Tokens stored in `app_settings`
  (key `xero_oauth`) behind admin-only RLS. Auto-refreshes ~30-min access tokens.
- Files: `src/lib/xero/client.ts`, `src/app/api/admin/xero/connect`, `src/app/api/xero/callback`,
  `src/app/api/admin/xero/disconnect`. Settings card shows **Connect / Disconnect** + live connection status.

**Chunk 2 — Member → Xero contact sync**
- Find-or-creates a Xero Contact for each member (match by email, else create), storing the Xero ContactID on
  `members.xero_contact_id`. Rate-limit-resilient (rides Xero's 60/min limit).
- File: `src/lib/xero/contacts.ts`; route `sync-contacts`; **"Sync contacts"** button.
- Verified: all **88 members** linked.

**Chunk 3 — Push payments → sales invoices**
- Paid `payments` become **ACCREC** sales invoices in Xero, **marked paid** via a bank account, with the Xero
  InvoiceID written back to `payments.xero_invoice_id`. Idempotent (skips already-pushed).
- File: `src/lib/xero/invoices.ts`; route `sync-invoices`; **"Sync invoices"** button.

**Chunk 3b — All other revenue streams + guest fix**
- **Sponsorships** (confirmed+), **Concierge** (booked/delivered, sale price), **Introduction commissions**
  (ACCREC to the introduced member) → sales invoices; **Referral payouts** (money the Club owes members) →
  **ACCPAY bills**. Memberless **guest payments** routed to a generic **"The Club — Guest Bookings"** contact.
- File: `src/lib/xero/revenue.ts` (generic ACCREC/ACCPAY builder + per-stream pushers + `pushAllRevenue`).
- Verified: 11/11 paid payments invoiced (incl. 2 guest), 2 concierge, 1 intro commission, 2 referral bills.

**Chunk 4 — Pull historic member spend ← Xero**
- Pages through all Xero sales invoices once, sums each member's actual **paid** amount, and stores it on
  `members.xero_spend_pence` (+ `xero_spend_synced_at`). Surfaced as a **"Xero spend"** column in Finance's
  revenue-by-member table.
- File: `src/lib/xero/spend.ts`; route `sync-spend`; **"Sync spend"** button.
- Verified: 88 members synced; 5 with paid spend (£13,550 total) — reconciles exactly to the pushed paid
  invoices minus the guest-contact ones.

**Xero admin surface (Settings → Integrations → Xero card):** Connect / Disconnect · Sync contacts ·
Sync invoices (runs all revenue streams) · Sync spend.

**Go-live TODO (client's real org, not code):** reconnect to Sarah's live **GBP** Xero org (amounts then show
£ rather than the demo org's base currency); sponsorships must reach `confirmed`+ status to push.

---

### 2C. Finance — "From Xero" summary card

Added a summary card to `/dashboard/finance` (above "Revenue by source") showing what was pulled from Xero:
**historic spend pulled** (total actual-paid across members), **members with spend**, and **last synced**
timestamp. Appears once a spend-sync has run.

---

### 2D. AI Lead Enrichment (Apollo — Headline #7)

Automatically enriches enquiries and members with company data (turnover, headcount, industry, website,
LinkedIn) and — on a paid key — person data (seniority, personal LinkedIn). Built **behind a provider
interface** so Clay/Clearbit could swap in later.

**What it does**
- **New enquiries auto-enrich** — the public intake route derives the company domain from the enquirer's email
  and pulls Apollo company data (best-effort; never blocks or fails the enquiry). A manual **"Enrich"** button
  is on each enquiry, with a data panel (industry, employees, revenue, website/LinkedIn) + status badge.
- **Member profiles** — an **"Enrich"** button on the member's *Relationship intelligence* card **autofills
  empty company fields only** (turnover, employees, sector, website, LinkedIn, description) — it **never
  overwrites** admin-entered data. Person LinkedIn fills on the paid key.
- **Free-email addresses** (gmail, outlook, etc.) are flagged "no company domain" rather than failing.
- Every enrichment stores the raw Apollo payload (`enrichment_raw`) for audit + a status
  (`enriched` / `partial` / `not_found` / `no_domain` / `failed`).

**Key files**
- `src/lib/enrichment/` — `provider.ts` (interface), `apollo.ts` (Apollo provider), `stub.ts` (fallback),
  `index.ts` (`getEnrichmentProvider()`), `enrich.ts` (`enrichEnquiry`), `enrich-member.ts` (`enrichMember`).
- Routes: `src/app/api/admin/enquiries/enrich`, `src/app/api/admin/members/enrich`. Auto-enrich wired into
  `src/app/api/enquiries/intake/route.ts`.
- UI: enrichment panel in `EnquiriesListPage`; Enrich button in `MemberDetailPage`.

**Apollo reality (verified):** organization enrichment (turnover, headcount, industry, website, company
LinkedIn) **works on the free key**. People enrichment (**seniority + personal LinkedIn**) is **gated to paid
plans** — the code calls it and degrades gracefully to null on free.

**Go-live TODO (client's side, not code):** swap `APOLLO_API_KEY` for the client's **paid** key (unlocks person
data + real credit volume). GDPR: the client is the data controller — a lawful basis + a privacy-notice line is
advisable, since enrichment processes third-party personal data. Note: *estimated profit* is not available from
Apollo (Companies House would be a future complement).

---

## 3. Automations & Cron System

A single cron endpoint drives all time-based communications. It is **safe to preview** and each stage sends
**exactly once**.

**Endpoint:** `GET`/`POST` `/api/cron/automations`
- **Auth:** `Authorization: Bearer <CRON_SECRET>` (from `.env`).
- **Dry-run:** append `?dryRun=true` to preview what *would* send without sending or writing anything.
- Orchestrated in `src/lib/automations/run.ts` → `runAllAutomations(dryRun)`.

**Once-only guarantee:** each flow records a row in a dedup ledger after a successful send, so re-runs (or a
cron that fires twice) never double-send:
- `automation_log` — keyed `(flow, ref_id)` — for `failed_payment`, `invoice_chasing`, `intro_scheduled`.
- `event_comms_sent` — keyed `(booking_id, kind)` — event reminders + post-event flows.
- `member_comms_sent` — keyed `(member_id, kind)` — membership welcome + renewal flows.
- `sponsor_comms_sent` — keyed `(sponsorship_id, kind)` — sponsor follow-ups.

**Flows (all send branded email via Resend):**

| Area | Stages |
|---|---|
| **Event reminders** | 14 days · 7 days · 48 hours · morning-of |
| **Post-event** | Thank-you (0–24h) · Feedback request (24–48h) · AI introduction recommendations (48–96h) · Guest→member conversion sequence (7 days, non-members) |
| **Membership welcome** | Day 2 · Day 10 · Day 14 (**AI-generated opportunity report** + top-3 match suggestions) |
| **Membership renewal** | 90 · 60 · 30 · 7 days before renewal → auto-renew, or a retention task is created |
| **Sponsor follow-ups** | 3 · 7 · 14 days |
| **Finance** | Failed-payment nudges · Invoice chasing |
| **Introductions** | Scheduled introduction sends |

**Related:** Event **QR check-in** at `/checkin/[bookingId]` records attendance; the member portal shows a
QR event pass.

> **Note:** WhatsApp is **not yet wired into these cron flows** — that's a deliberate follow-up (needs the
> production WhatsApp number to reach real members). Today WhatsApp is admin-driven (inbox + manual send).

---

## 4. Other Shipped V2 Features (context for reviewers)

Delivered across the V2 build (the headlines + half-built sections completed):

- **Lead scoring & enquiry routing** — public enquiry forms POST to an intake API that scores the lead
  (0–100, deterministic), routes it to an owner (configurable per intent in Settings), sends an
  acknowledgement email, and creates a linked sales task. Admin view: `Enquiries`.
- **Finance dashboards** — Revenue, Outstanding, Subscriptions, MRR, Renewal rate, Concierge GMV;
  Revenue-by-source; Cashflow (themed chart); Event P&L; Revenue-by-member & LTV (now + Xero spend).
- **Commission tracker** — unified view of commissions the Club **earns** (introductions + concierge) vs
  **owes** (referrals), with mark-paid write-back. Nav: `Commissions`.
- **Unified sales pipeline board** — membership/sponsorship/concierge/event pipelines in one kanban. Nav:
  `Pipeline`.
- **Executive dashboard** — aggregate members/pipeline/events/introductions view.
- **Event automation** — reminders, QR check-in, post-event flows (see §3).
- **Membership journey** — welcome + renewal cadences (see §3).
- **Sponsorship module** — AI proposal + ROI report generation, delivery checklist, staged follow-ups, and a
  **token-based Sponsor Portal** (`/sponsor/<token>`) where sponsors view their event, deliverables, and ROI —
  and **upload their own assets** (private storage bucket; admins download via signed URLs).
- **Contracts / e-signature** — DocuSign integration for agreements.
- **Digital member card** — QR-coded member card in the portal.

---

## 5. Database Migrations (this cycle — applied to Supabase)

| Migration | What it adds |
|---|---|
| `20260719_whatsapp_log.sql` | `whatsapp_log` table (in/out message log) + admin-read RLS |
| `20260719_whatsapp_contacts.sql` | `whatsapp_contacts` table + AFTER-INSERT trigger (keeps the inbox thread list + unread counts in sync) |
| `20260719_xero_sync_columns.sql` | `xero_invoice_id` on sponsorships / concierge_requests / introductions; `xero_bill_id` on reward_referrals |
| `20260720_member_xero_spend.sql` | `members.xero_spend_pence` + `members.xero_spend_synced_at` |
| `20260720_enquiry_enrichment.sql` | 14 enrichment columns on `enquiries` (status, source, company_*, person_*, raw jsonb) |
| `20260720_member_enrichment.sql` | `members` enrichment tracking columns (status, enriched_at, source, raw) |

Existing columns reused: `members.xero_contact_id`, `payments.xero_invoice_id` (were pre-provisioned for Xero);
`members.annual_turnover / employee_count / sector / company_website / company_linkedin_url / company_description`
(existing text fields, autofilled by enrichment). Xero OAuth tokens, the guest-contact id, and the Apollo guest
data live in the existing `app_settings` table.

---

## 6. Environment Variables (added this cycle)

Stored in `.env` (and to be mirrored in Vercel for production):

- **WhatsApp:** `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`,
  `WHATSAPP_API_VERSION`, `WHATSAPP_VERIFY_TOKEN`.
- **Xero:** `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`, `XERO_SCOPES`.
  - Scopes (granular — required for apps created after 2 Mar 2026): `openid profile email accounting.contacts
    accounting.invoices accounting.payments accounting.settings offline_access`.
  - Registered redirect URIs in the Xero app: `http://localhost:3000/api/xero/callback` and
    `https://sarahcrm.vercel.app/api/xero/callback`.
- **Apollo (enrichment):** `ENRICHMENT_PROVIDER=apollo`, `APOLLO_API_KEY` (currently a **free** dev key —
  company data only; swap for the client's **paid** key to unlock person/seniority data).

Already present: Stripe, Resend, OpenAI, DocuSign, Supabase, `CRON_SECRET`.

---

## 7. Where to Find Each Feature (Admin UI)

- **WhatsApp inbox:** `/dashboard/whatsapp` (Engage section)
- **Xero + integrations:** `/dashboard/settings` → Integrations
- **Finance (+ Xero spend, From-Xero card):** `/dashboard/finance`
- **Enquiries / lead scoring / enrichment:** `/dashboard/enquiries` (enrichment panel + Enrich button per enquiry)
- **Member enrichment:** member detail page → "Relationship intelligence" card → Enrich button
- **Commissions:** `/dashboard/commissions`
- **Pipeline:** `/dashboard/pipeline`
- **Sponsor Portal (public, token):** `/sponsor/<booking_token>`
- **Event QR check-in (public):** `/checkin/<bookingId>`

---

## 8. Still Blocked — Needs the Client's External Accounts

**Headlines still unbuilt (need the client's Google account):**

| Item | What's needed |
|---|---|
| **Gmail ↔ CRM (#3)** | Client Google account + Google OAuth app + restricted-scope review |
| **Google Drive gallery (#4)** | Same Google account dependency |

**Built, but a client-side swap unlocks the full/production experience (no code change):**

| Item | What's needed |
|---|---|
| **AI lead enrichment — person/seniority data (#7)** | Swap `APOLLO_API_KEY` for the client's **paid** Apollo key (company data already live on the free key) |
| **WhatsApp — real inbound & production sends** | Publish the Meta app + business verification + permanent System-User token |
| **Xero — live figures in £** | Reconnect to the client's real GBP Xero organisation |

None of these are code-blocked — they wait on account/access provisioning, then it's an env swap or a
reconnect.

---

*Generated from the build session. For the authoritative code, see `src/lib/whatsapp/*`, `src/lib/xero/*`,
`src/lib/enrichment/*`, `src/lib/automations/run.ts`, and `supabase/migrations/`.*
