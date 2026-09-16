import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

/**
 * POST /api/shared-links/[id]/verify
 *
 * Verifies the password for a shared link and returns the campaign data.
 * This is a PUBLIC endpoint — no Supabase session is required.
 *
 * ── Service role usage ───────────────────────────────────────────────────
 * We use the service role client (bypasses RLS) because there is no
 * logged-in user. After bypassing RLS we MANUALLY scope every query:
 *   - shared_links is looked up by its id only
 *   - campaigns is fetched by campaign_id AND brand_id from the link row
 * This prevents the service role key from accidentally returning data
 * from a different brand.
 *
 * ── Error handling ───────────────────────────────────────────────────────
 * Both "link not found" and "wrong password" return the same 401 response
 * with the same message. This prevents an attacker from probing whether
 * a given link id is valid.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const GENERIC_ERROR = NextResponse.json(
    { error: 'Incorrect password or invalid link.' },
    { status: 401 }
  )

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return GENERIC_ERROR
  }

  const { password } = body as Record<string, unknown>
  if (!password || typeof password !== 'string') {
    return GENERIC_ERROR
  }

  const db = createServiceClient()

  // Step 1: Fetch the shared_links row (service role — no user session)
  const { data: link, error: linkError } = await db
    .from('shared_links')
    .select('id, campaign_id, brand_id, password_hash')
    .eq('id', id)
    .single()

  // Whether the link doesn't exist or the password is wrong, return the same error
  if (linkError || !link) {
    return GENERIC_ERROR
  }

  // Step 2: Verify the submitted password against the stored bcrypt hash
  const passwordMatch = await bcrypt.compare(password, link.password_hash)
  if (!passwordMatch) {
    return GENERIC_ERROR
  }

  // Step 3: Fetch the campaign — scoped by BOTH campaign_id AND brand_id
  // from the link row (not from the request payload). This double-filter
  // means even if a link row somehow had a mismatched brand_id, we wouldn't
  // accidentally serve data from another brand.
  const { data: campaign, error: campError } = await db
    .from('campaigns')
    .select('id, name, status, created_at, campaign_sends(recipient_count, status)')
    .eq('id', link.campaign_id)
    .eq('brand_id', link.brand_id)
    .single()

  if (campError || !campaign) {
    return NextResponse.json({ error: 'Campaign data unavailable' }, { status: 500 })
  }

  return NextResponse.json({ campaign })
}
