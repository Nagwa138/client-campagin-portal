import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware runs on every request before the page renders.
 *
 * Two jobs:
 *  1. Refresh the Supabase session cookie so it doesn't expire mid-session.
 *  2. Redirect unauthenticated users away from protected routes.
 *
 * Route protection is layered — middleware is the first check, but each
 * protected page also calls requireProfile() independently. This prevents
 * a gap where a stale session somehow bypasses the middleware redirect.
 */
export async function proxy(request: NextRequest) {
  // We must create a response object first so we can attach updated cookies.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write cookies to both the request (for this middleware run)
          // and the response (so the browser receives the refreshed token).
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

  // IMPORTANT: getUser() refreshes the session token if it has expired.
  // This must be called on every request to keep sessions alive.
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Routes that are accessible without a session
  const isPublicPath =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/shared') ||
    pathname.startsWith('/api/shared-links') ||
    pathname.startsWith('/api/webhooks')

  if (!user && !isPublicPath) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Redirect already-authenticated users away from the login page
  // but not when there's an error param (e.g. no_access) — that would loop
  if (user && pathname === '/login' && !request.nextUrl.searchParams.get('error')) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    return NextResponse.redirect(dashboardUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Match all paths except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
