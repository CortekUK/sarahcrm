# The Club by Sarah Restrick — Workflow Playbooks & FAQ (LLM Reference)

Source of truth for an in-app help assistant answering non-technical club staff. Every
screen name, button label and status value below is verified against the running code
(`src/views`, `src/app`, `src/lib`) as of this writing. Where the code uses slightly
different wording in different places, both are given.

**Five front doors, one Supabase database:**
| Door | URL | Who | Middleware home |
|---|---|---|---|
| Admin dashboard | `/dashboard` | `admin` | redirected here from `/admin/login` |
| Member portal | `/portal` | `member` (active membership only — cancelled/expired members are bounced at every request) | from `/login` |
| Staff workspace | `/team` | `team_member` / `freelancer` | from `/admin/login` |
| Sponsor portal | `/sponsor/<token>` | sponsors, no login | shared link |
| Public website | `/` | anyone | — |

Roles are enforced in `src/middleware.ts` on every request (not just at login) — e.g. a
member whose `members.membership_status` flips to `cancelled`/`expired` loses `/portal`
access on their very next page load, and staff/admins are hard-redirected out of
`/portal` even if they type the URL directly. New logins are never given a password by
an admin — they always get a branded "set your password" email link (`/set-password`,
minimum 8 characters, at least one letter and one number).

---

## PLAYBOOK 1 — Introducing two members

### 1A. Admin-initiated, from an AI suggestion
1. Open **Members** → the member's detail page, or **Introductions** (`/dashboard/introductions`) directly.
2. On a member profile, scroll to **Suggested introductions / Why this match?** — the platform has already scored every other member against this one and shows the top matches with a **match score** and an AI-written reason (the "why").
   - On the Introductions list screen, the same thing surfaces as **New suggestions** — AI-proposed pairs across the whole membership, ranked by score. Copy: *"Review them below and approve or dismiss."* When none remain: *"Every strong match already has an introduction."*
3. Click **Create introduction** on a suggested pair (from the member profile) — this pre-fills Member A/B and carries the AI's match reason across.
   - Or, from the Introductions list, click **Create Introduction** and manually pick **Member A** and **Member B** by search, write a **Match Reason** ("Why are these members a good match?"), and optionally link an **Event**.
4. The new introduction is created at status **Suggested**.
5. Open the introduction detail page. The **lifecycle bar** runs Suggested → Approved → Sent → Accepted → Completed, with your current step highlighted.
6. Review the **Match Score**, **Match Reason**, **Desired outcome**, **Event** (if any).
7. Click into **Review & send introduction**. The platform drafts **two separate emails** — one to each member ("First introduction" and "Second introduction"), each with its own editable **Subject**, body and **Template**.
8. Edit either draft if needed. Per email, choose **Send now** or **Pick a date** to schedule it — *"Send or schedule each one independently."* This is the point where an introduction becomes **Approved** then **Sent**.
9. Track responses on the list/detail as they come in: *Sent · awaiting reply → Accepted · 1 of 2 → Ready to connect* (once both members accept).
10. Once the meeting has happened, go back to the introduction and record the **Outcome** — meeting held, opportunity created, revenue generated, and any commission. This is not optional bookkeeping: it is what populates the ROI card on both members' profiles, the Commissions ledger, and the Executive dashboard's revenue-via-introductions figure. Skipping this step is the single most common way the club under-reports its own value.
11. If either member declines, the introduction shows *"This introduction was declined"* with their reason (if given), and stops there.

### 1B. Member-requested (member asks The Club to introduce them to someone)
1. The member signs in to the portal, opens **Network** (`/portal/network`) — the member directory, each card showing the other person's industry, interests, events attended and introductions made.
2. They click **Request introduction** on the member they're interested in, write why, and click **Send request to The Club**.
3. The portal blocks duplicate requests: *"An introduction with this member is already in progress."* Each member also has a **Monthly Intro Quota** set by their tier, which caps how many requests/introductions they can generate in a period.
4. The request lands instantly in the admin **Introductions** list at status **Requested**.
5. Admin reviews it: either proceed exactly as in 1A from step 6 onward (approve → draft the two emails → send), or click **Reject request** with an optional reason — the requesting member is notified of the rejection.
6. From here on the flow (send, accept/decline, outcome, commission) is identical to the admin-initiated path.

### Member accepting/declining an introduction proposed to them
1. Member opens **Introductions** in the portal (`/portal/introductions`) — introductions proposed to them appear here.
2. Two buttons: **Yes, introduce us** / **No, thank you**.
3. State is shown in plain English: *"You accepted this introduction."* / *"You declined this introduction."* / *"You both accepted — The Club will connect you shortly."* / *"Requested — with The Club for review."*
4. Members can also record their own **Outcome** from the portal.

### Why an untagged member never appears in matches
The matcher's entire model is one sentence: **it pairs one member's "Looking for" tag against another member's "Industry" tag.** A member with no tags, or only "Interest"/"Service"/"Other" tags, produces weak or zero matches. Fix it in the member's **Tags** section (member detail page) — add manually, or click **AI suggestions** to have the system propose tags from their profile, then click a suggestion to accept it.

---

## PLAYBOOK 2 — Membership application → live member

1. **Public side:** a prospect completes the 8-step application at `/membership-application`:
   | Step | Captures |
   |---|---|
   | I. Contact Details | Name, email, phone, address (email is checked against existing members **here**, at step I, so nobody fills in the remaining 7 steps only to be told they already have an account) |
   | II. Our Location | Manchester / Leeds / London |
   | III. Events Interest | Multi-select interest chips |
   | IV. Build Profile | Photo, nationality, identity, bio |
   | V. Online Profiles | LinkedIn / Instagram / X / YouTube / TikTok / Website (all optional) |
   | VI. Your Business | Company, sector, position, work email, scale |
   | VII. Choose Membership | Individual / Business / Corporate |
   | VIII. Select Payment | Annual / Monthly, card details |
2. At payment, the applicant's card is **saved, not charged**. Nothing is taken from them at this point.
3. They land on an "Application received" confirmation page confirming nothing has been charged, and (if email is configured) receive a "we've received your application" email.
4. It appears in admin **Applications** (`/dashboard/applications`) at status **Pending**.
5. Admin opens it and reviews every field, grouped: Profile · Contact · Identity (pronouns, nationality, identifies as) · Business (company, industry, role, work email, employees, annual turnover, business stage) · Membership preference (tier, track, payment cadence, preferred location) · Goals & track (who they want to meet, what they can offer) · Online presence · How they heard · Internal notes (private team context).
6. Choose one of three actions:
   - **Shortlist** — button label exactly **Shortlist**. Parks it, stays visible, status → Shortlisted. Silent, no email sent.
   - **Reject** — button reads **Reject & refund** if a refund is due, or **Reject application** if not. Confirmation dialog explains the refund handling; if the refund needs manual attention, the row is flagged *"Refund needs attention"*. Silent — no rejection email is auto-sent to the applicant unless configured.
   - **Approve** — button reads **Approve & create member**. The confirmation dialog explicitly states: *"Approving provisions an auth account, adds them to Members, and emails them a branded link to set their password and enter the portal."* Confirming this dialog reads **Approve & send invite** (confirm label). This one click:
     - creates their `members` record,
     - provisions their Supabase auth account,
     - sends the branded "set your password" invite email,
     - carries their application photo and website across to their member profile.
7. **This is the only correct way to create a member from an application.** Adding a member manually (below) does not wire up any of this automatically.
8. If provisioning or the invite email failed, the row still shows **approved** but the button now reads **Re-provision member** / confirm label **Re-provision & re-send** — use it to retry without duplicating the member record.
9. The new member instantly appears in **Members**, the **Portal** (once they set a password), **Finance**, and the **Pipeline** board (as a Membership card).

---

## PLAYBOOK 3 — Adding, importing, enriching, tagging and scoring members

### Add a member manually
1. **Members** (`/dashboard/members`) → **Add member** (top right).
2. Fill in the form by hand (name, contact, tier, status, etc.). No login/invite is auto-provisioned unless you separately trigger it — use **Resend login** on the member's detail page header to send the "set your password" invite.

### Import members from CSV
1. **Members → Import** → **Choose a CSV file** (plain `.csv` with a header row).
2. The file is parsed **in the browser**; you get a preview table (Name / Email / Company). Messy headers are auto-matched to the right fields.
3. Set **Default tier**, **Default status**, and whether to send **Email invites**.
4. Run it → result summary: **Added · Updated · Skipped**.
5. Re-importing the same file is safe: existing people are matched by email and **updated**, never duplicated.

### Enrich a member
1. Open the member's detail page → **Relationship intelligence** card → click **Enrich** (or **Re-enrich** if already run once).
2. Status badges cycle: *Enriching… → Enriched* / *Company found* / *No business domain* (free email addresses like gmail.com can't be enriched to a company).
3. **It only fills empty fields.** Anything already typed by an admin is never overwritten — safe to re-run any time.
4. This is powered by the enrichment provider (`src/lib/enrichment/`, currently Apollo — org data works on the free key; person/seniority data needs the client's paid key). A drop-in swap to Clay is the documented next step.

### Tagging
1. Member detail page → **Tags** section.
2. Add tags by hand, or click **AI suggestions** to have the system propose tags from the member's profile, then click a suggestion to accept it.
3. Tag categories: **Industry** (what they do), **Looking For** (what they want — matched against another member's Industry), **Interest** (soft signal), **Service** (what they offer), **Other** (not used by matchmaking).
4. Manage the tag vocabulary itself at **Tags** (`/dashboard/tags`) or **Settings → Tags** (same manager, two entry points) — add/rename/delete per category; duplicates within a category are blocked.

### Member scoring
- Scores live on the member profile under **Relationship scores**: Relationship health · Engagement · Churn risk · Upgrade potential · Relationship capital.
- Computed by `computeMemberScores()` (`src/lib/members/scoring.ts`), recomputed **daily** as part of the automation run — not live/instant.
- Force a refresh from **Member Success** (`/dashboard/members/success`) → **Recompute now**.
- **Member Success** is the retention worklist: filters by flag — **At risk** (churn score ≥60) · **Dormant** (no activity 90+ days, or never) · **Renewal soon** (renewing ≤30 days) · **Upgrade ready** (upgrade score ≥70) — and shows each member's **Top reason** in plain English. Empty state: *"Everyone looks healthy."* Work this weekly, not daily.
- The **Executive** dashboard's "AI recommendations" (Introductions to make / Members at risk / Upsell opportunities / Hot prospects) read these same stored scores.

---

## PLAYBOOK 4 — Events: create, publish, ticket, guest list, check-in, post-event

### Create and publish an event
1. **Events** (`/dashboard/events`) → **New event** (or the equivalent create button) → `/dashboard/events/new`.
2. Fill in: title, slug, description, **event type** (Member Event / Curated Luxury / Retreat), start/end dates, times, venue, capacity, pricing (member/guest/sponsor price, all stored in pence), agenda, speakers, imagery.
3. Four toggles: **Travel included** · **Accommodation available** · **Guest list visible to members** · **Auto-confirm bookings**.
4. Save as **draft**, or publish. Status values in order: `draft → published → live → completed → cancelled`.
5. The six list-screen tabs are: **All · Member Events · Curated Luxury · Retreats · Past · Private Events**. **Private Events** is a separate, simpler list of bespoke commissions shown on the public `/private-event-services` page (its own **Add private event** / Edit / Delete — not the same as a bookable `curated_luxury` event).

### Ticketing / Stripe checkout (public + member side)
1. Public visitors book at `/events/<slug>`; members book from **Portal → Events** (`/portal/events`) → **Reserve seat** (or "Fully booked" if capacity is hit).
2. Pricing shown is calculated per viewer — **Complimentary**, a **member tier benefit** rate, or **Your sponsor rate** if they're linked as a sponsor.
3. Payment runs through Stripe Checkout. On success, a confirmation page reads *"Your seat is held."* or *"Reserved with thanks."* and carries a **QR code** for door check-in.
4. Some bookings land as **Pending** first (rather than auto-confirmed) if the event's **Auto-confirm bookings** toggle is off — these must be actioned in admin **Bookings**.

### Guest list and invites (event detail page)
- **Invites panel** — three tabs: **Invited · Confirmed · Declined**. Add an **Existing member** or an **External guest** (name + email). **This list never sends an email — it is a tracker.** You invite people yourself by whatever channel you like and record them here; the email address entered is used only to auto-match them from Invited to Confirmed once they actually book. You can also mark someone Confirmed or Declined by hand.
- The **only** invite in the Events area that actually sends mail is the **sponsor** invite inside the Sponsors panel (below).
- **Guest list panel** — every booking: Guest · Status · Amount · Payment · Dietary · **Check-in**.

### Check-in (door)
- Click the **Check-in** cell on a guest-list row to toggle checked-in (or undo), or mark a **no-show**.
- Every booking confirmation also carries a **QR code** that opens `/checkin/<bookingId>`.
- A team member scans it **while signed in as an admin**; the guest is then marked checked-in/attended.
- If the scanning device isn't signed in as an admin, it shows *"Admin sign-in required"*.
- A guest scanning their own QR pass can never check themselves in — this is enforced at the database level (RLS), not just hidden UI.

### Expenses and P&L
- **Expenses panel** — add cost lines by category: **Catering · Staffing · Marketing · Talent / Speakers · Branding · Uncategorised**.
- Live tiles: **Revenue · Cost · Profit · Margin** (revenue is already known from ticket sales; you only enter cost lines).
- Rolls up into Finance's **Event P&L** table and Accountability's **Time & Profitability** (if staff hours were logged against a task linked to this event).

### Sponsors (on the event) — see also Playbook 9 for the intelligence layer
1. **Sponsors panel** on the event detail page.
2. Add a sponsor: **Existing member** or **External sponsor**.
3. Set the **package name**, the **amount**, and the sponsorship **status**: **Proposed → Invoiced → Received**.
4. **Generate proposal** (AI) → review the drafted proposal on screen → **Send** it to the sponsor by email — this is the one action here that actually sends mail (besides the sponsor invite).
5. Manage **deliverables**: Assets required · Branding deadlines · Guest allocation · Other deliverables, plus the sponsor's reserved booking rate.
6. **Copy portal link** — the sponsor's private `/sponsor/<token>` portal link, to hand to them (no login needed).
7. **Copy booking link** — their reserved-rate booking link for guests they bring.
8. **Generate ROI report** (AI) — publishes to the sponsor's portal for them to view.

### Post-event
- Attendance is whatever was recorded via check-in.
- Finalise the **Expenses panel** for a true Profit/Margin figure.
- **Generate ROI report** for any sponsors on the event.
- Start a **Marketing** campaign sourced from the event (recap blog, LinkedIn, Instagram, sponsor recap — see Playbook 6).
- The **post-event follow-up automation** fires on its own 1–3 days after the event ends (no admin action needed) — see Playbook 15.

---

## PLAYBOOK 5 — Bookings and enquiries

### Bookings (`/dashboard/bookings`) — every booking across every event, in one place
1. Stat tiles: **Confirmed · Pending · Total · Revenue**.
2. Search by name/email/event; filter All / Confirmed / Pending / Cancelled / Refunded.
3. Table: Guest · Event · Booked · Amount · Method · Status. Click a row to open the event.
4. Pending bookings carry two actions: **Approve & charge** (charges the held card and confirms) or **Reject** (cancels and releases the held card).
5. Tooltips flag **Checked in at the event**, **Host invite — no charge**, and **Member tier benefit** rows.
6. The Bookings badge in the sidebar is a live to-do count — clear it daily; while a pending booking sits there, that guest's card is on hold.

### Enquiries (`/dashboard/enquiries`) — public contact-form submissions
1. Stat tiles: **New · Replied · Closed · Total**.
2. Filters: status, and **owner** (All owners / Unassigned / each admin). Search across name, email, company, message.
3. Table: From · Subject · Source · Score · Owner · Received · Status. **Source** is the enquiry type (General enquiry, Membership, Sponsorship, Private event, Venue/space hire, Concierge, Press/media, Upcoming event, Contact form). **Score** is the AI lead score, computed deterministically (0-100) at intake.
4. Every new enquiry is **auto-assigned** to an owner by type — the mapping lives in **Settings → Enquiry Routing** (default owner: First admin). Reassign any row manually.
5. **Enrich** pulls company/person detail (Company, Website, Industry, Employees, Est. revenue, Company/Person LinkedIn, Seniority, Phone) via the same enrichment provider as members.
6. **Reply via email** composes the reply in-line and sends it as a branded Club email; the row auto-flips to **Replied**.
7. **Internal notes** — team-only, never shown to the sender.
8. Qualifying enquiries automatically get a **sales follow-up task** created (a tooltip shows when one has been).
9. Delete permanently removes the message.
10. Enquiries also arrive from the **Website Concierge** AI chat widget (`source: concierge_chat`) and can arrive via the same intake route from other channels (e.g. a future WhatsApp assistant) — they all land here identically.

---

## PLAYBOOK 6 — The shared Inbox, Gmail sync, drafting replies

1. **Inbox** (`/dashboard/inbox`) is the connected Gmail mailbox(es), inside the CRM.
2. If a staff member sees *"No inbox access — Ask an administrator to grant you access"*, an admin must grant it: **Manage inbox access** → pick a **Staff member** → grant (revocable any time).
3. Layout: mailbox tabs at top (**All**, or a specific mailbox) + an **All / Unread** filter + a **Search mail…** box; conversation list on the left, full thread on the right.
4. Remote images are blocked by default for safety — click **Display images** to load them, **Hide remote images** to re-block.
5. **Sync timing is real and cron-driven** (`vercel.json`): mail sync every **15 minutes** (`/api/cron/gmail-sync`), a separate history backfill every **5 minutes** (`/api/cron/gmail-backfill`), and hourly structured extraction into the CRM (`/api/admin/google/gmail/extract`, on the `:30` past every hour). How far back sync reaches is set in **Settings → Email Sync**.
6. On a member's detail page, the **Gmail thread panel** shows the email history with that person. Click **Draft reply** to get an AI-written draft; the draft is **saved to Gmail as a draft**, never sent — the confirmation reads *"Draft saved to Gmail — Open Gmail to review and send."* The platform never sends on your behalf.
7. **Settings → Email Sync**: **Enable email sync**, **Sync history (months)**, and a **Noise filter** that drops automated/bulk mail so the Inbox stays about real people.

---

## PLAYBOOK 7 — Marketing: segments, voices, templates, campaigns, graphics, library

`/dashboard/marketing` — top-level **Marketing** nav section with four children: **Campaigns · Templates · Voices · Segments · Library** (five, including the landing Campaigns page). Nothing here ever auto-publishes; every channel waits in an approval queue.

### Voices (`/marketing/voices`) — set these up first
- Two editable voices: **The Club** (formal luxury) and **Sarah** (warm founder).
- Per voice: **Display name**, **Guidance** ("How should this voice sound? Tone, register, spelling, sign-off…"), and a list of **reference sample posts** you paste in.
- Generation reads both the guidance and the samples so drafts actually sound like the club, not a generic AI voice.

### Segments (`/marketing/segments`) — rule-based live audiences
- **New segment** — name it, then filter on **Membership tier** (Tier 1/2/3), **Membership status** (Active/Pending/Expired/Cancelled/Paused), **Membership type** (Individual/Business/Corporate) and **Tags**, combined with **Match ANY** or **Match ALL**.
- The builder shows a **live matching-member count + sample names** as you tick filters.
- A segment is a **live rule**, not a frozen list — it always reflects who currently matches. Send to it from the Newsletter → Campaigns wizard (segments appear as a third audience option alongside "All active subscribers" and custom lists).

### Templates (`/marketing/templates`) — social graphic templates (NOT the email designer — see Playbook 12)
- **New template** — name, **Shape**, background image, and ordered **slots**: **Heading · Subtext · Fixed line** (a constant string) **· Photo**.
- Per slot: **Zone**, **Font**, **Size**, **Align**, **Text colour**, with a live preview.
- Or choose **Use image as-is (no text overlay)**.
- At generation time, the AI fills the text slots and drops in a real photo.

### Campaigns (`/dashboard/marketing`) — the generator + approval queue
1. **New campaign** → give it a title → choose the **source**:
   - **An event** (pick from the list),
   - **A typed topic / brief** (free text: angle, key points),
   - **An audio recording** — upload mp3/m4a/wav up to 25 MB; it's transcribed via OpenAI Whisper and you can **edit the transcript** before generating.
2. Tick the **channels to generate** (grouped): Blogs (**SEO blog**, **Recap blog**), **LinkedIn** (always produces FOUR drafts: The Club voice, Sarah voice, a Sponsor angle, a Founder-spotlight angle — regardless of the default voice picked), Instagram (**Feed**, **Carousel**, **Reel**), **Newsletter**, **Press release**, **Sponsor recap**.
3. Pick the **Default voice** — The Club or Sarah — applied to every single-voice text channel.
4. Choose a graphic option (template graphic auto, a specific template, or caption-only).
5. **Create & generate.**
6. Land on the campaign detail / approval queue: one card per channel (+4 for LinkedIn), each showing a status badge starting at **draft**.
7. Per card: **Edit** the copy inline → **Save**; **Regenerate** (replaces just that card's draft — LinkedIn regenerate touches only the one variant you clicked); **Copy** (clipboard); **Reject** (→ rejected); **Approve & publish** (→ published, timestamps `published_at`).
   - Blog/LinkedIn/Instagram/PR/sponsor-recap channels route through a **publishing adapter** on Approve — currently a `MockPublisher` (logs the intended publish, doesn't actually post anywhere) because live Metricool publishing isn't connected yet. Copy-to-clipboard is how you actually post today.
   - The **Newsletter** card is read-only in the queue — no Approve/Reject/Edit there. It shows **Open in email designer**, which deep-links to `/dashboard/communications/templates/editor?id=<id>` where you finish, approve and send it for real through Resend.
8. **Nothing publishes until you click Approve** (or, for the newsletter, until you send it from the email designer).

### Library (`/marketing/library`)
- Every finished piece — **approved, published, or a newsletter handed to the designer**. Search by title/body; filter by **channel · voice · event · sponsor**.
- Per piece: copy it, open its parent campaign, or **reuse it as the starting point for a fresh draft** — this clones it into a brand-new campaign (`source_type='topic'`, seeded with the original text) without ever touching the original piece.

---

## PLAYBOOK 8 — Newsletter

`/dashboard/newsletter` — three tabs.
1. **Subscribers** — everyone who signed up. Add by hand, search, unsubscribe/re-subscribe. Table: Name · Email · Source · Joined · Status. Tiles: Active · Unsubscribed · Total.
2. **Lists (audiences)** — **New audience**: a name + description, then add recipients — newsletter subscribers **and** approved members side by side. There's also a built-in **All active subscribers** audience.
3. **Campaigns** — **New campaign** wizard: pick a **campaign-type template** (built in Communications → AI Templates, or generated via Marketing → Campaigns → Newsletter channel), pick an **audience** (a saved list, "All active subscribers", **or a smart segment**), set **Subject** and **Preview**, then send. Table: Campaign · Template · Audience · Recipients · Status · Created.
4. **Teaching point:** the newsletter has no editor of its own. Design/edit the email in **Communications → AI Templates** (the block-based email designer), send it from here (or from Marketing's generated Newsletter card via "Open in email designer" → send there).

---

## PLAYBOOK 9 — Sponsorship: prospects, matching, deck parsing, outreach, proposal, portal, ROI

`/dashboard/sponsorship` — top-level **Sponsorship** nav section: **Hub · Prospects · Review queue**. This is the intelligence layer sitting on top of the existing per-event sponsorship spine (Playbook 4's Sponsors panel).

### Hub (`/dashboard/sponsorship`) — find sponsors for an event
1. Choose an **Event**.
2. Optionally add a **Brief** — free text describing the ideal sponsor (sectors, audience fit, deal size).
3. Optionally **paste deck text** (the sponsorship deck/prospectus) — it's summarised by AI and blended into the matching criteria. (Only paste-text is wired up; there's no file-upload control for the deck yet.)
4. Click **Find ideal sponsors**.
5. Matching is **warm-first**: it prioritises past sponsors and CRM members flagged `sponsor_aligned`, ranks them with a **+20 score boost** over cold results, and only reaches for **cold discovery** (the enrichment vendor) when there are fewer than 8 warm matches. Results split into **Warm (CRM)** and **Cold (discovery)** with tiles: Prospects found · Outreach sent.

### Prospects (`/sponsorship/prospects`)
- The shortlist, funnel status: **Cold → Shortlisted → Approved → Replied** (or Dismissed).
- Each row: Company · Contact · Website · Details, with a **match score** and **AI rationale**.
- Expand a row for decision-makers (looked up per company) — shows *"No decision-makers found for this company"* when the vendor has none, and a clear "needs a paid vendor plan" message if people-search requires an upgrade (this is the current state on the free enrichment tier).
- Actions: **Draft outreach** (opens the outreach editor for this prospect), or **Add to event sponsors** — this converts the prospect into a real `sponsorships` row and pushes it into the event's normal Sponsors panel workflow (Playbook 4), stamping `converted_sponsorship_id` so the prospect record and the sponsorship stay linked.

### Review queue (`/sponsorship/outreach`) — the human gate
- *"Every drafted step waits here. Edit the copy, approve it, then send — nothing leaves until you approve and click Send."*
- Filter by event, status, voice.
- Per draft: **To/Recipient**, **Subject**, **Body**, its **Steps** in the sequence (first touch + follow-ups, drafted by the same AI), **Voice** (Club/Sarah, reusing the Marketing voices), and a **Note for the writer** field.
- Edit → **Approve** → **Send**. Trying to send an unapproved draft is blocked with the exact message **"Approve first."**
- Sending today goes out via the existing Resend pipeline (logged same as any club email). An "Instantly" automated-sequence sender exists only as a documented stub — not live.
- Reply/bounce tracking on outreach is not yet automatic — `response_at`/`replied`/`bounced` fields exist but nothing populates them yet; treat replies as manual for now.

### The rest of the sponsorship spine (already existed before this intelligence layer)
- **Proposal**: from the event's Sponsors panel, **Generate proposal** (AI) → review → **Send**.
- **Sponsor portal** (`/sponsor/<token>`, no login): the sponsor sees **Assets required** (they can upload a file or add a note → **Provide asset** → flips to *Provided*), **Branding deadlines**, **Guest allocation**, **Other deliverables**, and **ROI report** (shown as *"Your ROI report"* once you've generated one). When nothing is outstanding: *"Nothing required here at the moment."*
- **ROI**: **Generate ROI report** (AI) on the event's Sponsors panel, published straight to the sponsor's portal.
- Automated **sponsor follow-up chasers** fire at 3 / 7 / 14 days for any sponsor still sitting at **Proposed** (Playbook 15).

---

## PLAYBOOK 10 — Team accountability

`/dashboard/accountability` — eight sub-tabs. This is the internal staff-management system; staff see only their own slice at `/team`.

1. **Overview** — read-only snapshot: status bar (Not started / In progress / Blocked / Done), overdue tasks, blocked tasks, who hasn't submitted a handover, per-staff workload. Clear state: *"No overdue or blocked tasks, everyone has submitted today's handover, and no scorecard is running low this week."*
2. **Tasks** — **Assign task**: Owner (required), title, description, deadline, category, optionally an **Event** link (this is what makes hours roll up into Time & Profitability). Full comment thread + attachments + an append-only activity log on every task. Statuses: Not started / In progress / Blocked / Done.
3. **Team Members** — **Add team member**: first name, last name, email, job title, **Type** (Team member / Freelancer), hourly **rate**. **Send login** emails the set-password invite. **Deactivate / Reactivate** removes access without deleting history.
4. **Time & Profitability** — hours roll up from each staff member's tasks (manual entry or a start/stop timer) to the event they're linked to. Admin types in the event's **Revenue**; the system computes **Cost = Σ(hours × rate)** and **Profit = Revenue − Cost**. Per-staff summary shows total hours logged. Rates and revenue/profit are **admin-only** — staff can log their own hours but can never see rates or the resulting P&L (deliberate, dedicated RLS table `staff_rates`, not a column on `profiles`, because `profiles` is readable by any authenticated user).
5. **Scorecards** — **Add target**: a label, a target number, and a **source** — **auto** (pulls live from tasks completed or hours logged that week) or **manual** (self-reported by the staff member in `/team`, admin can override). Weeks run Monday→Sunday. **Generate report** on Friday produces a performance score (% of targets met) + an AI narrative.
6. **Daily Handover** — every staff member submits a short end-of-day note (What I completed today / What I'm working on tomorrow / What's blocked / Support needed) from `/team`, one per day, editable that day. Admin picks a date, sees who has/hasn't submitted, and clicks **Generate report** → **"Sarah's Daily Leadership Report"**, an AI condensation of the day.
7. **Finance Tasks** — recurring finance deliverables (management accounts, VAT, payroll, cashflow). **Add finance task**: the deliverable, its recurrence (monthly/quarterly/annual), a **due day** (1-28), and three named contacts: **accountant**, **escalation contact (Finance Director)**, **final contact (Sarah)**. When an occurrence goes overdue, the system **automatically emails each level in turn** (accountant at day 0, FD at day 3, Sarah at day 7) — never twice, tracked by a stored `escalation_level`. Mark complete when done. *"The system chases, not Sarah."*
8. **SOP Library** — **Add SOP**: title, category (or **+ New category**), rich-text body via a small toolbar (bold/italic/underline/headings/lists/quote/link). **Save as draft** while refining → **Publish** (badge flips green, *"Published — staff can now read it"*) → **Unpublish** any time. Staff get a read-only **Playbook** panel at `/team` showing only published SOPs.

Staff logins are entirely separate from admin CRM access (enforced by RLS, not just hidden nav) — a `team_member`/`freelancer` sees exactly four panels at `/team`: **Scorecard**, **Daily handover**, **My tasks**, **SOP library** — and nothing else in the CRM, ever.

---

## PLAYBOOK 11 — AI operational agents

### Chief of Staff (`/dashboard/chief-of-staff`)
- The single daily leadership briefing. Click **Generate today's briefing** (or **Regenerate today's briefing** to refresh after the morning's work).
- Hero narrative ("Good morning, Sarah / Your daily briefing") + six blocks: **Memberships**, **Sales pipeline**, **Finance**, **Events**, **Team**, **Risks**.
- Runs automatically every morning as part of the daily automation cron and is emailed to admins around the configured send hour (default 07:00 Europe/London) — nothing is typed in by hand; every figure reconciles with its source screen.

### Member Success Manager
- Not a separate chat agent — it is the **Member Success** screen (Playbook 3) plus a background daily sweep (`memberSuccessSweep`) that recomputes every active member's health/churn/upgrade scores, feeding both that screen and the Chief of Staff's "Risks" section and the Executive dashboard's AI recommendations.

### Website Concierge
- A public AI chat widget on the marketing site (bottom-left floating launcher, night-palette panel) that qualifies visitors conversationally and, when ready, creates a CRM **Enquiry** automatically (`source: concierge_chat`) via the same intake pipeline as the `/contact-us` form — so it gets scored, routed and acknowledged identically. It never talks about anything outside its scope, has multiple abuse protections (honeypot field, message caps, per-IP rate limits), and degrades to a calm canned reply rather than erroring if the AI call fails.

### Deferred agents (documented, not built — need external accounts)
- **WhatsApp AI Assistant** — blocked on WhatsApp Business Meta verification.
- **AI Phone Receptionist** — blocked on a telephony/voice provider (e.g. Twilio/Vapi).
- **Onboarding-Call Recorder** — blocked on a meeting-transcription service (e.g. Fathom/Otter).
None of these exist as working features yet; if asked, say they are planned and blocked on an external account, not "coming soon."

---

## PLAYBOOK 12 — Finance: invoices, payments, commissions, Xero sync

### Finance (`/dashboard/finance`)
1. Six headline tiles: **Revenue · Outstanding · Subscriptions · MRR · Renewal rate · Concierge GMV**.
2. **From Xero** summary card — historic spend pulled, members with spend, last-synced timestamp (appears once a spend sync has run). Trigger any Xero sync from **Settings → Integrations → Xero**: **Connect/Disconnect · Sync contacts · Sync invoices** (pushes ALL revenue streams — membership, sponsorship, concierge, introduction commissions as sales invoices; referral payouts as bills the club owes) **· Sync spend** (pulls each member's real historic paid total back from Xero into `members.xero_spend_pence`).
3. **Revenue by source** — Membership · Events · Sponsorship · Concierge · Referrals, as a bar chart.
4. **Cashflow — last 12 months.**
5. **Event P&L** — per event Revenue/Cost/Profit/Margin (fed by the event Expenses panel).
6. **Revenue by member & LTV** table, now including the Xero spend column.
7. **Overdue Invoices** — the chase list, and the thing that drives the red Finance sidebar badge.
8. **Recent Payments** — Date · Member · Type · Method · Amount · Due Date · Status; click a row for **Payment Details**. Payment types: Membership, Invoice, Applicant, Sponsorship, Concierge, Referrals. Methods: Stripe, GoCardless (GoCardless is wired in code but only Stripe is a genuinely connected processor until the client provides GoCardless credentials).

### Commissions (`/dashboard/commissions`)
- Two directions, deliberately kept separate and never netted: **Receivable** (the Club earns — from introductions/concierge) and **Payable** (the Club owes members — from referrals).
- Four tiles: Receivable owed · Receivable received · Payable owed · Payable paid.
- Filter by **source** (Introduction / Concierge / Referral), **direction**, **status** (Owed/Paid).
- **Mark paid / Mark unpaid** per row, with a confirmation explaining which way the money moves.
- **You never create a commission here directly** — it appears the moment you record an outcome/commission value on its origin record: a won introduction's Outcome, a concierge request's Commission field, or a member referral. An empty ledger means outcomes aren't being recorded upstream — check Introductions and Concierge first.

### Xero — what's actually live
- OAuth2 connect/disconnect, member↔Xero contact sync (all 88 test members linked), payments pushed as ACCREC sales invoices (idempotent — already-pushed payments are skipped), sponsorships/concierge/intro-commissions pushed as sales invoices, referral payouts pushed as ACCPAY bills, and historic spend pulled back per member. Go-live only needs reconnecting to the client's real GBP Xero organisation — no further code work.

---

## PLAYBOOK 13 — Contracts & e-signature

Contracts live inside **Communications → AI Templates** (`/dashboard/communications/templates`), below the email templates list, in their own **Contracts** panel — not a separate top-level nav item.
1. **New contract** → opens the same block-based editor used for emails.
2. AI starter prompts: *"Draft a standard membership agreement"* · *"Write a mutual NDA for a prospective member"* · *"Create an introducer commission agreement."*
3. **Insert field / Insert variable** — pick from **Member fields** and **Signature fields** to personalise per-recipient.
4. **Send for signature** — enter **Signer email**, **Email subject**, **Message to signer**; goes out via DocuSign.
5. First-time use requires one-off DocuSign authorisation: *"Click below, sign in and choose Allow, then send again"* → **Grant access**.
6. Track **Signature status** on the contract and click **Refresh status** to poll DocuSign; **View document** once it's signed.
7. Signed agreements can be filed in the member's **Document vault** (member detail page) alongside onboarding forms, NDAs and introducer/commission agreements.

---

## PLAYBOOK 14 — Rewards, reviews, referrals

### Rewards (`/dashboard/rewards`) — three tabs
1. **Partners & offers** — **New partner**: Name, Category (Luxury Retail / Restaurants / Health & Wellness / Watches & Jewellery / Automotive / Property / Business Services), Summary, Description, Logo, Website URL, Booking URL, contact details, Notes, Active toggle. **New offer** (under a partner): Title, **Member benefit** (headline), **Details (member-only)**, **Discount code (member-only)**, **Redemption process**, **Value (£)**, **Valid until**, and a **Public** toggle — Public controls whether it shows on the public `/rewards` page vs. members-only.
2. **Claims** — every member claim: Member · Offer · Partner · Claimed date · Status (**Claimed → Redeemed**, or Cancelled).
3. **Referrals** — the referral commission ledger. **New referral**: Referring member · Referred name · what it was for · Revenue (£) · Commission (£) · Status. Tiles: Commission owed · Commission paid. (This flows into the Commissions ledger's Payable side.)

### Member side (Rewards, portal)
- **Portal → Rewards** (`/portal/rewards`): browse the benefits directory → **Claim this offer** → *"Claim to reveal your code"* → the discount code and **How to redeem** are shown. Their claim history appears below. Every claim instantly shows up in the admin Claims tab.

### Reviews (`/dashboard/reviews`)
1. Reviews arrive from the public `/share-your-experience` form. Stat tiles: Pending · Approved · Rejected · Total.
2. Table: From · Review · Event · Received · Active · Status.
3. **Approve** → publishes to the public `/reviews` page. **Reject** → never appears. A review can be returned to Pending.
4. **The Active toggle** hides an *approved* review from the public page **without rejecting it** — e.g. while checking a detail with the reviewer. This is separate from Approved/Rejected — don't confuse the two.
5. **Internal notes** per review.

---

## PLAYBOOK 15 — Automations (the nine lifecycle flows)

`/dashboard/automations` — inspect and, if needed, force the flows that otherwise run entirely on their own.

| Flow | Who it emails |
|---|---|
| Welcome journey | New members, day 2 / 10 / 14 (day 14 includes an AI opportunity report) |
| Renewal cadence | Members renewing in 90 / 60 / 30 / 7 days — the final stage auto-renews or raises a retention task |
| Failed payment | Members whose card payment failed |
| Event reminder | Attendees of an upcoming event — 14 days · 7 days · 48 hours · morning-of |
| Post-event follow-up | Attendees of an event that finished 1–3 days ago (thank-you, feedback request, AI intro recommendations, and a 7-day guest→member nurture for non-member attendees) |
| Guest nurture | Past guests who aren't members yet |
| Invoice chasing | Members with an overdue/past-due balance |
| Introduction scheduled | Both members of a scheduled introduction |
| Sponsor follow-up | Sponsors still at Proposed — chasers at 3 / 7 / 14 days |

1. The page **auto-loads a preview** on open: per flow, candidates · already handled · pending · sent · failed, with named recipients.
2. **Preview** re-runs the dry run (safe, sends/writes nothing). **Run now** sends for real behind a confirmation: *"This sends real emails to everyone currently due… Anyone already emailed is skipped automatically. Preview first if unsure."* Every flow has a dedup ledger so nobody is ever emailed twice for the same stage even if the cron fires more than once.
3. When nothing is due: *"Nobody due right now."*
4. The actual send hour is configured in **Settings → Automation Send Time** (default 07:00 Europe/London) — the underlying cron (`/api/cron/automations`) actually runs **hourly** but only fires the real sends when the current London hour matches the configured setting.
5. **You almost never need Run now.** Use Preview as a read-only window into what the system is about to do.
6. WhatsApp is **not** wired into these flows yet (deliberately, pending a production WhatsApp number) — today WhatsApp is admin-driven only (manual send from the WhatsApp inbox).

---

## PLAYBOOK 16 — Website CMS editing

`/dashboard/website` — nine visible tabs (two more reachable by direct URL only).

| Tab | Controls | Public page |
|---|---|---|
| Membership Plans | Tiers, monthly price, monthly intro quota, features | `/memberships` |
| Membership Benefits | Benefit cards | `/memberships` |
| Membership Comparison | Tier 1/2/3 comparison rows (add/edit/reorder/delete) | `/memberships` |
| Galleries | Photo galleries by category: Private Dining · Members Event · Curated Experience · Sponsored Event · Business Enrichment — create, add photos + captions, reorder, publish | `/gallery` |
| Hero Slides ("Page heroes") | The hero image/headline for every public page, with **Reset to default** per page | Every public page |
| Testimonials | Quotes + attribution | Homepage |
| Instagram | Grid tiles — image, post URL, or both | Homepage |
| Past Highlights ("Curated experiences") | Showcase tiles of past events — **NOT bookable**, purely visual | `/private-event-services` |
| Videos | Video gallery | Public site |
| Partners (hidden, direct URL) | Partner logos | — |
| Documents (hidden, direct URL) | Downloadable documents | — |

Every real, bookable "curated luxury" event lives under **Events**, event type `curated_luxury` — never under Past Highlights, which is a static showcase tile with no capacity, price or booking flow.

---

## PLAYBOOK 17 — Automations catalogue, triggers, and creating one

Automations in this platform are **not** admin-configurable trigger→action builders — they are the nine fixed lifecycle flows in Playbook 15, tuned in code, inspected and force-run from `/dashboard/automations`. There is no drag-and-drop "if this then that" builder. If asked "how do I create a new automation," the honest answer is: this platform doesn't have a custom automation builder — the nine flows are the automation catalogue, and anything beyond them (e.g. a tenth lifecycle stage) requires a code change, not a UI configuration. What IS admin-configurable per flow: the daily **send hour** (Settings → Automation Send Time) and, for enquiries specifically, **routing rules** (Settings → Enquiry Routing).

---

## PLAYBOOK 18 — Settings, roles, inviting staff, password setup

`/dashboard/settings`:
1. **Club Details** — Club Name, Contact Email, Phone Number, Website URL, Club Description.
2. **Membership Plans** — Plan · Monthly Price · Monthly Intros · Type · Status (also editable from Website → Membership Plans).
3. **Integrations** — live status read from actual environment variables, never hard-coded: **Stripe** (event/one-off payments) · **GoCardless** (recurring membership direct debit) · **Xero** (accounting sync — Connect/Disconnect + Sync buttons) · **Resend** (transactional email). Each reads **Connected** or **Not connected**.
4. **Team** — the admin users.
5. **Email Sync** — Enable email sync, Sync history (months), Noise filter.
6. **Media Folders** — browse the connected Google Drive, **Approve** which folders the platform may read, set the **media owner** (whose Drive is used), scope All media / per-folder.
7. **Enquiry Routing** — assign an owner per enquiry type (General enquiry, Membership, Sponsorship, Private event, Venue/space hire, Concierge, Press/media, Upcoming event). Default: First admin.
8. **Automation Send Time** — the daily send hour for all nine automation flows (default 07:00).
9. **Tags** — same tag manager as the standalone Tags tab.

### Roles and inviting staff/admins
- Four roles total, enforced via `profiles.role` + RLS + `src/middleware.ts` (not just hidden UI): `admin`, `member`, `team_member`, `freelancer`.
- Invite an **admin**: Settings → Team.
- Invite **staff** (team_member/freelancer): **Accountability → Team Members → Add team member** (first/last name, email, job title, Type, hourly rate) → **Send login**.
- Neither path lets an admin set someone's password directly — every new login gets the branded **"set your password"** email (`/set-password`), minimum 8 characters with at least one letter and one number.
- **Resend login** (member detail page header, or Team Members' equivalent) re-sends this invite for anyone who lost or never got it.

---

## PLAYBOOK 19 — Member portal journey (`/portal`, sign in at `/login`)

Eight tabs:
1. **Dashboard** — membership status/next charge (or *"Set up your membership payment"* → **Set up billing**), upcoming booked events, live introductions, curated recommended events, and "In the room" (recently joined members).
2. **Events** — browse published events → **Details** → **Reserve seat**, priced per-member (Complimentary / tier benefit / sponsor rate), Stripe checkout, confirmation with QR pass.
3. **Concierge** — **Make a request** (type, brief, dates, location, guests, budget) → **Send request**; track "Where things stand" (Received → Sourcing → Quote ready → Confirmed → Delivered). Lands instantly in admin Concierge.
4. **Rewards** — claim partner offers, see claim history.
5. **Introductions** — accept/decline proposed introductions, record outcomes.
6. **Network** — the member directory; request an introduction to anyone.
7. **Billing** — subscription state, next billing date, **Set up subscription** / **Manage billing** (opens the Stripe customer portal for their own card), full payment history.
8. **Profile** — name, bio, photo, contact, company detail, objectives ("What you're working towards" / "Who you'd like to meet"), and **Tags & interests** (Industry / Looking For / Interests). The quality of these fields directly drives the quality of the introductions the platform will suggest to and for them — coach new members to fill this in fully.

---

## PLAYBOOK 20 — Sponsor portal journey (`/sponsor/<token>`)

No login — a private link copied from the event's Sponsors panel (**Copy portal link**) and sent to the sponsor directly.
They see **"Your sponsorship"** and five blocks: **Assets required** (upload a file or note → **Provide asset** → flips to Provided) · **Branding deadlines** · **Guest allocation** · **Other deliverables** · **ROI report** (once generated). Empty state: *"Nothing required here at the moment."*

---

## PLAYBOOK 21 — Concierge requests (admin side detail)

1. **Concierge** (`/dashboard/concierge`). Stat tiles: Open · Quoting/booking · Delivered.
2. **New concierge request** — Member (required), **Request type** (Private Aviation, Holidays, Venue Finding, Private Events, Private Lounges, Sports & Events Tickets, Luxury Goods, Fashion, Transfers), the brief in their own words, Dates, Location, Guests, Event/occasion, Budget, Owner, Priority, and **Internal notes** (never shown to the member).
3. Statuses: **Enquiry → Assigned → Sourcing → Quote sent → Accepted → Booked → Delivered → Feedback** (or Declined/Cancelled).
4. Commercials as they firm up: **Supplier**, **Supplier cost (£)**, **Quoted to member (£)**, **Sale price (£)**, **Commission (£)** — **Margin** computes itself.
5. The commission recorded here flows into the Commissions ledger and Finance's Concierge GMV. Members create these requests themselves from **Portal → Concierge**.

---

## PLAYBOOK 22 — Pipeline (read-only board)

`/dashboard/pipeline` — every open opportunity across the business, one board, one shared stage model.
1. Tiles: Open pipeline value · Open items · Follow-ups due · Outstanding invoices.
2. Filter by stream: All · Membership · Sponsorship · Concierge · Introductions · Event bookings.
3. Columns (shared stages): Applicant/New → Qualified → Proposal/Quote → Won/Closed.
4. Cards labelled by source: Membership · Sponsorship · Concierge · Introduction · Introduced business · Event booking · Sponsor · Applicant.
5. **The board is read-only.** You never drag a card. Click it to open the real underlying record (the member, sponsorship, concierge request, application) and change status there — the board reflects it automatically. This is deliberate: one source of truth per record, never two places to update.

---

# FAQ / TROUBLESHOOTING

**1. Where do I create a new member?**
Two ways: approve a pending application in **Applications** (the correct way — this also creates their login and sends the invite), or **Members → Add member** for a manual entry (no login is auto-created; use **Resend login** afterwards if they need portal access).

**2. Why didn't the applicant get an invite email after I approved them?**
Approving triggers provisioning + invite in one step, but it can fail (bad email, mail provider hiccup). The row still shows Approved but the button becomes **Re-provision member** — click it (confirm **Re-provision & re-send**) to retry without creating a duplicate member.

**3. Why can't I see a member's hourly cost data as a staff member?**
Staff rates are stored in a dedicated admin-only table (`staff_rates`), never on `profiles` (which any signed-in user can otherwise read) — this is deliberate so staff never see pay rates or event profit, only their own hours.

**4. Why don't the people I added to an event's Invite list get an email?**
The Invites panel is a **tracker**, not a sender. You must invite people yourself (email/phone/WhatsApp); the platform only auto-flips them from Invited to Confirmed once they book with the same email address. The only invite type that actually emails is the **sponsor** invite in the Sponsors panel.

**5. Why is a member's "Relationship health" score not updating right after I edited their profile?**
Scores recompute **once daily**, not live. Force an immediate refresh from **Member Success → Recompute now**.

**6. Why can't I drag a card on the Pipeline board?**
By design — Pipeline is read-only. Click the card to open the real record and change its status there.

**7. Where do I edit the newsletter's design?**
There's no editor on the Newsletter tab itself. Design/edit in **Communications → AI Templates** (or generate one from **Marketing → Campaigns** with the Newsletter channel, then **Open in email designer**); send it from **Newsletter → Campaigns**.

**8. Why did an approved review disappear from the public site, when I never rejected it?**
Someone toggled its **Active** switch off — this hides an *approved* review from the public page without changing its Approved/Rejected status. Toggle Active back on to restore it.

**9. Why do I see two different "Revenue" numbers on Dashboard vs Finance?**
Dashboard's Revenue MTD includes guest bookings (which have no payment record and are summed separately); Finance's Revenue tile is built purely from `payments` records. A small gap between the two is expected, not a bug.

**10. A member says they never got a booking confirmation email — how do I check?**
**Communications → Sent mail** (`/dashboard/communications/log`) logs every email the platform has ever sent — filter by recipient/subject and read exactly what went out (or didn't).

**11. Why can't I send an unapproved sponsorship outreach draft?**
The review queue enforces the human gate — clicking Send on a draft that isn't Approved yet returns exactly the message **"Approve first."** Approve it, then Send appears.

**12. How do I stop chasing a member for an overdue finance task?**
Open **Accountability → Finance Tasks**, find the occurrence, click **Mark complete** — this stops the automatic accountant→FD→Sarah escalation chain for that period.

**13. Why does a staff member's task not show up in Time & Profitability?**
Time only rolls up to an event if the **task itself is linked to that event** (the Event selector on the task). An unlinked task's hours never surface there — link it retroactively in Accountability → Tasks.

**14. How do I add a completely new automation, like a birthday email?**
Not possible from the UI today — the nine lifecycle flows in **Automations** are fixed in code. A new stage requires a code change. Admin-configurable knobs are limited to the daily **send hour** and **Enquiry Routing** owners.

**15. Why can't a member introduce themselves to someone with zero tags?**
The matcher only pairs a member's "Looking For" tag against another member's "Industry" tag. An untagged member (or one) produces no/weak matches on either side. Add tags on the member's profile (manually or via **AI suggestions**).

**16. Why does the WhatsApp tab show messages but members never reply from real phones?**
The Meta WhatsApp Business app is still in Development mode — real inbound only flows once the client's business is verified, a real phone number registered, and the temporary test token swapped for a permanent System-User token. This is an account/verification blocker, not a code bug.

**17. Can members text the club or call a receptionist and get an AI answer?**
No — a WhatsApp AI Assistant and an AI phone receptionist are designed and documented but explicitly **not built** yet; both are blocked on external accounts (WhatsApp Business verification; a telephony/voice provider). Today, WhatsApp is a manual admin inbox (send/receive), and there's no phone integration at all.

**18. Why does a member's enrichment button say "No business domain"?**
Their email is a free consumer address (gmail.com, outlook.com, etc.) with no company to look up. Enrichment needs a work email domain.

**19. I re-imported the same CSV of members by mistake — did it duplicate everyone?**
No — CSV import matches existing people by email and **updates** them; it never creates duplicates on a repeat import.

**20. Why did clicking Enrich not fill in a field I already typed?**
By design — enrichment **only fills empty fields**, never overwrites anything an admin has typed. Safe to re-run any time; it won't clobber manual edits.

**21. How do I permanently delete a member vs. just cancelling them?**
**Cancel membership** revokes portal access and is reversible — setting status back to `active` reinstates them. **Delete** (a separate button, with confirmation) is permanent and cannot be undone. Use Cancel for the normal churn case.

**22. Why can't staff see the Members or Finance tabs?**
Staff (`team_member`/`freelancer`) only ever see `/team` — enforced by both middleware and row-level security in the database, not just hidden navigation. Never send a staff member a `/dashboard` link; it will bounce them straight back to `/team`.

**23. How do I generate the morning leadership briefing?**
**Chief of Staff** (`/dashboard/chief-of-staff`) → **Generate today's briefing** (or **Regenerate** to refresh it later in the day). It also runs and emails itself automatically each morning at the configured send hour.

**24. Where does an introduction's "commission" actually get recorded, and why is my Commissions ledger empty?**
Commissions are never created directly in the Commissions tab — they only appear once you record an **Outcome** (with a commission value) on the originating introduction, concierge request, or referral. An empty ledger means those outcomes aren't being logged upstream — check Introductions and Concierge for un-recorded outcomes.

**25. Why does a sponsor's page say "Nothing required here at the moment"?**
That's the sponsor portal's empty state — it means every deliverable (assets, deadlines, guest allocation, other items) is already satisfied or none have been set for that sponsor yet.

**26. What happens when I click "Approve & publish" on a marketing draft?**
For text/blog/LinkedIn/Instagram/PR/sponsor-recap channels, it routes through the mock publishing adapter (marks it published + timestamps it — no real external post happens yet, since Metricool isn't connected). Use **Copy** to grab the finished text and post it manually today. Newsletter drafts skip this entirely and are sent for real from the email designer.

**27. Can the AI send a sponsorship outreach email, a marketing post, or a Gmail reply on its own?**
Never. Every one of these — marketing pieces, sponsor outreach, and Gmail drafts — always requires an explicit human Approve/Send click. The AI only drafts.

**28. Why is there no Segments option when sending a newsletter campaign?**
Check **Marketing → Segments** — you need at least one saved segment first; then it appears as a third audience choice (alongside "All active subscribers" and custom lists) in the Newsletter → Campaigns wizard.

**29. A guest scanned their own event QR code at the door and it didn't check them in — bug?**
Not a bug — by design, a guest can never check themselves in via their own QR pass. Only an admin-signed-in device can perform the check-in scan.

**30. Why does "Past Highlights" on the website not let anyone book?**
It's a static showcase tile for past events on `/private-event-services`, not a real bookable event. Real bespoke bookable events live under **Events → Private Events** (event type `curated_luxury`).

**31. How do I see what Xero figures are actually synced vs. live in the platform?**
**Finance** shows a "From Xero" summary card (historic spend pulled, members with spend, last synced) once a sync has run; trigger/re-run any sync from **Settings → Integrations → Xero** (Sync contacts / Sync invoices / Sync spend).

**32. Why do amounts from Xero show in the wrong currency?**
The connected Xero organisation is currently a demo/base-currency org — once reconnected to the client's real GBP Xero organisation, amounts display correctly in £. This needs no code change.

**33. How do I know if a lead/enquiry is worth chasing first?**
Every enquiry gets an AI **Score** (0–100) shown in the Enquiries table — sort/prioritise by that column. Higher scores were assessed as more qualified at intake.

**34. Where do I set who owns which type of enquiry?**
**Settings → Enquiry Routing** — map each enquiry type (General, Membership, Sponsorship, Private event, Venue/space hire, Concierge, Press/media, Upcoming event) to an owner. Default is First admin if unset.

**35. Why can't I find a "Roles" settings page?**
There isn't one as a distinct settings screen — roles are assigned when you create the login: admins/team via **Settings → Team**, staff via **Accountability → Team Members**, members via approving an Application (or Add member manually + setting their role).

**36. Someone asks: "can I make my own automation trigger, like 'email me when a Tier 1 member cancels'?"**
Not from the UI — the automation flows are fixed in code (the nine listed in Playbook 15/17). That kind of custom trigger would need a development change, not a settings toggle.

**37. Why does a member's event booking show "Member tier benefit" instead of a price?**
Their membership tier includes a complimentary or discounted rate for that event type — pricing is calculated automatically per viewer based on tier, not manually discounted by an admin.

**38. What's the difference between Tasks and Accountability → Tasks?**
**Tasks** (`/dashboard/tasks`) is the general team/sales/admin to-do list, open to any admin work item. **Accountability → Tasks** is the formal staff-transparency system with owner/deadline/status/comments/activity log specifically for `team_member`/`freelancer` performance tracking. They're intentionally separate systems.

**39. Why does the Member Success page say "Everyone looks healthy" when I know someone's unhappy?**
The flags (At risk / Dormant / Renewal soon / Upgrade ready) are driven entirely by the computed scores and recorded activity data (bookings, introductions, payments) — a subjective concern not reflected in any tracked field won't surface here. Use it as a data signal, not the whole picture; log a manual note/task if something qualitative needs following up.

**40. How do I check what email address the club's automated emails actually come from?**
**Communications → AI Templates**, open any template's Settings panel — From name / From email are set per template there. Check **Sent mail** (`/dashboard/communications/log`) to see the actual From used on any given send.

**41. Why can a business/corporate member have multiple logins?**
Corporate/business accounts support **Representatives** — individual people added under the parent company on the member detail page, each with their own portal login; their record shows a notice linking back to the parent account.

**42. Can I bulk-export my member list?**
Yes — **Members → Export** downloads the current (filtered/searched) list as a CSV.

**43. Why did my marketing campaign only generate two channels instead of the whole set I expected?**
The channel selection is a checklist in the New Campaign modal — only ticked channels generate. Default selection on the create modal is deliberately small (SEO blog + LinkedIn) to avoid firing all nine generations by default; tick more, or use **Select all**.

**44. What happens if I approve a newsletter asset from the Marketing approval queue directly (skip the email designer)?**
It's blocked server-side by design — newsletter assets never go through the mock-publish Approve path; you must open it in the email designer and send it from there, which is the real send.
