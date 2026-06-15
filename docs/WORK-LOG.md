# The Club — Work Log

A plain-English record of what's been built, why, and **how to test it**. No
technical jargon — each entry is written so anyone on the team can follow the
steps and confirm the feature works. Newest entries at the top.

> Test accounts (staging): use the member sign-in / admin sign-in pages.
> Test card for any payment step: **4242 4242 4242 4242**, any future expiry,
> any 3 digits for CVC.
>
> **Outstanding items that need Sarah or a production step are listed in
> [Blockers & outstanding items](#blockers--outstanding-items) at the bottom.**

---

## Booking & event flow overhaul (hold-or-charge, approvals, notifications)
**Date:** 15 Jun 2026

**What was asked:** A batch of improvements to the event/booking and membership
flows: branded date pickers; guest accommodation on the website; respect the
"auto-confirm" switch (hold the card instead of charging when off); connect guest
bookings to members who later join; charge a member's card on file instead of
re-asking for it; recover expired cards; admin notification emails; sidebar
"pending" counters; and a proper phone field on the membership form.

**What we did:**
- **Branded date & time pickers.** Creating/editing an event now uses an on-brand
  calendar + time picker (cream + gold) instead of the grey browser one.
- **Guest accommodation on the website.** If an event offers accommodation, guests
  booking from the public site can now add it; the total updates accordingly.
- **"Auto-confirm" now actually works.** When an event has auto-confirm **off**, a
  booking (guest *or* member) now **holds the card without charging** and sits as
  **Pending** for the team to approve — it no longer charges immediately. With
  auto-confirm **on**, it charges right away as before.
- **Approve / reject bookings.** The admin **Bookings** page now has **Approve** and
  **Reject** buttons on pending bookings. Approve **charges the held card** and
  confirms; reject cancels and **releases the card** (nothing taken). Both email the
  guest/member.
- **Members use their card on file.** When a member books, we **charge the card they
  saved when they joined** — no more being bounced to Stripe to retype it. (With
  auto-confirm off, it's held and charged on approval.) If they have no usable card,
  we collect one via Stripe.
- **Expired cards recover gracefully.** If a saved card is expired/declined, the
  booking falls back to collecting a fresh card (and approval surfaces the decline so
  the team can ask for an update).
- **Guest → member connection.** When someone who booked as a guest later joins with
  the same email, their past bookings now attach to their member account (already
  shipped) — they show in the portal and under the member in admin.
- **Admin notification emails.** The team now gets a branded email on a new
  application, a new guest booking, and a new member booking (noting whether the card
  is held or charged), with a dashboard link.
- **Sidebar pending counters.** The admin sidebar shows count badges for
  **Applications**, **Bookings**, **Introductions** (pending) and **Finance**
  (overdue), so you can see at a glance where something needs attention.
- **Phone field with country picker.** The membership application's contact field is
  now a real phone input with a searchable country dial-code picker (UK +44 default).

**How to test:**
1. **Date picker:** Admin → Events → New/Edit → the date fields open a gold calendar.
2. **Hold vs charge (guest):** Edit an event, **uncheck Auto-confirm**, give it a
   guest price (and accommodation if you like). On the public site, book as a guest
   with test card `4242 4242 4242 4242` → you land on "Your request is in" (card held,
   nothing charged). Admin → **Bookings** → the row is **Pending** with **Approve /
   Reject**. Click **Approve** → the card is charged and it becomes Confirmed. Confirm
   in Stripe (test) that no money moved until approval.
3. **Auto-confirm on:** re-check Auto-confirm on the event → booking charges
   immediately (no pending step).
4. **Member card on file:** sign in as a member who has a saved card and book an
   event → you are **not** sent to Stripe; it charges your saved card (auto-confirm)
   or shows Pending (auto-confirm off) without re-entering card details.
5. **Guest → member:** book as a guest with an email, then have an admin add/approve a
   member with that same email → the booking appears under that member.
6. **Admin emails:** with the email settings live, submitting an application or making
   a booking sends the team a notification.
7. **Sidebar counters:** create a pending application/booking → the number appears next
   to that item in the admin sidebar.
8. **Phone field:** Apply for membership → the contact field shows a flag + dial code
   (UK by default); pick another country or type a number.

**⚠️ Note:** the new email settings must be present in the live environment (Vercel)
for the admin/booking emails to send.

---

## Guests & accommodation at event booking
**Date:** 9 Jun 2026

**What was asked:** When a member books an event they should be able to bring a
guest and/or add accommodation, paying for those extras in the same checkout.

**What we did:** On an event's booking card in the member portal, members now see
optional add-ons (only when the event offers them):
- **Bring a guest** — tick it, type the guest's name, and the guest price is added.
- **Add accommodation** — tick it to add the accommodation fee.

The price shown on the **Book** button updates live to the full total, and the
member pays for everything in one card payment. (If the member's own ticket is
complimentary but they add a paid guest or accommodation, the booking simply
becomes a paid checkout for those extras.) The booking records who the guest is and
whether accommodation was taken, and the **admin event page** shows a **"+1 guest:
Name"** tag and an **"Accommodation"** tag against that member in the guest list, so
the team can plan tables and rooms.

**How to test:**
1. As an admin, make sure an event has a **guest price** (and, to test rooms, mark
   **accommodation available** with a price) — Events → edit the event.
2. Sign in as a **member**, open that event. On the booking card you'll see
   **"Bring a guest"** and/or **"Add accommodation"**.
3. Tick **Bring a guest**, type a name — the **Book** button total goes up by the
   guest price. Tick **Add accommodation** — it rises again.
4. Click **Book**, pay with test card `4242 4242 4242 4242`.
5. Back in the admin → that event → **Guest list**: the member's row shows a
   **"+1 guest: <name>"** tag (and **Accommodation** if chosen).

---

## Multi-representative business accounts
**Date:** 9 Jun 2026

**What was asked:** A business membership should be able to cover several people —
a primary contact plus colleagues — who each get their own login and share the
company's membership, with the company billed once.

**What we did:** On any **Business** or **Partner** member's page in the admin
there's now a **"Representatives"** panel. From it you can:
- **Add a representative** — name, email, their role at the business, and whether
  they're the **primary contact**. They're created as a full member in their own
  right (so they get their own portal login and their own introductions), linked to
  the company account, on the **same tier** — but **no separate bill**: payment
  stays on the main company account.
- Optionally **send them a branded invite** to set their password, or add them
  silently.
- **Mark a primary contact** (a gold star), shown at the top of the roster.
- **Open** any representative's own record, or **remove** one (revokes their access
  without touching the company account or the other reps).

If you open a representative's own page, it shows a note linking back up to the
business account they belong to.

**How to test:**
1. Admin → **Members** → open a member → **Edit** → set **Type** to **Business**
   (or Partner) → **Save**.
2. A **"Representatives"** panel appears. Click **Add rep**, enter a colleague's
   details, tick **primary contact**, and save.
3. They appear in the roster with a **Primary** star. Click **Open** to see their
   own member page — it carries the same tier and shows a link back to the company.
4. On the company page, click the remove icon next to a rep — their status becomes
   **cancelled** and their portal access is revoked; the company account is
   untouched.

---

## Members: CSV import, export & tag segments
**Date:** 9 Jun 2026

**What was asked:** Bulk-bring Sarah's existing contacts in as members, and be able
to slice the membership into segments for targeting.

**What we did:** Added three things to the **Members** page in the admin:
- **Import (CSV)** — upload a spreadsheet of contacts. It auto-detects the columns
  (it understands common header names like *first name, surname, email, company,
  role, tier, status*), shows a **preview and a count of how many are ready**, lets
  you set a default tier/status and choose whether to email invites, then creates
  them all in one go. Re-importing the same sheet is safe — existing people are
  updated, not duplicated — and a **results summary** lists anything skipped and
  why (e.g. a missing email).
- **Export (CSV)** — downloads whatever you're currently looking at (after search
  and filters) as a spreadsheet — so a filtered view becomes a ready-to-use list
  for a mailing.
- **Tag filter ("segments")** — a new **tag dropdown** alongside the tier/status
  filters lets you narrow the list to a single interest/industry/need tag. Combine
  it with Export to pull, say, "everyone tagged Property" into a CSV.

**How to test:**
1. Admin → **Members**. Make a small CSV with headers
   `first_name,last_name,email,company_name` and 2–3 rows.
2. Click **Import**, choose the file — you'll see a preview and "X ready to import".
   Leave invites off, click **Import**. The results show how many were added.
3. The new people appear in the list. Run **Import** with the same file again —
   they're **updated, not duplicated**.
4. Pick a **tag** from the new tag dropdown to narrow the list, then click
   **Export** — a CSV of just that segment downloads.

---

## Finance: revenue by source
**Date:** 9 Jun 2026

**What was asked:** The finance page showed one big revenue number. Now that we
track sponsorship money too, the team should see revenue split by where it comes
from.

**What we did:** Added a **"Revenue by source"** panel to the Finance page that
breaks all-time revenue into **Membership**, **Events**, and **Sponsorship**, with
a coloured bar and each source's amount and share. Sponsorship income (committed
sponsor fees) is now also included in the headline revenue total.

**How to test:**
1. Admin → **Finance**. Under the top stat cards you'll see **"Revenue by source"**
   with three figures and a coloured proportion bar.
2. Add a confirmed sponsor to an event (Events → open one → Sponsors → set status
   Confirmed). Reload Finance — the **Sponsorship** figure and the total both rise.

---

## Event sponsorships — manage sponsors per event
**Date:** 8 Jun 2026

**What was asked:** The platform could store sponsorships but had no screen to
manage them. The team needs to attach sponsors to an event, record the package and
fee, and track each sponsor from a first proposal through to paid.

**What we did:** Added a **"Sponsors"** panel at the bottom of each event's page in
the admin. For each event you can:
- **Add a sponsor** — pick the member, name the package (e.g. "Headline", "Drinks
  reception"), set the fee (pre-filled with the event's sponsor price), choose a
  status, and optionally note a showcase slot and why the brand fits.
- **Track status inline** — each sponsor has a dropdown to move them through
  *Proposed → Confirmed → Invoiced → Paid* (or *Declined*), saved instantly.
- **See committed revenue** — the panel totals the fees of every sponsor that's
  Confirmed or beyond, shown next to the heading, so the team sees expected
  sponsorship income for the event at a glance.
- **Remove a sponsor** — with a confirmation step.

**How to test:**
1. Admin → **Events** → open any event → scroll to the new **"Sponsors"** panel.
2. Click **Add sponsor**, choose a member, type a package name and amount, pick a
   status, and save. They appear in the list with their fee and a status dropdown.
3. Change the status dropdown to **Confirmed** — the **"committed"** total next to
   the heading updates to include their fee.
4. Click the bin icon to remove a sponsor (you'll be asked to confirm).

---

## Members can fill in their own matchmaking profile
**Date:** 8 Jun 2026

**What was asked:** The rich member profile (who they want to meet, what they can
offer, goals, preferences) was only fillable by admins. Members should be able to
keep their own matchmaking details up to date from inside their portal — the same
information that drives introductions.

**What we did:** Added three new sections to a member's **Profile** page in their
portal, styled to match the rest of the members' area:
- **Company detail** — sector, sub-sector, team size, annual turnover.
- **Who you'd like to meet** — who they want to be introduced to, what makes a
  great match, their "dream introductions", and what they can offer other members.
- **What you're working towards** — objectives, budgets, partner/assistant names,
  and dietary requirements.

Whatever a member types here is the **same data the admin sees** on the member's
record — so a member updating their own goals instantly improves the matchmaking
the team can do, with no double entry. If the team already filled some of these in
(e.g. carried over from the application), the member sees those values pre-filled
and can refine them.

**How to test:**
1. Sign in as a **member** and open **Profile** (in the member portal).
2. Scroll past Personal/Company — you'll see the new **"Who you'd like to meet"**
   and **"What you're working towards"** sections. Fill a few in and **Save**.
3. Sign in as an **admin** → **Members** → open that same member. Their
   **"Relationship intelligence"** panel should show exactly what the member typed.
4. The reverse works too: anything an admin enters there shows pre-filled when the
   member next opens their Profile.

---

## Every email via Resend + one premium look
**Date:** 8 Jun 2026

**What was asked:** Make sure **every** email — including the "set your password"
emails that used to come from Supabase — is sent through our email provider
(Resend), and give them all one consistent premium look in the brand theme.

**What we did:**
- **The "set your password / welcome" emails no longer come from Supabase.** We
  now create the sign-in link ourselves and send it through Resend with our own
  branded template (used both when an application is approved and when an admin
  adds a member by hand).
- **Pointed Supabase's account emails at Resend too**, as a safety net — so even
  a password-reset or email-change message (if ever used) goes through Resend and
  carries the brand, never Supabase's plain default.
- **Unified every email onto one premium template** in your preferred **light
  cream + gold** theme: welcome/invite, "application received", rejection, all six
  daily automations, and the existing booking-confirmation emails now all look
  identical and on-brand.
- Sent a branded sample to confirm the new look renders correctly in a real inbox.

**How to test:**
1. Check your inbox for the sample email — it shows the new light cream + gold
   design (header wordmark, gold accents, gold button, serif headings).
2. To see the live "welcome" email: in the admin, approve a pending application
   (or add a member). The new member receives the branded **"Welcome to The Club —
   set your password"** email — sent via Resend, not Supabase.
3. Any automated email (renewal, post-event, etc.) sent from the Automations page
   uses the same look.

**⚠️ Still for production:** add the email settings (and `CRON_SECRET`) to the live
site's environment in Vercel, and ideally verify a Club-branded sending domain so
the "from" address isn't a developer domain.

---

## Real email turned on + automated email "machine"
**Date:** 8 Jun 2026

**What was asked:** Switch the platform to a verified email account so emails
reach real inboxes, and build the automatic lifecycle emails the club needs —
renewal reminders, failed-payment notices, post-event follow-ups, guest
invitations, overdue-balance chasers and introduction notifications — with a way
for Sarah to preview and run them anytime.

**What we did:**
- **Connected the verified email account** so emails now deliver to real
  recipients (sent a successful test). Emails read as *"The Club"*. *(Note: the
  current sending domain is a developer domain; for production we'd verify a
  Club-branded domain — see the warning at the end.)*
- Built a daily **"automation" engine** that wakes up every morning, looks
  through the data, and sends the right email to the right people:
  - **Renewal reminder** — membership renews within 7 days.
  - **Failed payment** — a card payment failed; asks them to update it.
  - **Post-event follow-up** — thanks attendees 1–3 days after an event.
  - **Guest → member invitation** — past guests who haven't joined.
  - **Overdue balance** — chases unpaid/overdue invoices.
  - **Introduction notification** — emails both members when an introduction is
    marked "sent".
- Nobody is ever emailed twice for the same thing — the system remembers what it
  has already sent.
- Added an **"Automations"** page in the admin (left menu) with two buttons:
  - **Preview** — shows exactly who *would* be emailed, **without sending
    anything**.
  - **Run now** — sends to everyone currently due (with a confirm step).
- It also runs **automatically every morning** on its own.

**How to test:**
1. In the admin, open **Automations** (left menu, under "Engage").
2. Click **Preview**. You'll see each flow and who would be emailed — likely
   "Nobody due right now" if nothing matches today. **Nothing is sent.**
3. (Optional, to see it find someone) Edit a member and set their renewal date to
   a few days from now, then **Preview** again — they'll appear under "Renewal
   reminders" as *would send*.
4. Click **Run now** and confirm — it sends the real emails and shows how many
   went out. Running again is safe; already-emailed people are skipped.

**⚠️ Before production:** the verified sending domain is currently a developer
domain (`dashboard.cortek.io`), so recipients see that address. For a polished
launch, verify a Club-branded domain in the email provider and update the
"from" address. Also add the email + cron settings to the live site's
environment (Vercel) so production sends too.

---

## Application captures matchmaking info + PITCH routing
**Date:** 8 Jun 2026

**What was asked:** The application form should gather the "due-diligence" and
relationship information the club needs — what an applicant is looking for, what
they can offer, and whether they're an established business or an early-stage one
seeking investment (which should go down a separate **PITCH** track rather than
standard membership). And that information should flow into the member's profile
once approved, so members arrive with it already filled in.

**What we did:**
- Added three questions to the **"Your Business"** step of the application:
  - **"Where is your business right now?"** — Established business, or Early-stage
    seeking investment.
  - **"Who would you like to meet, and what are you looking for?"**
  - **"What can you offer other members?"**
- Based on the stage answer, the application is automatically tagged as either the
  **Membership** track or the **PITCH** track (early-stage seeking investment).
- The admin application review now shows a **"Goals & track"** panel with the
  stage, the track (Membership / PITCH), and the two free-text answers — so the
  reviewer sees the full picture before approving.
- On **approval**, this information (plus sector, turnover and employee count) is
  **carried straight into the new member's profile** — populating the company
  depth and introduction-strategy fields automatically.

**How to test:**
1. Go to **Apply for Membership** and work through to the **"Your Business"** step.
   You'll see the three new questions.
2. Choose **"Early-stage, seeking investment"**, fill in the two text boxes, and
   finish the application (test card `4242 4242 4242 4242`).
3. In the admin → **Applications**, open the new application. The **"Goals &
   track"** panel should show **Track: PITCH — early-stage** plus your answers.
4. Click **Approve**, then open the new member under **Members**. Their
   **"Relationship intelligence"** panel should already show the sector, turnover,
   employee count, "who they want to meet" and "what they can offer" — carried over
   from the application.
5. Repeat choosing **"Established business"** to confirm that application is tagged
   **Track: Membership** instead.

---

## Richer member profiles + Partner tier + Paused status
**Date:** 8 Jun 2026

**What was asked:** The member record is the heart of the platform but only held
basic details. The requirements call for a much richer profile (company depth,
who a member wants to be introduced to, what they can offer, objectives, budgets,
preferences, and relationship scores). We also need a **Partner** membership type
and a **Paused** membership status, which didn't exist.

**What we did:**
- Expanded the member record behind the scenes to hold the **full set of profile
  fields** the spec describes — company detail (sector, size, turnover, profit,
  addresses, finance contacts), introduction strategy, objectives & budgets,
  personal/travel/event preferences, contract & NDA references, lifetime value,
  and the AI relationship scores (these last ones will be filled in automatically
  later). The whole structure is in place now so nothing has to be re-done later.
- Added **Partner** as a membership type (alongside Individual and Business) and
  **Paused** as a membership status (alongside Active, Pending, Expired,
  Cancelled), and made both selectable in the admin.
- Added a new **"Relationship intelligence"** panel on each member's page in the
  admin, with the most important new fields grouped into: *Company depth*,
  *Introduction strategy*, *Objectives & budgets*, and *Preferences*. Admins can
  fill these in and they save with the member. (More of the new fields will be
  surfaced over time; the rest are stored and ready.)

**How to test:**
1. Sign in to the admin dashboard → **Members** → open any member.
2. You'll see a new **"Relationship intelligence"** panel. If nothing's been
   entered yet each section reads "Not provided yet."
3. Click **Edit**. In the membership selectors, **Status** now offers **Paused**
   and **Type** offers **Partner**.
4. Fill in a few of the new fields (e.g. *Sector*, *Who they want to meet*,
   *Dietary requirements*) and set **Status** to **Paused**.
5. Click **Save changes**. The page should reload showing the **Paused** badge and
   your entries listed in the Relationship intelligence panel.
6. Go back to the **Members** list — the status filter now includes **Paused**, and
   the member shows a Paused badge.

---

## Testimonials shown as a list + cleaner member login
**Date:** 6 Jun 2026

**What was asked:** Sarah wanted the testimonials shown as a scrollable list
rather than a slideshow you click through one at a time, a "Testimonials" link
in the top menu, and the staff/admin login link removed from the member sign-in
page.

**What we did:**
- The Reviews page now shows **every testimonial stacked down the page** as a
  list, instead of the one-at-a-time rotating slideshow.
- Added **"Testimonials"** to the main navigation (and renamed it in the footer
  to match).
- Removed the **"Administrator sign in"** link from the member login page so
  members are never pointed at the staff door.

**How to test:**
1. Open the public website → top menu → click **Testimonials**. You should see
   all testimonials listed down the page (scroll to read them all), not a
   slideshow.
2. Go to the member **Login** page. There should be **no** "Administrator sign
   in" link beneath the form.

---

## "Hold the card, charge on approval" membership applications
**Date:** 6 Jun 2026

**What was asked:** When someone applies for membership they should enter their
card, but **no money is taken** until the application is approved. The applicant
should get a "we've received your application" email (not a welcome/payment
email). On approval the card is charged; on rejection nothing is taken.

**What we did:**
- The application form now captures the card at the end with clear small print:
  *"Your card won't be charged until your application is approved. If you're not
  accepted, nothing is taken and your card details are removed."*
- Submitting **saves the card securely without charging it** and marks the
  application **Pending** in the CRM.
- The applicant receives a **"We've received your application"** email.
- When an admin **approves**, the saved card is **charged then** (and the member
  account is created). If the card is declined, approval is refused with a clear
  message and no half-made member.
- When an admin **rejects**, nothing is charged and the saved card is removed.

**How to test:**
1. Go to **Apply for Membership**, complete the steps, and at the payment step
   enter test card `4242 4242 4242 4242`. Submit.
2. You should land on an **"Application received"** page that says nothing has
   been charged, and (if email is configured) get the "we've received your
   application" email.
3. In the admin dashboard → **Applications**, the new application shows as
   **Pending**. Confirm in Stripe (test mode) that **no payment** has been taken
   yet — only a saved card.
4. Click **Approve**. Now a payment should appear in Stripe and the person
   becomes an active member.
5. To test the decline path, apply again with card `4000 0000 0000 0341` (a card
   that fails when charged) and approve — approval should be **refused** with a
   "card declined" message.
6. To test rejection: apply, then **Reject** the pending application — confirm no
   charge was ever made.

---

## Premium admin sidebar
**Date:** 8 Jun 2026

**What was asked:** The admin dashboard's left navigation looked basic; make it
feel premium and on-brand.

**What we did:** Rebuilt the sidebar with the serif "The Club" wordmark (matching
the public site), a calmer look, a single elegant highlight on the current page,
more breathing room, a tidy profile area at the bottom, and a **search box** that
instantly filters the menu as you type.

**How to test:**
1. Sign in to the admin dashboard.
2. The left sidebar should show the serif **"The Club"** lockup, grouped sections
   (Main / Engage / Site), and the current page gently highlighted with a gold
   marker.
3. Type into the **Search** box at the top (e.g. "mem") — the menu should filter
   to matching items (Members, Membership Plans, Membership Benefits). Clear it to
   return to the full menu.

---

## Fixed: website menu wouldn't scroll
**Date:** 8 Jun 2026

**What was asked:** On the public website, opening the full-screen menu and trying
to scroll did nothing.

**What we did:** The site uses a smooth-scrolling effect that was swallowing the
scroll inside the menu. We now pause that effect while the menu is open, so the
menu list scrolls normally, then resume it when the menu closes.

**How to test:**
1. On the public website (desktop), make the browser window short, then click
   **Menu**.
2. Scroll with the mouse wheel — the menu list should now scroll to reveal all
   links and the Apply / Member login at the bottom.
3. Close the menu — the page should scroll smoothly as before.

---
---

# Blockers & outstanding items

Things the platform **cannot finish on its own** — they need something from Sarah,
an external account, or a production deploy step. Plain English. When a blocker is
cleared, move it to **Resolved** at the bottom with the date.

**Last updated:** 9 Jun 2026

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

## 2. Production / deployment steps (no code left — just configuration)

These are not "waiting on Sarah" so much as a **launch checklist** — done in the
hosting dashboards so the live site behaves like local does.

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
- **Status:** Reported as added — worth re-confirming on the next deploy.

### Deploy is automatic from `main`
- **What's needed:** Nothing extra — pushing to `main` triggers a Vercel deploy.
- **Why it matters:** The Supabase side (database migrations + the `checkout` and
  `stripe-webhook` edge functions for guest add-ons) is **already live**. The latest
  app changes are pushed, so the next Vercel build lines the site up with the
  backend — just confirm that build goes green.

## 3. Parked / future (not blocked, just not started)

Lower priority, buildable any time — listed so nothing is forgotten.

- **AI relationship scoring** — the profile fields that feed it are stored; the
  scoring engine itself isn't built yet (there is work-in-progress for this).
- **Segmented marketing campaigns** — beyond the current newsletter + the new
  members CSV export/tag segments.

## Resolved

_(Move items here with a date once cleared.)_

- _Nothing yet._
