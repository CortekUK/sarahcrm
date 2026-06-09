# The Club — Blockers & Outstanding Items

Things the platform **cannot finish on its own** — they need something from
Sarah, an external account, or a production deploy step. Written in plain English.
Keep this current: when a blocker is cleared, move it to **Resolved** at the bottom
with the date.

**Last updated:** 9 Jun 2026

---

## 1. Waiting on Sarah / an external account

These features are built or part-built but can't go live until we have the account
or information from Sarah.

### Xero (accounting integration)
- **What's needed:** A Xero account for the business and API access (so the
  platform can push invoices/payments into Xero).
- **Why it's blocked:** We can't connect to an account that doesn't exist yet, and
  Xero requires the account owner to authorise the connection.
- **What's ready our side:** Finance data (membership, events, sponsorship revenue)
  is already structured and could be exported/synced once connected.

### GoCardless (direct debit payments)
- **What's needed:** A GoCardless account and its API keys.
- **Why it's blocked:** Direct-debit collection runs through GoCardless; without the
  account we can't set up mandates or collect.
- **What's ready our side:** The payment records already have a "GoCardless" method
  option; Stripe is the only live processor until this is connected.

### Branded sending email domain
- **What's needed:** Sarah to confirm a domain to send email from (e.g.
  `hello@theclub…`) so we can verify it in the email provider (Resend).
- **Why it's blocked:** Right now all email sends from a developer domain
  (`dashboard.cortek.io`). Members see that as the "from" address, which isn't
  on-brand for a premium club.
- **What's ready our side:** Every email already goes through Resend on one premium
  branded template — only the "from" address needs swapping once the domain is
  verified. This is a ~10-minute change once we have the domain.

### Real client content (copy, photos, testimonials)
- **What's needed:** Genuine quotes, testimonials, press mentions, event photos and
  any member-attributed copy.
- **Why it's blocked:** We never invent quotes or copy attributed to a real person —
  we need the source material from Sarah.
- **What's ready our side:** All the places these appear (testimonials list,
  galleries, reviews) are built and waiting for real content.

---

## 2. Production / deployment steps (no code left — just configuration)

These are not "waiting on Sarah" so much as **launch checklist** items that must be
done in the hosting dashboards before the live site behaves like local does.

### Add environment variables in Vercel
- **What's needed:** Copy the email + automation settings into the live site's
  environment (Vercel → Project → Settings → Environment Variables):
  - `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`, `FROM_EMAIL`
  - `CRON_SECRET` (so the daily automations can run)
  - Confirm the Supabase + Stripe keys are present too.
- **Why it matters:** Without these, the live site can't send email or run the daily
  automation engine, even though it works locally.

### Supabase build env (already flagged once)
- **What's needed:** Ensure `NEXT_PUBLIC_SUPABASE_URL` and the Supabase keys are set
  in Vercel — a past build failed (`supabaseUrl is required`) because they were
  missing during prerender.
- **Status:** Sarah/owner reported these were added — worth re-confirming on the
  next deploy.

### Deploy the latest site to Vercel
- **What's needed:** A deploy of the current branch.
- **Why it matters:** The Supabase side (database migration + the `checkout` and
  `stripe-webhook` edge functions for guest add-ons) is **already live**, but the
  Next.js app changes from recent sessions are **local only** until the site is
  deployed. Until then, local dev is pointed at an updated backend.

---

## 3. Parked / future (not blocked, just not started)

Lower priority, buildable any time — listed so nothing is forgotten.

- **AI relationship scoring** — the profile fields that feed it are stored; the
  scoring engine itself isn't built yet (there is work-in-progress for this).
- **Segmented marketing campaigns** — beyond the current newsletter + the new
  members CSV export/tag segments.

---

## Resolved

_(Move items here with a date once cleared.)_

- _Nothing yet._
