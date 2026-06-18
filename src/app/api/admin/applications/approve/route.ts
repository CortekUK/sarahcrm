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
import { sendInviteEmail } from '@/lib/email/invite'
import { resolvePlanFromDb, planForTier, introQuotaForTier } from '@/lib/membership/plans'

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

    // Resolve the plan once — tier and membership_type always come from the
    // same canonical plan so they can't drift. An explicit body.tier (admin
    // override on the approve dialog) wins over the application's free-text
    // preferred_tier. The monthly intro quota is read live from the plan.
    const plan = body.tier ? planForTier(body.tier) : await resolvePlanFromDb(admin, app.preferred_tier)
    const tier = plan.tier
    const membership_type = plan.membershipType
    const monthly_intro_quota = await introQuotaForTier(admin, tier)

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
      let tierLabel = `${plan.name} Membership`
      const { data: planRow } = await admin
        .from('membership_plans')
        .select('name')
        .eq('slug', plan.slug)
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
      // 3. Create the auth user. When sending the invite we generate the
      //    set-password link ourselves and email it via Resend with our
      //    branded template (see lib/email/invite) — NOT Supabase's default
      //    mailer — so every email is on-brand and on one pipeline. The
      //    link redirects to OUR /set-password page. The handle_new_user
      //    trigger auto-creates the profile row keyed off the new user id.
      const send = body.send_invite !== false
      if (send) {
        const inv = await sendInviteEmail(admin, {
          email: app.email,
          firstName: app.first_name,
          redirectTo: setPasswordRedirect,
        })
        if (!inv.userId) {
          return Response.json(
            { error: inv.error ?? 'Failed to create auth user' },
            { status: 500 },
          )
        }
        userId = inv.userId
        // inv.emailSent === false is non-fatal: the member exists; admin can
        // re-send the invite. We surface it in the response below.
      } else {
        const created = await admin.auth.admin.createUser({
          email: app.email,
          email_confirm: true,
          user_metadata: { first_name: app.first_name, last_name: app.last_name },
        })
        if (created.error || !created.data.user) {
          return Response.json(
            { error: created.error?.message ?? 'Failed to create auth user' },
            { status: 500 },
          )
        }
        userId = created.data.user.id
      }

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

    // Carry the application's due-diligence + introduction-strategy data
    // into the member profile so new members arrive with company depth and
    // matchmaking inputs already populated (Spec §4 keystone).
    const profileFromApp = {
      sector: app.industry ?? null,
      annual_turnover: app.annual_turnover ?? null,
      employee_count: app.employees ?? null,
      intro_target_types: app.looking_for ?? null,
      what_they_can_offer: app.what_they_can_offer ?? null,
      payment_frequency: app.payment_preference ?? null,
    }
    // On re-approval of an existing member, don't blank fields the admin may
    // have already filled in — only carry over values the application has.
    const profileFromAppNonEmpty = Object.fromEntries(
      Object.entries(profileFromApp).filter(([, v]) => v != null && v !== ''),
    )

    if (existingMember) {
      const { data: updated, error: updErr } = await admin
        .from('members')
        .update({
          membership_status: 'active',
          membership_tier: tier,
          membership_type,
          monthly_intro_quota,
          membership_start_date: new Date().toISOString().slice(0, 10),
          company_name: app.company ?? null,
          source: app.referral_source ?? null,
          deleted_at: null,
          ...profileFromAppNonEmpty,
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
          monthly_intro_quota,
          membership_status: 'active',
          membership_start_date: new Date().toISOString().slice(0, 10),
          company_name: app.company ?? null,
          source: app.referral_source ?? null,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          renewal_date: renewalDate,
          ...profileFromApp,
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

    // 5b. Connect any prior GUEST bookings made with this email to the new
    //     member, so they appear in the member's portal + under the member
    //     in admin instead of staying orphaned. Matched case-insensitively
    //     on guest_email; only unlinked rows are touched.
    if (app.email) {
      await admin
        .from('bookings')
        .update({ member_id: memberId, is_guest: false })
        .is('member_id', null)
        .ilike('guest_email', app.email)
    }

    // 5c. Map the applicant's personal interests to matchmaking interest tags.
    //     Each chosen interest becomes (or reuses) an `interest` tag and is
    //     linked to the member via member_tags, so Suggest Matches can use it.
    const personalInterests = Array.isArray(appAny.personal_interests)
      ? (appAny.personal_interests as string[])
      : []
    for (const raw of personalInterests) {
      const name = (raw ?? '').trim()
      if (!name) continue
      // Ensure the interest tag exists (tags are unique on name + category).
      let tagId: string | null = null
      const { data: existingTag } = await admin
        .from('tags')
        .select('id')
        .eq('name', name)
        .eq('category', 'interest')
        .maybeSingle()
      if (existingTag) {
        tagId = existingTag.id
      } else {
        const { data: newTag } = await admin
          .from('tags')
          .insert({ name, category: 'interest' })
          .select('id')
          .single()
        tagId = newTag?.id ?? null
      }
      if (!tagId) continue
      // Link to the member if not already linked.
      const { data: link } = await admin
        .from('member_tags')
        .select('member_id')
        .eq('member_id', memberId)
        .eq('tag_id', tagId)
        .maybeSingle()
      if (!link) {
        await admin.from('member_tags').insert({ member_id: memberId, tag_id: tagId })
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
