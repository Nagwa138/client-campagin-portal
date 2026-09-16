import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server-side Supabase client — still uses the anon key (not service role).
 * The difference from the browser client is HOW the session cookie is read:
 * here we read from the Next.js cookie store rather than document.cookie.
 * RLS still applies exactly as in the browser client.
 *
 * Use createServiceClient() (below) only for server-to-server paths where
 * there is no logged-in user (shared links, event polling from Dispatcher).
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // This runs in a Server Component where cookies are read-only.
            // Cookie writes happen in middleware and Route Handlers instead.
          }
        },
      },
    }
  )
}

/**
 * Service-role client — BYPASSES RLS entirely.
 *
 * Use ONLY in trusted server-to-server contexts:
 *   - /shared/[id]  (no logged-in user, we verify the password hash ourselves)
 *   - /api/campaigns/[id]/poll-events  (machine call to Dispatcher)
 *
 * After bypassing RLS you MUST manually scope every query by brand_id derived
 * from a trusted source (e.g. the shared_links row, the campaign_sends row).
 * Never derive brand_id from the incoming HTTP request payload.
 */
export function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        // No cookie handling needed — service role doesn't use user sessions.
        getAll() { return [] },
        setAll() {},
      },
    }
  )
}
