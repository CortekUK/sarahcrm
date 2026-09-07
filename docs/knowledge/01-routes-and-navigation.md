# Route Map — The Club by Sarah Restrick CRM (sarahcrm)

Scope: `src/app/**` page routes, layouts, middleware, navigation. Next.js 15 App Router with route groups `(admin)`, `(portal)`, `(public)`, `(auth)`, `(staff)`, plus top-level `src/app/checkin` and `src/app/sponsor`. All paths below are relative to `/Users/apple/Ghulam/sarahcrm`.

No `not-found.tsx`, `error.tsx`, `loading.tsx`, or `global-error.tsx` files exist anywhere under `src/app`. There is no custom 404/error boundary — Next.js defaults apply.

---

## 1. Root layout and providers

**`src/app/layout.tsx`** — the single root layout for the entire app (all route groups nest inside it).
- Renders `<html lang="en" suppressHydrationWarning>`.
- Injects `THEME_BOOT_SCRIPT` (from `src/providers/ThemeProvider.tsx`) inline in `<head>` — a synchronous script that reads `localStorage` (`theclub:theme`) or `prefers-color-scheme` and applies a `theme-day`/`theme-night` class to `<html>` before paint, preventing a flash of the wrong palette.
- Wraps children in `<AuthHashRedirect />` (src/components/AuthHashRedirect.tsx, handles Supabase auth hash-fragment redirects), then `<ThemeProvider>` (src/providers/ThemeProvider.tsx — exposes `useTheme()`, two-state theme `'day' | 'night'`), then `<SmoothScrolling>` (src/components/website/SmoothScrolling.tsx — Lenis smooth-scroll wrapper).
- Metadata: title "The Club by Sarah Restrick", description "Luxury Private Members Networking".

**Providers (`src/providers/`)**:
- `ThemeProvider.tsx` — day/night theme context + boot script; `useTheme()` hook.
- `AuthProvider.tsx` — `'use client'`; wraps Supabase auth (`supabase.auth.getSession`/`onAuthStateChange`), fetches the `profiles` row for the logged-in user, exposes `{ user, session, profile, loading, signOut }` via `useAuth()`. Mounted independently inside each protected route group's layout (admin, portal, staff, auth) — not in the root layout, so the public site never runs auth code.
- `QueryProvider.tsx` — TanStack Query `QueryClientProvider`, `staleTime: 30_000`, `refetchOnWindowFocus: false`. Mounted in `(admin)` and `(staff)` layouts (not portal, not public).

---

## 2. Middleware — auth + role gating

**File: `src/middleware.ts`**

Matcher: all paths except `_next/static`, `_next/image`, `favicon.ico`, `.well-known`, and static image extensions.

Three protected workspaces, one role each — cross-role traffic is hard-redirected, never served:

| Path prefix | Allowed role | Redirect target if wrong role/unauth |
|---|---|---|
| `/dashboard/*` | `admin` only | Unauth → `/admin/login?redirect=<path>`. Wrong role → own home (`/team` for staff, `/portal` for member) |
| `/portal/*` | `member` with **active** membership only (admins/staff explicitly excluded) | Unauth → `/login?redirect=<path>`. Admin/staff → own home. Member without active `members` row → signed out + redirected to `/login?reason=membership_cancelled\|membership_expired\|no_membership` |
| `/team/*` | `team_member` or `freelancer` (staff) only | Unauth → `/admin/login?redirect=<path>`. Wrong role → own home |

Role lookup: `profiles.role` for the authenticated user (`admin | member | team_member | freelancer`, default `member` if null).

Portal-specific extra check: for non-admins hitting `/portal/*`, middleware also queries `members` table (`membership_status`, `deleted_at` where `deleted_at IS NULL`) — status must be `'active'` or the user is signed out and bounced to `/login` with a `reason` query param the login page reads to show a tailored message.

Login routes: `/login` = member login (also default landing link from the public "Sign in"). `/admin/login` = staff sign-in for **both** admins and team members/freelancers (separate URL for bookmarking). If an already-authenticated user visits either login URL, middleware redirects them straight to their home surface (`homeForRole`).

`homeForRole(role)`: `admin` → `/dashboard`; `team_member`/`freelancer` → `/team`; anything else (`member`/null) → `/portal`.

---

## 3. `(admin)` route group — Admin Dashboard (`/dashboard/*`)

**Layout: `src/app/(admin)/layout.tsx`** (`'use client'`)
- Provider stack: `AuthProvider` → `QueryProvider` → `Suspense` → `ProgressProvider` (src/components/admin/TopProgressBar.tsx, top loading bar on route change, needs Suspense because it reads `useSearchParams`) → `ConfirmDialogProvider` (src/components/admin/ConfirmDialog.tsx) → `AdminLayoutInner` + `<Toaster />` (src/components/ui-shadcn/toaster).
- Fixed left sidebar (244px), graphite gradient background, bronze/gold accents. Contains: brand header (logo + "The Club" / "by Sarah Restrick"), a nav-filtering search box, the grouped nav tree (see §3.1), and a footer with the signed-in admin's avatar/name/email, a Settings link, Sign out button, and theme toggle.
- Theme: `theme-night-admin` class applied to the shell unless day theme is active.
- Badge counts (`useNavCounts`): live head-count queries against Supabase, refreshed on route change, badging `/dashboard/applications` (pending `membership_applications`), `/dashboard/bookings` (pending `bookings`), `/dashboard/finance` (overdue `payments`).
- Sign-out redirects to `/admin/login`.

### 3.1 Admin sidebar nav tree (exact, from `NAV_SECTIONS` in `src/app/(admin)/layout.tsx`)

**Section: Main**
| Label | Href | Icon | Notes |
|---|---|---|---|
| Chief of Staff | `/dashboard/chief-of-staff` | Sunrise | |
| Executive | `/dashboard/executive` | Gauge | |
| Dashboard | `/dashboard` | LayoutDashboard | exact-match active |
| Members | `/dashboard/members` | Users | |
| Member Success | `/dashboard/members/success` | HeartPulse | |
| Applications | `/dashboard/applications` | ClipboardList | badge = pending applications count |
| Events | `/dashboard/events` | CalendarDays | |
| Bookings | `/dashboard/bookings` | Ticket | badge = pending bookings count |
| Pipeline | `/dashboard/pipeline` | KanbanSquare | |
| Introductions | `/dashboard/introductions` | Handshake | |
| Tasks | `/dashboard/tasks` | ListTodo | |
| **Accountability** (group) | `/dashboard/accountability` | ShieldCheck | expandable group |
| ↳ Overview | `/dashboard/accountability/overview` | LayoutDashboard | |
| ↳ Tasks | `/dashboard/accountability/tasks` | ShieldCheck | |
| ↳ Team Members | `/dashboard/accountability/team` | UserCog | |
| ↳ Time & Profitability | `/dashboard/accountability/time` | Coins | |
| ↳ Scorecards | `/dashboard/accountability/scorecards` | Target | |
| ↳ Daily Handover | `/dashboard/accountability/handover` | ClipboardCheck | |
| ↳ Finance Tasks | `/dashboard/accountability/finance` | PoundSterling | |
| ↳ SOP Library | `/dashboard/accountability/sops` | BookOpen | |
| Concierge | `/dashboard/concierge` | BellRing | |
| Rewards | `/dashboard/rewards` | Gift | |
| Tags | `/dashboard/tags` | Tags | |

**Section: Engage**
| Label | Href | Icon | Notes |
|---|---|---|---|
| Inbox | `/dashboard/inbox` | Inbox | |
| Enquiries | `/dashboard/enquiries` | Inbox | |
| Reviews | `/dashboard/reviews` | Quote | |
| Newsletter | `/dashboard/newsletter` | MailPlus | |
| **Communications** (group) | `/dashboard/communications` | Mail | expandable group; active-match is exact for the parent `to` |
| ↳ Overview | `/dashboard/communications` | Send | |
| ↳ AI Templates | `/dashboard/communications/templates` | Sparkles | tagged "AI" badge (path contains `/templates`) |
| ↳ Sent mail | `/dashboard/communications/log` | Mail | |
| Finance | `/dashboard/finance` | PoundSterling | badge = overdue payments count |
| Commissions | `/dashboard/commissions` | Coins | |
| WhatsApp | `/dashboard/whatsapp` | MessageCircle | |
| Automations | `/dashboard/automations` | Zap | |

**Section: Marketing**
| Label | Href | Icon | Notes |
|---|---|---|---|
| **Marketing** (group) | `/dashboard/marketing` | Megaphone | |
| ↳ Campaigns | `/dashboard/marketing` | Megaphone | |
| ↳ Templates | `/dashboard/marketing/templates` | ImageIcon | |
| ↳ Voices | `/dashboard/marketing/voices` | MessageCircle | |
| ↳ Segments | `/dashboard/marketing/segments` | Filter | |
| ↳ Library | `/dashboard/marketing/library` | Library | |

**Section: Sponsorship**
| Label | Href | Icon | Notes |
|---|---|---|---|
| **Sponsorship** (group) | `/dashboard/sponsorship` | Handshake | |
| ↳ Hub | `/dashboard/sponsorship` | Sparkles | |
| ↳ Prospects | `/dashboard/sponsorship/prospects` | Search | |
| ↳ Review queue | `/dashboard/sponsorship/outreach` | Send | |

**Section: Site**
| Label | Href | Icon | Notes |
|---|---|---|---|
| **Website** (group) | `/dashboard/website` | Globe | |
| ↳ Membership Plans | `/dashboard/website/memberships` | (inherits Globe) | |
| ↳ Membership Benefits | `/dashboard/website/membership-benefits` | | |
| ↳ Membership Comparison | `/dashboard/website/membership-comparison` | | |
| ↳ Galleries | `/dashboard/website/galleries` | | |
| ↳ Hero Slides | `/dashboard/website/hero-slides` | | |
| ↳ Testimonials | `/dashboard/website/testimonials` | | |
| ↳ Instagram | `/dashboard/website/instagram` | | |
| ↳ Past Highlights | `/dashboard/website/experiences` | | past-highlight showcase tiles for the Private Events page (real bookable "curated luxury" events live under Events, not here) |
| ↳ Videos | `/dashboard/website/videos` | | |

Two Website sub-routes are commented out of the nav but still live at their URLs (accessible by direct link only): `/dashboard/website/partners` (Partners) and `/dashboard/website/documents` (Documents).

Footer nav item (not in a section): **Settings** → `/dashboard/settings` (icon Settings), plus **Sign out** button and theme toggle.

### 3.2 Admin route inventory

All pages below are client components (`'use client'`) unless noted "server". All render a `views/admin/**` component; the page file itself is a thin wrapper.

| URL | File | Renders | Notes |
|---|---|---|---|
| `/dashboard` | `src/app/(admin)/dashboard/page.tsx` | `DashboardPage` (`@/views/admin/DashboardPage`) | Main admin landing/overview dashboard. |
| `/dashboard/chief-of-staff` | `.../dashboard/chief-of-staff/page.tsx` | `ChiefOfStaffPage` | AI Chief of Staff operational agent screen (daily briefing/priorities). |
| `/dashboard/executive` | `.../dashboard/executive/page.tsx` | `ExecutiveDashboardPage` | Executive-level KPI dashboard. |
| `/dashboard/members` | `.../dashboard/members/page.tsx` | `MembersListPage` | List/search all members. |
| `/dashboard/members/[id]` | `.../dashboard/members/[id]/page.tsx` | `MemberDetailPage` | Single member's full profile/detail (dynamic `id` param). |
| `/dashboard/members/success` | `.../dashboard/members/success/page.tsx` | `MemberSuccessPage` | Member Success AI agent — engagement/at-risk member tracking. |
| `/dashboard/applications` | `.../dashboard/applications/page.tsx` | `ApplicationsListPage` | Review/approve pending membership applications. |
| `/dashboard/events` | `.../dashboard/events/page.tsx` | `EventsListPage` | List all events. |
| `/dashboard/events/new` | `.../dashboard/events/new/page.tsx` | `EventFormPage` | Create a new event. |
| `/dashboard/events/[id]` | `.../dashboard/events/[id]/page.tsx` | `EventDetailPage` | Single event details (dynamic `id`). |
| `/dashboard/events/[id]/edit` | `.../dashboard/events/[id]/edit/page.tsx` | `EventFormPage` | Edit an existing event (dynamic `id`). |
| `/dashboard/bookings` | `.../dashboard/bookings/page.tsx` | `BookingsListPage` | List/manage event bookings. |
| `/dashboard/pipeline` | `.../dashboard/pipeline/page.tsx` | `PipelinePage` | Kanban-style sales/lead pipeline. |
| `/dashboard/introductions` | `.../dashboard/introductions/page.tsx` | `IntroductionsListPage` | List of member-to-member introductions (matches/suggestions made by admin). This is where an admin sets up/reviews an introduction between two people. |
| `/dashboard/introductions/[id]` | `.../dashboard/introductions/[id]/page.tsx` | `IntroductionDetailPage` | Detail/status of a single introduction (dynamic `id`). |
| `/dashboard/tasks` | `.../dashboard/tasks/page.tsx` | `TasksPage` | General admin task list. |
| `/dashboard/accountability/overview` | `.../accountability/overview/page.tsx` | `AccountabilityDashboardPage` | Team accountability dashboard overview. |
| `/dashboard/accountability/tasks` | `.../accountability/tasks/page.tsx` | `AccountabilityTasksPage` | Accountability-tracked task list. |
| `/dashboard/accountability/team` | `.../accountability/team/page.tsx` | `TeamMembersPage` | Manage team members (staff roster) for accountability system. |
| `/dashboard/accountability/time` | `.../accountability/time/page.tsx` | `TimeProfitabilityPage` | Time-tracking & profitability report. |
| `/dashboard/accountability/scorecards` | `.../accountability/scorecards/page.tsx` | `ScorecardsPage` | Team scorecards (KPI tracking per person). |
| `/dashboard/accountability/handover` | `.../accountability/handover/page.tsx` | `DailyHandoverPage` | Daily shift handover notes. |
| `/dashboard/accountability/finance` | `.../accountability/finance/page.tsx` | `FinanceTasksPage` | Finance-specific accountability tasks. |
| `/dashboard/accountability/sops` | `.../accountability/sops/page.tsx` | `SopLibraryPage` | Standard operating procedures library. |
| `/dashboard/concierge` | `.../dashboard/concierge/page.tsx` | `ConciergePage` | Admin view of member concierge requests. |
| `/dashboard/rewards` | `.../dashboard/rewards/page.tsx` | `RewardsPage` | Manage rewards/partner benefits program (admin side). |
| `/dashboard/tags` | `.../dashboard/tags/page.tsx` | `TagsPage` | Manage member/entity tags (server component, no `'use client'`). |
| `/dashboard/inbox` | `.../dashboard/inbox/page.tsx` | `InboxPage` | Unified messaging inbox. |
| `/dashboard/enquiries` | `.../dashboard/enquiries/page.tsx` | `EnquiriesListPage` | Public contact-form/enquiry submissions. |
| `/dashboard/reviews` | `.../dashboard/reviews/page.tsx` | `ReviewsAdminPage` | Moderate/manage testimonials submitted via "Share Your Experience". |
| `/dashboard/newsletter` | `.../dashboard/newsletter/page.tsx` | `NewsletterPage` | Newsletter/mailing-list management. |
| `/dashboard/communications` | `.../dashboard/communications/page.tsx` | `CommunicationsPage` | Communications overview/hub. |
| `/dashboard/communications/templates` | `.../communications/templates/page.tsx` | `TemplatesListPage` | List AI email templates. |
| `/dashboard/communications/templates/editor` | `.../communications/templates/editor/page.tsx` | `EmailEditorPage` (`@/components/templates/editor/EmailEditorPage`) | Rich email template editor; reads `useSearchParams` inside `Suspense`. Has its own `layout.tsx` (`.../communications/templates/editor/layout.tsx`) — likely a full-bleed editor chrome override. |
| `/dashboard/communications/log` | `.../communications/log/page.tsx` | `EmailLogPage` | Sent-email log (server component, no `'use client'`). |
| `/dashboard/communications/contracts` | `.../communications/contracts/page.tsx` | `TemplatesListPage` | Contract templates list. |
| `/dashboard/communications/contracts/editor` | `.../communications/contracts/editor/page.tsx` | `ContractEditorPage` (`@/components/contracts/editor/ContractEditorPage`) | Contract document editor; `useSearchParams` in `Suspense`. Own `layout.tsx` at `.../contracts/editor/layout.tsx`. |
| `/dashboard/finance` | `.../dashboard/finance/page.tsx` | `FinancePage` | Payments/invoices/finance overview. |
| `/dashboard/commissions` | `.../dashboard/commissions/page.tsx` | `CommissionsPage` | Sales/referral commissions tracking. |
| `/dashboard/whatsapp` | `.../dashboard/whatsapp/page.tsx` | `WhatsAppInboxPage` | WhatsApp messaging inbox (integration). |
| `/dashboard/automations` | `.../dashboard/automations/page.tsx` | `AutomationsPage` | Workflow automations configuration. |
| `/dashboard/marketing` | `.../dashboard/marketing/page.tsx` | `MarketingPage` | Marketing campaigns overview. |
| `/dashboard/marketing/[id]` | `.../dashboard/marketing/[id]/page.tsx` | `CampaignDetailPage` | Single campaign detail (dynamic `id`). |
| `/dashboard/marketing/templates` | `.../marketing/templates/page.tsx` | `TemplatesPage` | Marketing content templates. |
| `/dashboard/marketing/voices` | `.../marketing/voices/page.tsx` | `VoicesPage` | Brand "voice" presets for AI-generated marketing copy. |
| `/dashboard/marketing/segments` | `.../marketing/segments/page.tsx` | `SegmentsPage` | Audience segments for targeted marketing. |
| `/dashboard/marketing/library` | `.../marketing/library/page.tsx` | `LibraryPage` | Marketing asset library. |
| `/dashboard/sponsorship` | `.../dashboard/sponsorship/page.tsx` | `SponsorshipHub` | Sponsorship Intelligence hub landing. |
| `/dashboard/sponsorship/prospects` | `.../sponsorship/prospects/page.tsx` | `ProspectsView` (with `AdminPageHeader`) | AI-matched sponsor prospects list. |
| `/dashboard/sponsorship/outreach` | `.../sponsorship/outreach/page.tsx` | `OutreachQueueView` | Human-in-the-loop review queue for AI-drafted sponsor outreach. |
| `/dashboard/website/memberships` | `.../website/memberships/page.tsx` | `MembershipPlansPage` | Edit public-site membership tier plans/pricing. |
| `/dashboard/website/membership-benefits` | `.../website/membership-benefits/page.tsx` | `MembershipBenefitsPage` | Edit membership benefits content. |
| `/dashboard/website/membership-comparison` | `.../website/membership-comparison/page.tsx` | `MembershipComparisonPage` | Edit the membership comparison table content. |
| `/dashboard/website/galleries` | `.../website/galleries/page.tsx` | `GalleriesListPage` | List photo galleries. |
| `/dashboard/website/galleries/new` | `.../website/galleries/new/page.tsx` | `GalleryFormPage` | Create a gallery. |
| `/dashboard/website/galleries/[id]` | `.../website/galleries/[id]/page.tsx` | `GalleryDetailPage` | View a gallery's photos (dynamic `id`). |
| `/dashboard/website/galleries/[id]/edit` | `.../website/galleries/[id]/edit/page.tsx` | `GalleryFormPage` | Edit a gallery (dynamic `id`). |
| `/dashboard/website/hero-slides` | `.../website/hero-slides/page.tsx` | `HeroSlidesPage` | Manage homepage hero slideshow content. |
| `/dashboard/website/instagram` | `.../website/instagram/page.tsx` | `InstagramAdminPage` | Manage embedded Instagram feed content. |
| `/dashboard/website/experiences` | `.../website/experiences/page.tsx` | `ExperiencesPage` | Manage "Past Highlights" showcase tiles for Private Events page. |
| `/dashboard/website/videos` | `.../website/videos/page.tsx` | `VideosPage` | Manage video gallery content. |
| `/dashboard/website/partners` | `.../website/partners/page.tsx` | `PartnersPage` | Manage partner/rewards directory content. Hidden from nav, reachable by direct URL. |
| `/dashboard/website/documents` | `.../website/documents/page.tsx` | `DocumentsPage` | Document management. Hidden from nav, reachable by direct URL. |
| `/dashboard/website/testimonials` | `.../website/testimonials/page.tsx` | `TestimonialsPage` | Manage testimonials shown on public site. |
| `/dashboard/settings` | `.../dashboard/settings/page.tsx` | `SettingsPage` | Admin account/organisation settings. |

---

## 4. `(portal)` route group — Member Portal (`/portal/*`)

**Layout: `src/app/(portal)/layout.tsx`** (`'use client'`)
- Provider stack: `AuthProvider` → `PortalLayoutInner`. (No `QueryProvider` here, unlike admin/staff.)
- Fixed top header (night/editorial style matching public site: `NightHeader`-like chrome, graphite on scroll). Desktop nav shows: Dashboard, Events, Concierge, Rewards inline, plus a "Community" dropdown folding in Introductions and Network. Right side: theme toggle + user-menu pill (avatar, name) opening a dropdown with "View profile", "Billing", "Sign out". Mobile: fullscreen overlay nav with all items flattened plus Billing/Profile.
- Sign-out redirects to `/login`.
- Footer: copyright + "Held in confidence".

### 4.1 Portal nav (from `NAV_ITEMS` / `COMMUNITY_ITEMS` in `(portal)/layout.tsx`)

| Label | Href | Where shown |
|---|---|---|
| Dashboard | `/portal` | primary desktop bar (exact-match active) |
| Events | `/portal/events` | primary desktop bar |
| Concierge | `/portal/concierge` | primary desktop bar |
| Rewards | `/portal/rewards` | primary desktop bar |
| Introductions | `/portal/introductions` | "Community" dropdown — "Your curated matches and suggestions." |
| Network | `/portal/network` | "Community" dropdown — "Members across Manchester, Leeds and London." |
| Billing | `/portal/billing` | user-menu dropdown + mobile overlay |
| Profile | `/portal/profile` | user-menu dropdown + mobile overlay |

### 4.2 Portal route inventory

All are `'use client'`, rendering `views/portal/**` components.

| URL | File | Renders | What the member does here |
|---|---|---|---|
| `/portal` | `src/app/(portal)/portal/page.tsx` | `PortalDashboard` | Member's home dashboard — overview of their membership, upcoming events, activity. |
| `/portal/events` | `.../portal/events/page.tsx` | `PortalEventsPage` | Browse/RSVP to upcoming club events. |
| `/portal/events/[id]` | `.../portal/events/[id]/page.tsx` | `PortalEventDetailPage` | View a single event and book/RSVP (dynamic `id`). |
| `/portal/events/[id]/confirmation` | `.../portal/events/[id]/confirmation/page.tsx` | `PortalBookingConfirmationPage` | Booking confirmation screen after RSVP/payment (dynamic `id`). |
| `/portal/concierge` | `.../portal/concierge/page.tsx` | `PortalConciergePage` | Member submits/tracks concierge requests. |
| `/portal/rewards` | `.../portal/rewards/page.tsx` | `PortalRewardsPage` | Member views/redeems partner rewards & benefits. |
| `/portal/introductions` | `.../portal/introductions/page.tsx` | `PortalIntroductionsPage` | **This is where a member views and responds to introductions the admin has set up between them and another member** — accepts/declines curated matches and suggestions. |
| `/portal/network` | `.../portal/network/page.tsx` | `PortalNetworkPage` | Browse the member directory/network across the club's locations (Manchester, Leeds, London). |
| `/portal/billing` | `.../portal/billing/page.tsx` | `PortalBillingPage` | View/manage membership billing, invoices, payment method. |
| `/portal/profile` | `.../portal/profile/page.tsx` | `PortalProfilePage` | Edit member's own profile details. |

Note: to *initiate* an introduction between two people, the admin does this from `/dashboard/introductions` (create/manage flow in `IntroductionsListPage`/`IntroductionDetailPage`); the member-facing side to view/respond is `/portal/introductions`.

---

## 5. `(auth)` route group — Login/auth screens

**Layout: `src/app/(auth)/layout.tsx`** (`'use client'`) — wraps children in `AuthProvider` and a `theme-night-admin` themed div (midnight + bronze palette, matching the admin dashboard look) so auth screens don't fall back to legacy cream defaults.

| URL | File | Renders | Notes |
|---|---|---|---|
| `/login` | `src/app/(auth)/login/page.tsx` | `LoginPage` (`@/views/auth/LoginPage`) | Member sign-in. Wrapped in `Suspense` (reads `useSearchParams` for `redirect`/`reason` query params set by middleware). |
| `/admin/login` | `src/app/(auth)/admin/login/page.tsx` | `LoginPage` (same component) | Staff sign-in (admins + team_member/freelancer). Same `LoginPage` component reused, presumably branch on route/props internally. |
| `/set-password` | `src/app/(auth)/set-password/page.tsx` | `SetPasswordPage` (`@/views/auth/SetPasswordPage`) | Set/reset password flow (e.g. after invite or "forgot password" email link), wrapped in `Suspense`. |

---

## 6. `(staff)` route group — Staff self-service (`/team/*`)

**Layout: `src/app/(staff)/layout.tsx`** (`'use client'`)
- Provider stack: `AuthProvider` → `QueryProvider` → `StaffLayoutInner` + `Toaster`.
- Deliberately minimal single-page shell: a top bar (logo, "The Club" / "My tasks" with ShieldCheck icon, staff member's name, theme toggle, Sign out) and content below in a `max-w-4xl` container. No sidebar, no other nav — per code comment, staff (`team_member`/`freelancer`) only ever see their own accountability tasks here; middleware keeps them out of every other workspace.
- Sign-out redirects to `/admin/login`.

| URL | File | Renders | What happens here |
|---|---|---|---|
| `/team` | `src/app/(staff)/team/page.tsx` | (staff task view — file content not enumerated above; single-page staff task list) | Staff member's own assigned accountability tasks/scorecard, their sole surface in the app. |

---

## 7. `(public)` route group — Public marketing site

**Layout: `src/app/(public)/layout.tsx`** — server-renderable wrapper (no `'use client'` on the layout itself); wraps children in the legacy `ThemeProvider` (`@/components/website/ThemeContext`, a compat shim distinct from the root `src/providers/ThemeProvider`), `SmoothScrolling`, then renders `NightHeader`, `<main>{children}</main>`, `JoinBadge` (floating CTA), `ConciergeWidget` (floating chat/concierge launcher), `NightFooter`, and `Toaster`. No `AuthProvider` — the public site does not touch auth.

### 7.1 Public header nav (`src/components/website/night/NightHeader.tsx`)

Full link set (shown in the fullscreen mobile/menu overlay):
| Label | Href |
|---|---|
| The Club | `/about` |
| Memberships | `/memberships` |
| Events | `/events` |
| Concierge | `/concierge` |
| Rewards | `/rewards` |
| Gallery | `/gallery` |
| Testimonials | `/reviews` |
| Private Events | `/private-event-services` |

Desktop inline subset (`PRIMARY_HREFS`): Memberships, Events, Testimonials — the rest are one click away behind the Menu button. Plus a persistent "Sign in" link (→ `/login`) and an "Apply" pill (→ `/membership-application`).

### 7.2 Public footer nav (`src/components/website/night/NightFooter.tsx`)

| Column | Links |
|---|---|
| Discover | The Club (`/about`), Memberships (`/memberships`), Events (`/events`), Gallery (`/gallery`), Testimonials (`/reviews`) |
| The Standard | Club Rules (`/club-rules`), Private Events (`/private-event-services`), Privacy Policy (`/privacy-policy`) |
| Connect | Contact (`/contact-us`), Concierge (`/concierge`), Share Your Experience (`/share-your-experience`), Apply for Membership (`/membership-application`), `mailto:hello@theclubbysarahrestrick.com` |

### 7.3 Public route inventory

Server components by default unless noted `'use client'`. Data-fetching pages use `@/lib/supabase/server` (`createClient`) or a raw `@supabase/supabase-js` admin client.

| URL | File | Type | What it shows |
|---|---|---|---|
| `/` | `src/app/(public)/page.tsx` | server | Homepage — `NightHero`, `HeroPartnersMarquee`, `IntroChapter`, and further sections (composed from `components/website/night/home/*`). |
| `/about` | `.../about/page.tsx` | server | "The Club" brand story page (`Chapter`/`PageHeroMedia`/`Aurora` editorial primitives), fetches hero image via Supabase. |
| `/memberships` | `.../memberships/page.tsx` | server | Membership tiers/pricing, expandable tier rows (`TierExpandRow`). |
| `/events` | `.../events/page.tsx` | server | Public events listing, fetched from Supabase via `createClient` (server). |
| `/events/[slug]` | `.../events/[slug]/page.tsx` | server | Single public event detail by slug; `notFound()` if missing; uses both server client and admin client. |
| `/events/[slug]/success` | `.../events/[slug]/success/page.tsx` | `'use client'` | Post-booking success/confirmation page for a public event booking; reads `useSearchParams` in `Suspense`. |
| `/concierge` | `.../concierge/page.tsx` | `'use client'` | Public concierge request form (react-hook-form + zod). |
| `/rewards` | `.../rewards/page.tsx` | server | Public partner/rewards directory (revalidate 60s), showcases partner network to prospects. |
| `/gallery` | `.../gallery/page.tsx` | server | Photo gallery index. |
| `/gallery/[slug]` | `.../gallery/[slug]/page.tsx` | server | Single gallery detail by slug; `notFound()` if missing. |
| `/reviews` | `.../reviews/page.tsx` | server | Public testimonials/review gallery (revalidate 60s). |
| `/private-event-services` | `.../private-event-services/page.tsx` | server | Private/curated luxury events service page with video gallery. |
| `/contact-us` | `.../contact-us/page.tsx` | `'use client'` | Public contact form (react-hook-form). |
| `/club-rules` | `.../club-rules/page.tsx` | server | Club rules/terms editorial page. |
| `/privacy-policy` | `.../privacy-policy/page.tsx` | server | Verbatim privacy notice content. |
| `/membership-application` | `.../membership-application/page.tsx` | `'use client'` | Full membership application form (react-hook-form, file uploads via `ChangeEvent`/refs). |
| `/membership-application/success` | `.../membership-application/success/page.tsx` | `'use client'` | Application-submitted confirmation; reads `useSearchParams` in `Suspense`. |
| `/share-your-experience` | `.../share-your-experience/page.tsx` | `'use client'` | Public testimonial submission form (feeds into `/dashboard/reviews` moderation queue). |
| `/one-london-road` | `.../one-london-road/page.tsx` | server | Venue/location-specific editorial page. |
| `/unsubscribe` | `.../unsubscribe/page.tsx` | server, `runtime = 'nodejs'`, `dynamic = 'force-dynamic'` | Mailing-list unsubscribe landing hit from campaign email footer links; token from `mailing_list.unsubscribe_token`; idempotent DB update inline, no client JS. |

---

## 8. Standalone top-level routes (outside all route groups)

| URL | File | Type | What it does |
|---|---|---|---|
| `/checkin/[bookingId]` | `src/app/checkin/[bookingId]/page.tsx` | `'use client'` | Admin-gated door check-in landing. QR code on a member's booking confirmation encodes this URL; a team member scans it to mark the booking attended (`checked_in` + `attendance='attended'`). Gated both in UI (only offers the action to an admin session) and via RLS on `bookings` (only admin can write) so a guest scanning their own pass cannot self-check-in. Uses `useParams` for `bookingId`. |
| `/sponsor/[token]` | `src/app/sponsor/[token]/page.tsx` | server, `dynamic = 'force-dynamic'` | Public, login-free Sponsor Portal. Resolved server-side by a per-sponsor `booking_token` via a service-role Supabase client (`@/lib/sponsors/portal.ts`'s `loadSponsorPortal`) — RLS never opened to the public. Read-only, night editorial palette. Shows the sponsor their event, required assets + branding deadlines, guest allocation, and the generated ROI report. Deliverable submission handled by a co-located client component `src/app/sponsor/[token]/DeliverableSubmit.tsx`. |

These two routes have no `layout.tsx` of their own — they inherit only the root `src/app/layout.tsx` (theme boot script, `ThemeProvider`, `SmoothScrolling`), with no admin/portal/public chrome (no header/footer/sidebar).

---

## 9. Summary of role → home surface → login mapping

| Role | Home surface | Login URL | Sign-out destination |
|---|---|---|---|
| `admin` | `/dashboard` | `/admin/login` | `/admin/login` |
| `member` (active) | `/portal` | `/login` | `/login` |
| `team_member` / `freelancer` | `/team` | `/admin/login` | `/admin/login` |

A member whose `members.membership_status` is not `'active'` (or has no `members` row) is signed out on any `/portal/*` request and redirected to `/login?reason=membership_cancelled|membership_expired|no_membership`.
