# The Club by Sarah Restrick — Platform

## What This Is
Bespoke CRM and member platform for "The Club by Sarah Restrick", a luxury private members networking club in Manchester/Leeds. Replaces spreadsheets with an intelligent system for member management, event booking, smart introductions, payments, and communications.

## Tech Stack
- Next.js 14+ (App Router), TypeScript strict
- Supabase (PostgreSQL + Auth + Realtime + Storage)
- Tailwind CSS with custom tokens (no component libraries — build from scratch)
- Stripe + GoCardless for payments, Xero for accounting
- React Email + Resend for transactional email
- Server Components by default, "use client" only when needed
- React Hook Form + Zod for forms
- Lucide React for icons

## Architecture
- App Router with route groups: (auth), (admin), (member)
- Server Components by default, server actions for mutations
- Colocate actions.ts next to the page using them
- API routes only for webhooks (Stripe, GoCardless, Xero)
- RLS on all Supabase tables, middleware for auth redirects

## Design System

LIGHT warm luxury theme matching theclubbysarahrestrick.com — gold/bronze on cream/white, editorial serif headings. NOT dark mode. NOT tech SaaS.

### Colours
bg: #FAFAF7 (warm off-white) | bg-alt: #F3F0EA | surface: #FFFFFF | surface-2: #F7F5F0 | surface-3: #EEEBE4
gold: #B8975A | gold-light: #D4B978 | gold-dark: #96793F | gold-muted: rgba(184,151,90,0.08)
text: #2C2825 | text-muted: #6B6560 | text-dim: #A09A93
accent (success): #5B7B6A (sage green) | accent-warm (urgent): #C4694A (terracotta) | accent-blue (info): #5A7B96
border: #E5E0D8 | border-hover: #D4CEC4 | border-gold: rgba(184,151,90,0.3)
Shadows always warm-tinted (rgba(44,40,37,...)), never pure black.

### Typography
Headings: Playfair Display (serif) | Body: DM Sans | Labels/badges: Montserrat 500 uppercase tracking-[0.15em] | Mono: JetBrains Mono

### Components
Cards: white bg, 1px #E5E0D8 border, 12px radius, warm shadow on hover
Primary buttons: solid #B8975A bg, white text, pill shape, hov lift
Secondary buttons: transparent, gold border, gold text
Inputs: white bg, #E5E0D8 border, 8px radius, gold focus ring
Tables: no outer border, row bottom borders, hover bg #F7F5F0
Badges: pill, 10px Montserrat uppercase — active=#5B7B6A, upcoming=#B8975A, draft=#A09A93, urgent=#C4694A — all at ~10% opacity bg
Sidebar: #F7F5F0 bg, gold left-border on active item
Icons: Lucide React, strokeWidth 1.5, 16-18px

### Rules
- Never dark backgrounds, blue-tinted grays, Inter/Roboto/Arial, emojis as icons, shadcn, neon colours
- "Member" not "User", "Introduction" not "Referral"
- Event names include venue: "Soho Farmhouse — Wellness"
- £ with commas | UK date format | Brand: "The Club by Sarah Restrick"

## Database Schema

### Enums
membership_type: individual, business
membership_tier: tier_1, tier_2, tier_3
membership_status: active, pending, expired, cancelled
event_type: member_event, curated_luxury, retreat
event_status: draft, published, live, completed, cancelled
booking_status: confirmed, pending, cancelled, refunded
intro_status: suggested, approved, sent, accepted, completed, declined
payment_method: stripe, gocardless, invoice, manual
payment_status: paid, pending, overdue, refunded, failed
user_role: admin, member

### Tables
profiles — extends auth.users (id uuid PK → auth.users, role, first_name, last_name, email, phone, avatar_url, company_name, job_title, bio, linkedin_url, website_url)

members — id uuid PK, profile_id → profiles, membership_type, membership_tier, membership_status, monthly_intro_quota, intros_used_this_month, company_name, company_description, company_website, showcase_enabled, sponsor_aligned, membership_start_date, membership_end_date, renewal_date, stripe_customer_id, gocardless_mandate_id, xero_contact_id, source, referred_by → members, notes, deleted_at

tags — id uuid PK, name (unique), category (industry/interest/need/service)
member_tags — member_id + tag_id composite PK

events — id uuid PK, title, slug (unique), description, event_type, status, venue_name, venue_address, venue_city, venue_postcode, venue_url, start_date, end_date, doors_open, capacity, guest_ticket_capacity, member_price_pence, guest_price_pence, sponsor_price_pence, travel_included, accommodation_available, accommodation_price_pence, cover_image_url, gallery_urls text[], speakers jsonb, agenda jsonb, guest_list_visible, auto_confirm, created_by → profiles

bookings — id uuid PK, event_id → events, member_id → members, status, is_guest, guest_name, guest_email, guest_company, accommodation_booked, sponsor_package, guests_invited, amount_pence, payment_method, stripe_payment_intent_id, dietary_requirements, special_requests, table_assignment, checked_in, checked_in_at

introductions — id uuid PK, member_a_id → members, member_b_id → members, status, match_score decimal, match_reason, matching_tags uuid[], requested_by → members, approved_by → profiles, event_id → events, outcome, business_converted, estimated_value_pence, suggested_at, approved_at, sent_at, accepted_at, followed_up_at. Constraints: member_a_id < member_b_id, no self-intro.

payments — id uuid PK, member_id → members, payment_type, reference_id, amount_pence, currency GBP, status, payment_method, stripe/gocardless/xero IDs, due_date, paid_at, description

sponsorships — id uuid PK, member_id → members, event_id → events, package_name, amount_pence, benefits jsonb, showcase_slot, brand_alignment, status

communications — id uuid PK, member_id → members, template_name, channel, subject, body_preview, sent/opened/clicked timestamps, resend_message_id, status

concierge_requests — id uuid PK, member_id → members, request_type, description, event_name, location, dates, guests, budget_pence, status, quoted_amount_pence, fulfilled_by, notes

All tables: id uuid, created_at, updated_at. Money in pence. Soft delete on members. RLS everywhere — admins full access, members own data only. Auto-create profile on signup trigger. Auto-update updated_at trigger.

### Seed Tags
Industry: Property, Investment, Technology, Jewellery, Retail, Security, Software, AI & Automation, Marketing, Finance, Legal, Hospitality, Fashion, Food & Drink, Construction, Healthcare
Interest: Sports, Luxury Travel, Networking
Need: Looking for Investment, Looking for Clients, Looking for Partners, Looking for Suppliers, Brand Awareness, Business Growth, Digital Transformation

## Business Logic

Memberships: 3 individual + 3 business tiers. Each defines monthly intro quota + event access. Top business tier = sponsorship alignment. All include 6 core member events/year.

Matchmaking: Tag-based. Score = tag overlap + needs + history. Admin approves. 48hr follow-up. Outcome tracked.

Event flow: Create → Price → Publish → Book → Stripe → Confirm → Calendar invite → Reminders → Guest list → Follow-up

Intro flow: Suggest/create → Approve → Notify → Follow-up → Feedback → Track

Financial: Memberships via GoCardless/Stripe. Events via Stripe Checkout. Sponsorships via Xero. Webhooks → Supabase → Xero.

## Build Order
1. Database (enums, RLS, triggers, seed tags)
2. Auth + middleware
3. Admin layout + sidebar
4. Admin dashboard
5. Members list + detail + CRUD
6. Events list + detail + CRUD
7. Member portal + dashboard
8. Event booking + Stripe
9. Email automations
10. Introduction management + matchmaking
