import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Auth + role gating for the two protected workspaces:
//   /dashboard/*  → admins only
//   /portal/*     → active members only (admins are NOT allowed in)
//
// Each role has exactly one workspace. Cross-role traffic is hard-redirected
// to the user's own workspace — we never serve the other surface, even briefly,
// to avoid leaking admin UI to members or member UI to admins.
//
// Login routes:
//   /login        → member login (and the default landing for the public site)
//   /admin/login  → admin login (separate URL so staff can bookmark it)
// Already-authenticated visitors to either login URL are bounced to their own
// workspace.

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\s+/g, ''),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim().replace(/\s+/g, ''),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isDashboard = pathname.startsWith('/dashboard')
  const isPortal = pathname.startsWith('/portal')
  const isMemberLogin = pathname === '/login'
  const isAdminLogin = pathname === '/admin/login'

  // ── Protected routes ────────────────────────────────────────
  if (isDashboard || isPortal) {
    if (!user) {
      // Unauthenticated → push to the login screen that matches the surface
      // they were trying to reach. Members get /login, admins get /admin/login.
      const url = request.nextUrl.clone()
      url.pathname = isDashboard ? '/admin/login' : '/login'
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const isAdmin = profile?.role === 'admin'

    // /dashboard/* — admins only. Non-admins get redirected to /portal (which
    // will run its own membership-status check below on the next request).
    if (isDashboard && !isAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/portal'
      url.search = ''
      return NextResponse.redirect(url)
    }

    // /portal/* — active members only. Admins are NOT allowed in: they have
    // their own dashboard, and serving them member UI invites privilege
    // confusion (e.g. they take an action thinking they're acting as a member
    // when they're not). Bounce them to /dashboard.
    if (isPortal && isAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      url.search = ''
      return NextResponse.redirect(url)
    }

    // /portal/* — verify the member still has an active membership. Cancelled
    // or expired members lose portal access immediately on the next request.
    // We check `members.membership_status` rather than touching profiles.role
    // so admins can downgrade a member without affecting their auth account
    // (they keep the ability to apply again later) and the cancelled member
    // sees the same login screen a non-member would.
    if (isPortal && !isAdmin) {
      const { data: member } = await supabase
        .from('members')
        .select('membership_status, deleted_at')
        .eq('profile_id', user.id)
        .is('deleted_at', null)
        .maybeSingle()

      // No active members row, OR status is not 'active' → boot them to
      // /login with a flag the page can read to show the "your membership has
      // ended" message instead of "please sign in".
      if (!member || member.membership_status !== 'active') {
        await supabase.auth.signOut()
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.searchParams.set(
          'reason',
          member?.membership_status === 'cancelled'
            ? 'membership_cancelled'
            : member?.membership_status === 'expired'
              ? 'membership_expired'
              : 'no_membership',
        )
        return NextResponse.redirect(url)
      }
    }
  }

  // ── Already-authenticated visitors to a login screen ────────
  // Send them to their own workspace regardless of which login URL they hit.
  if ((isMemberLogin || isAdminLogin) && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const url = request.nextUrl.clone()
    url.pathname = profile?.role === 'admin' ? '/dashboard' : '/portal'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
