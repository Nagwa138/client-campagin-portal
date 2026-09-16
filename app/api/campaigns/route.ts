import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { NextResponse } from 'next/server'

/**
 * POST /api/campaigns
 *
 * Creates a new campaign record (draft). Owner-only.
 * Returns the new campaign's id so the client can immediately call
 * POST /api/campaigns/[id]/send.
 */
export async function POST(request: Request) {
  const profile = await getProfile()
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (profile.role !== 'owner') {
    return NextResponse.json(
      { error: 'Forbidden: only owners can create campaigns' },
      { status: 403 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name } = body as Record<string, unknown>

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      brand_id: profile.brand_id,
      name: name.trim(),
      status: 'draft',
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
