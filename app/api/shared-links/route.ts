import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

/**
 * POST /api/shared-links
 *
 * Creates a shareable, password-protected link to a campaign's stats.
 * Owner-only.
 *
 * ── Security design ──────────────────────────────────────────────────────
 * - The link token is a random UUID (not a sequential integer or
 *   predictable hash), so it can't be guessed by enumeration.
 * - The password is hashed with bcrypt (cost 10) before storage.
 *   The plaintext password is never stored anywhere.
 * - The /shared/[id] page and its /api/shared-links/[id]/verify route
 *   use the service role key to fetch the link, then verify the hash.
 *   The service role key is never exposed to the browser.
 */
export async function POST(request: Request) {
  const profile = await getProfile()
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (profile.role !== 'owner') {
    return NextResponse.json(
      { error: 'Forbidden: only owners can create shared links' },
      { status: 403 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { campaign_id, password } = body as Record<string, unknown>

  if (!campaign_id || typeof campaign_id !== 'string') {
    return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 })
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return NextResponse.json(
      { error: 'Password must be at least 6 characters' },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  // Verify the campaign belongs to this user's brand (RLS also enforces this)
  const { data: campaign, error: campError } = await supabase
    .from('campaigns')
    .select('id, brand_id')
    .eq('id', campaign_id)
    .single()

  if (campError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.brand_id !== profile.brand_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Hash the password. Cost factor 10 is a safe default for web APIs
  // (about 100ms on modern hardware — fast enough, slow enough for bcrypt).
  const passwordHash = await bcrypt.hash(password, 10)

  const { data: link, error: linkError } = await supabase
    .from('shared_links')
    .insert({
      campaign_id,
      brand_id: profile.brand_id,
      password_hash: passwordHash,
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const shareUrl = `${appUrl}/shared/${link.id}`

  return NextResponse.json({ url: shareUrl, id: link.id }, { status: 201 })
}
