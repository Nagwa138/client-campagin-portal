import { createClient } from './supabase/server'

export type Profile = {
  id: string        // auth.users.id — also profiles.id (same UUID)
  brand_id: string
  role: 'owner' | 'analyst'
  email: string | undefined
  brand_name: string | null
}

/**
 * Fetch the current user's profile (brand_id + role) from the profiles table.
 * Returns null if no session exists or the profile row is missing.
 *
 * This is called in server components and Route Handlers. RLS on the profiles
 * table ensures a user can only read their own row, so there is no risk of
 * fetching another user's profile.
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, brand_id, role, brands(name)')
    .eq('id', user.id)
    .single()

  if (error || !profile) return null

  return {
    id: profile.id,
    brand_id: profile.brand_id,
    role: profile.role as 'owner' | 'analyst',
    email: user.email,
    brand_name: (profile.brands as any)?.name ?? null,
  }
}

/**
 * Require authentication. Throws a redirect to /login if no session.
 * Convenience wrapper used at the top of protected server components.
 */
export async function requireProfile(): Promise<Profile> {
  const { redirect } = await import('next/navigation')
  const profile = await getProfile()
  if (!profile) {
    redirect('/login')
    // redirect() throws; this return is just to satisfy TypeScript's control flow analysis
    return null as unknown as Profile
  }
  return profile
}
