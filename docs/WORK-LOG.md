# The Club — Work Log

A plain-English record of what's been built, why, and **how to test it**. No
technical jargon — each entry is written so anyone on the team can follow the
steps and confirm the feature works. Newest entries at the top.

> Test accounts (staging): use the member sign-in / admin sign-in pages.
> Test card for any payment step: **4242 4242 4242 4242**, any future expiry,
> any 3 digits for CVC.

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
