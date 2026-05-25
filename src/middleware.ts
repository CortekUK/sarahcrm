import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

  // Protected routes: /dashboard and /portal
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/portal')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }

    // Portal-specific gate: members whose membership has been cancelled
    // or expired by admin lose portal access immediately on the next
    // request. The status check sits behind the auth check so we only
    // pay the DB round-trip for users who would otherwise see the page.
    //
    // We check `members.membership_status` rather than touching
    // profiles.role — that way admins can downgrade a member without
    // affecting their auth account (they keep the ability to apply
    // again later) and the cancelled member sees the same login screen
    // a non-member would.
    if (pathname.startsWith('/portal')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      // Admins viewing /portal are fine — they can preview member views.
      if (profile?.role !== 'admin') {
        const { data: member } = await supabase
          .from('members')
          .select('membership_status, deleted_at')
          .eq('profile_id', user.id)
          .is('deleted_at', null)
          .maybeSingle()

        // No active members row at all, OR status is not 'active' → boot
        // them to login with a flag the page can read to show the
        // "your membership has ended" message instead of "please sign in".
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
  }

  // Redirect authenticated users away from login
  if (pathname === '/login' && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const url = request.nextUrl.clone()
    url.pathname = profile?.role === 'admin' ? '/dashboard' : '/portal'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
