import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { NextResponse } from 'next/server'

/**
 * POST /api/campaigns/preview
 *
 * Returns the contactable customer count for the logged-in brand.
 * Read-only — called before the user confirms a send.
 * RLS scopes the query to the correct brand automatically.
 */
export async function POST() {
  const profile = await getProfile()
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  const { count, error } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('contactable', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ contactable_count: count ?? 0 })
}
