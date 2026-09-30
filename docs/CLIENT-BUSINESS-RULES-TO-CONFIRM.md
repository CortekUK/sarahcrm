# The Club CRM — Business Rules Needing Sign-Off



---

## 1. Pending bookings hold a card, not the money

When an event has auto-confirm switched off, the guest enters their card at checkout but
**nothing is charged and no funds are reserved** — the card is simply saved against their record.
Clicking **Approve** charges it at that moment.

**The risk:** if you approve several days later and the card has since expired or has no funds,
the charge fails — and by then you have already counted the place as sold.

**Please confirm:** is card-on-file acceptable, or do you want a genuine authorisation hold?
*(A hold reserves the money immediately, but expires after roughly 7 days — so bookings would
have to be approved inside that window.)*

---

## 2. Cancelling a membership revokes access immediately, but billing runs to period end

Today, cancelling a membership cuts off portal access instantly, while Stripe keeps the
subscription alive until the end of the period already paid for.

**The effect:** a member who has paid to the 30th but is cancelled on the 5th **loses 25 days they
have paid for.**

**Please confirm:** should access continue to the end of the paid period, or is immediate
cut-off intended?

---

## 3. Unpaid bookings hold a seat and can sell out an event

A pending (unpaid) booking counts against event capacity exactly like a confirmed one. Ten
unapproved bookings on a ten-seat event means genuine buyers are told "fully booked" while no
money has been taken.

**Please confirm:**
- Should pending bookings reserve a seat indefinitely?
- Should they expire automatically after a set time — 48 hours, for example?

---

## 4. The monthly introduction allowance is a warning, not a limit

| Tier | Plan | Introductions per month |
|---|---|---|
| Tier 1 | Individual | 3 |
| Tier 2 | Business | 5 |
| Tier 3 | Corporate | 10 |

Exceeding the allowance **blocks nothing**. The team simply sees a note saying the member is over.
The counter resets on the 1st of each month, and unused introductions **do not roll over**.

**Please confirm:**
- Are 3 / 5 / 10 the right numbers?
- Should going over be blocked, or just flagged as it is now?
- Should unused introductions roll over to the next month?

---

## 5. The member health flags use thresholds we chose

| Flag | Current rule |
|---|---|
| **At risk** | Churn score of 60 or above |
| **Renewal soon** | Renewal within the next 30 days |
| **Dormant** | No event attended in 90+ days (or never) |
| **Upgrade ready** | Upgrade score of 70 or above |

These decide who appears on the Member Success screen, so they directly drive who the team chases.

**Please confirm — particularly "dormant at 90 days":** for a club whose events may run monthly or
quarterly, is 90 days genuinely dormant, or too aggressive?

---

## 6. Finance chasing escalates to Sarah after 7 days

When a recurring finance deliverable (VAT, payroll, management accounts) goes overdue:

| When | Who is emailed |
|---|---|
| Due date passes | The accountant |
| 3 days late | The Finance Director |
| 7 days late | Sarah |

Each person is emailed **once only** — it does not nag repeatedly — and the chain stops as soon as
the task is marked complete.

**Please confirm:** are 3 and 7 days the right intervals, and should the reminder repeat if it is
still being ignored?

---

## 7. Renewal reminders start 90 days out

Members receive renewal reminders at **90, 60, 30 and 7 days** before their renewal date. At the
7-day mark, any member without an active auto-renewing subscription has a retention task raised
for the team.

**Please confirm:** is 90 days too early to raise renewal? Are four reminders too many?

---

## 8. Rejecting an application refunds automatically

Rejecting a paid membership application triggers a Stripe refund of what the applicant paid and
emails them about it — with no separate confirmation step.

**Please confirm:** should every rejection auto-refund in full, or should the refund be a separate
manual decision each time?

---

## 9. Sponsor guests bypass the guest limit

Each event has two limits: a **total capacity** (how many people in the room) and a separate
**guest limit** (how many of those may be outside guests rather than members).

Anyone booking through a **sponsor's personalised invite link ignores the guest limit** — they are
treated as invited rather than walk-up. They are still counted against total capacity, so the room
can never be oversold.

**The effect:** on an event for 50 with a 10-guest limit, sponsor bookings could fill 30 of the
places, leaving only 20 for members. The guest limit no longer controls the member-to-guest balance.

**Please confirm:** is this intended? Should sponsor guests count towards the guest limit, or
should sponsors have their own separate allocation per event?

---

## 10. Nobody chases sponsors past 14 days

Sponsors still sitting at "Proposed" are chased automatically at **3, 7 and 14 days** after the
proposal was created. Each email is sent once.

After around three weeks the sponsorship drops out of the chasing sequence completely — no further
email, and **no task is raised for anyone to follow it up**. The deal simply sits in the pipeline
untouched.

Worth noting the contrast: the membership renewal sequence *does* create a task for the team at its
final stage, so a person always picks it up. The sponsor sequence does not.


**Please confirm:** should a task be raised for the team when a sponsor goes quiet after 14 days,
so an unanswered proposal is never silently dropped?
