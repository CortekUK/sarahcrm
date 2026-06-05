// POST /api/admin/applications/approve
//
// Approve a pending membership application: creates the auth user, links
// the profile, inserts a `members` row, and marks the application as
// approved. Sends the new member a Supabase invitation email so they can
// set their password — which lets them sign in to /portal immediately.
//
// Body: { application_id: string, tier?: 'tier_1' | 'tier_2' | 'tier_3' }
//
// Admin only.

import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { computeNextRenewal } from '@/lib/billing/renewal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  application_id?: string
  tier?: 'tier_1' | 'tier_2' | 'tier_3'
  // When true (default), Supabase sends the new user an invite email with a
  // password-reset link. Set to false to skip — useful if the admin plans
  // to email them manually.
  send_invite?: boolean
}

function getAdminDb() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return { error: 'Admin only.', status: 403 as const }
  }
  return { admin: profile }
}

// Map the free-text `preferred_tier` value on an application to a real
// membership_tier enum. Free-text is whatever the form submitted —
// 'individual', 'business', 'corporate', 'tier_1', etc. The mapping
// mirrors what's seeded in `membership_plans.tier_classification`:
//
//   individual  → tier_1
//   business    → tier_2
//   corporate   → tier_3
//
// Plus the looser aliases (tier_1/2/3, platinum, gold, three, two) so
// admin-added members + legacy data still resolve sanely.
function resolveTier(input: string | null | undefined): 'tier_1' | 'tier_2' | 'tier_3' {
  const v = (input ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (
    v.includes('tier3') ||
    v.includes('three') ||
    v.includes('platinum') ||
    v.includes('corporate')
  )
    return 'tier_3'
  if (
    v.includes('tier2') ||
    v.includes('two') ||
    v.includes('gold') ||
    v.includes('business')
  )
    return 'tier_2'
  return 'tier_1'
}

// Business membership_type covers both "Business" and "Corporate" plans
// (Corporate is essentially the top-end business tier in our public
// offering — same payee model, larger seat count + sponsorship slot).
function isBusiness(input: string | null | undefined): boolean {
  const v = (input ?? '').toLowerCase()
  return v.includes('business') || v.includes('corporate')
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) {
      return Response.json({ error: auth.error }, { status: auth.status })
    }

    let body: RequestBody
    try {
      body = (await req.json()) as RequestBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body.application_id) {
      return Response.json({ error: 'application_id required' }, { status: 400 })
    }

    // The invitation email Supabase sends needs to land on OUR portal so
    // the new member sees the branded set-password page instead of the
    // default Supabase one. We construct the URL from the request's own
    // origin so it works in dev, preview, and production without env
    // tweaks. Supabase will append the access token to the hash on top
    // of this URL when it emails the link.
    const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`
    const setPasswordRedirect = `${origin}/set-password`

    const admin = getAdminDb()

    // 1. Load the application
    const { data: app, error: appErr } = await admin
      .from('membership_applications')
      .select('*')
      .eq('id', body.application_id)
      .single()
    if (appErr || !app) {
      return Response.json({ error: 'Application not found' }, { status: 404 })
    }
    if (!app.email) {
      return Response.json({ error: 'Application has no email — cannot create account.' }, { status: 400 })
    }

    const tier = body.tier ?? resolveTier(app.preferred_tier)
    const membership_type = isBusiness(app.preferred_tier) ? 'business' : 'individual'

    // ── Charge the saved card (pending-charge flow) ──────────────────
    // The applicant saved a card at application time (a SetupIntent) but
    // was NOT charged. Approval is the moment we charge: create the
    // subscription against that saved card. `payment_behavior:
    // 'error_if_incomplete'` makes the first invoice charge synchronously
    // and throw if the card declines, so we can refuse to approve and
    // surface the failure to the admin instead of creating a member whose
    // payment never landed.
    //
    // These vars feed the member-creation + payment-record steps below.
    // For a legacy application that already paid (old pay-first flow) the
    // values are read straight off the row and this block is skipped.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appAny = app as any
    let stripeCustomerId: string | null = appAny.stripe_customer_id ?? null
    let stripeSubscriptionId: string | null = appAny.stripe_subscription_id ?? null
    let amountPaidPence: number | null = appAny.amount_paid_pence ?? null
    let paidAt: string | null = appAny.paid_at ?? null
    const savedPaymentMethodId: string | null = appAny.stripe_payment_method_id ?? null
    const quotedAmountPence: number | null = appAny.quoted_amount_pence ?? null

    if (savedPaymentMethodId && stripeCustomerId && !stripeSubscriptionId) {
      if (!quotedAmountPence || quotedAmountPence <= 0) {
        return Response.json(
          { error: 'Application has a saved card but no quoted amount — cannot charge.' },
          { status: 400 },
        )
      }
      const cadence: 'annual' | 'monthly' =
        appAny.payment_preference === 'monthly' ? 'monthly' : 'annual'
      const interval = cadence === 'annual' ? 'year' : 'month'

      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2026-02-25.clover',
      })

      // Recurring price line — name it after the plan so the Stripe
      // invoice + customer portal read sensibly.
      let tierLabel = 'The Club Membership'
      const { data: planRow } = await admin
        .from('membership_plans')
        .select('name')
        .eq('slug', appAny.preferred_tier)
        .maybeSingle()
      if (planRow?.name) tierLabel = `${planRow.name} Membership`

      try {
        const price = await stripe.prices.create({
          currency: 'gbp',
          unit_amount: quotedAmountPence,
          recurring: { interval },
          product_data: { name: tierLabel },
        })
        const sub = await stripe.subscriptions.create({
          customer: stripeCustomerId,
          items: [{ price: price.id }],
          default_payment_method: savedPaymentMethodId,
          payment_behavior: 'error_if_incomplete',
          off_session: true,
          expand: ['latest_invoice.payment_intent'],
          metadata: { application_id: app.id, tier, cadence },
        })

        stripeSubscriptionId = sub.id
        paidAt = new Date().toISOString()
        const inv = sub.latest_invoice
        amountPaidPence =
          (inv && typeof inv === 'object' && typeof inv.amount_paid === 'number'
            ? inv.amount_paid
            : quotedAmountPence) || quotedAmountPence

        // Persist immediately so a later failure in member-creation
        // doesn't lose the fact that we charged.
        await admin
          .from('membership_applications')
          .update({
            stripe_subscription_id: stripeSubscriptionId,
            paid_at: paidAt,
            amount_paid_pence: amountPaidPence,
            charge_error: null,
          })
          .eq('id', app.id)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Card charge failed'
        console.error('[approve] charge failed:', msg)
        await admin
          .from('membership_applications')
          .update({ charge_error: msg })
          .eq('id', app.id)
        return Response.json(
          {
            error: `Card declined / charge failed: ${msg}. The applicant has NOT been approved.`,
            charge_failed: true,
          },
          { status: 402 },
        )
      }
    }

    // 2. Check if a profile already exists for this email — if so we link
    //    the member row to it instead of creating a fresh auth user. Avoids
    //    "Approve" failing for an applicant who already signed up.
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id, role')
      .eq('email', app.email)
      .maybeSingle()

    let userId: string

    if (existingProfile) {
      userId = existingProfile.id
      // Don't downgrade an existing admin to member; otherwise upgrade.
      // Carry over the photo + website too — that's data the applicant
      // already provided and it'd be wasteful to make them re-upload.
      if (existingProfile.role !== 'admin') {
        await admin
          .from('profiles')
          .update({
            role: 'member',
            first_name: app.first_name,
            last_name: app.last_name,
            phone: app.phone ?? null,
            company_name: app.company ?? null,
            job_title: app.position ?? null,
            bio: app.bio ?? null,
            linkedin_url: app.linkedin_url ?? null,
            avatar_url: app.photo_url ?? null,
            website_url: app.website_url ?? null,
          })
          .eq('id', userId)
      }
    } else {
      // 3. Create the auth user. We use inviteUserByEmail so Supabase
      //    sends them a "set your password" email — they don't need us to
      //    know or share a password manually. `redirectTo` points to OUR
      //    branded /set-password page so the post-click experience is on
      //    The Club's surface, not Supabase's default page. The
      //    handle_new_user trigger auto-creates a profile row keyed off
      //    the new auth.users.id.
      //
      //    NB: The email's subject + body branding (sender name, copy,
      //    logo) is configured in Supabase Dashboard → Auth → Email
      //    Templates → "Invite user". Update that template once to match
      //    The Club's voice — there's no code knob for it.
      const send = body.send_invite !== false
      const inviteRes = send
        ? await admin.auth.admin.inviteUserByEmail(app.email, {
            redirectTo: setPasswordRedirect,
            data: {
              first_name: app.first_name,
              last_name: app.last_name,
            },
          })
        : await admin.auth.admin.createUser({
            email: app.email,
            email_confirm: true,
            user_metadata: {
              first_name: app.first_name,
              last_name: app.last_name,
            },
          })

      if (inviteRes.error || !inviteRes.data.user) {
        return Response.json(
          { error: inviteRes.error?.message ?? 'Failed to create auth user' },
          { status: 500 },
        )
      }
      userId = inviteRes.data.user.id

      // Trigger created a minimal profile; flesh it out with details from
      // the application. Photo + website carry through so the new member
      // doesn't have to re-upload assets they already provided.
      await admin
        .from('profiles')
        .update({
          role: 'member',
          first_name: app.first_name,
          last_name: app.last_name,
          phone: app.phone ?? null,
          company_name: app.company ?? null,
          job_title: app.position ?? null,
          bio: app.bio ?? null,
          linkedin_url: app.linkedin_url ?? null,
          avatar_url: app.photo_url ?? null,
          website_url: app.website_url ?? null,
        })
        .eq('id', userId)
    }

    // 4. Create the members row. If one already exists for this profile
    //    (e.g. the applicant was previously a member), reactivate it
    //    instead of creating a duplicate.
    const { data: existingMember } = await admin
      .from('members')
      .select('id')
      .eq('profile_id', userId)
      .maybeSingle()

    let memberId: string

    // Stripe IDs are now set above — either charged just now (pending-
    // charge flow) or read off the row (legacy pay-first applications).
    // Forward them into the members record so the Subscription card on
    // /dashboard/members/[id] and the renewal/billing logic see the live
    // Stripe state.
    //
    // Compute the next renewal date from the applicant's cadence so the
    // Subscription card has a real date to show immediately. The
    // recurring invoice.paid webhook will refresh this from Stripe's
    // actual current_period_end each cycle thereafter.
    const renewalDate: string | null = stripeSubscriptionId
      ? computeNextRenewal(paidAt, appAny.payment_preference)
      : null

    if (existingMember) {
      const { data: updated, error: updErr } = await admin
        .from('members')
        .update({
          membership_status: 'active',
          membership_tier: tier,
          membership_type,
          membership_start_date: new Date().toISOString().slice(0, 10),
          company_name: app.company ?? null,
          source: app.referral_source ?? null,
          deleted_at: null,
          // Only overwrite if the application has fresh Stripe IDs —
          // don't blank existing ones if admin re-approves a manual
          // member who already had a sub linked.
          ...(stripeCustomerId ? { stripe_customer_id: stripeCustomerId } : {}),
          ...(stripeSubscriptionId
            ? { stripe_subscription_id: stripeSubscriptionId }
            : {}),
          ...(renewalDate ? { renewal_date: renewalDate } : {}),
        })
        .eq('id', existingMember.id)
        .select('id')
        .single()
      if (updErr) {
        return Response.json({ error: updErr.message }, { status: 500 })
      }
      memberId = updated.id
    } else {
      const { data: inserted, error: insErr } = await admin
        .from('members')
        .insert({
          profile_id: userId,
          membership_type,
          membership_tier: tier,
          membership_status: 'active',
          membership_start_date: new Date().toISOString().slice(0, 10),
          company_name: app.company ?? null,
          source: app.referral_source ?? null,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          renewal_date: renewalDate,
        })
        .select('id')
        .single()
      if (insErr) {
        return Response.json({ error: insErr.message }, { status: 500 })
      }
      memberId = inserted.id
    }

    // 5. Record the initial subscription payment if the applicant paid
    //    before approval. Idempotent via the subscription id so re-
    //    approving doesn't double-insert. The webhook can't write this
    //    payment row directly because at checkout time no member existed
    //    yet (payments.member_id is NOT NULL).
    if (stripeSubscriptionId && amountPaidPence && amountPaidPence > 0) {
      const { data: existingPay } = await admin
        .from('payments')
        .select('id')
        .eq('member_id', memberId)
        .eq('payment_type', 'membership')
        .eq('description', `Membership — initial payment (sub ${stripeSubscriptionId})`)
        .maybeSingle()
      if (!existingPay) {
        await admin.from('payments').insert({
          member_id: memberId,
          amount_pence: amountPaidPence,
          currency: 'GBP',
          payment_type: 'membership',
          payment_method: 'stripe',
          status: 'paid',
          paid_at: paidAt ?? new Date().toISOString(),
          description: `Membership — initial payment (sub ${stripeSubscriptionId})`,
        })
      }
    }

    // 6. Mark the application approved
    const { error: markErr } = await admin
      .from('membership_applications')
      .update({
        status: 'approved',
        reviewed_by: auth.admin.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', app.id)
    if (markErr) {
      console.error('[approve] failed to mark application approved:', markErr)
    }

    return Response.json({
      ok: true,
      member_id: memberId,
      profile_id: userId,
      tier,
      membership_type,
      invite_sent: !existingProfile && body.send_invite !== false,
      stripe_linked: Boolean(stripeSubscriptionId),
    })
  } catch (e) {
    console.error('[approve] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
