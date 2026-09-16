import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client — uses the anon key.
 * RLS policies on every table ensure users only see their own brand's data,
 * even though this key is public. The anon key alone grants nothing; it's
 * the authenticated JWT (stored in cookies by @supabase/ssr) that activates
 * the auth_brand_id() / auth_role() RLS functions.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
