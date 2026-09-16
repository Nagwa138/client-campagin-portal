import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { NextResponse } from 'next/server'

const DISPATCHER_URL = 'https://dispatcher-production-72fc.up.railway.app'

/**
 * POST /api/campaigns/[id]/send
 *
 * Sends a campaign to all contactable customers for this brand.
 *
 * ── Idempotency — two independent layers ─────────────────────────────────
 * The client sends an Idempotency-Key header (or we fall back to
 * generating one from the campaign ID). The SAME key is used in both:
 *
 * Layer 1 — our DB: we insert a campaign_sends row with status 'pending'
 * BEFORE calling the Dispatcher. If the same idempotency_key arrives again
 * (user double-click, network retry hitting our own handler twice), the
 * UNIQUE constraint on campaign_sends.idempotency_key makes the insert fail
 * with a 23505 error, and we return the existing row — no duplicate record.
 *
 * Layer 2 — the Dispatcher: we forward the same key as the HTTP
 * "Idempotency-Key" header on the POST /v1/messages call. This protects
 * against a different failure mode: our server successfully sends the HTTP
 * request but crashes before reading the response, then retries. Without
 * this header the Dispatcher would dispatch a second batch of messages to
 * real recipients. The DB constraint can't help here because our server
 * never got as far as inserting the row.
 *
 * ── Authorization ────────────────────────────────────────────────────────
 * 1. Application layer: we check profile.role === 'owner' here in code.
 * 2. Database layer: RLS enforces brand ownership — even if this check
 *    were removed, the Supabase client would refuse to read/write rows
 *    belonging to a different brand.
 *
 * ── Recipient snapshot ───────────────────────────────────────────────────
 * After the Dispatcher accepts the batch, we snapshot campaign_recipients
 * so we have a frozen record of exactly who was targeted at send time.
 * This matters for audit and for matching inbound delivery events later.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getProfile()
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (profile.role !== 'owner') {
    return NextResponse.json(
      { error: 'Forbidden: only owners can send campaigns' },
      { status: 403 }
    )
  }

  const { id: campaignId } = await params

  const clientKey = request.headers.get('Idempotency-Key')
  const idempotencyKey = clientKey ?? `${campaignId}:${profile.brand_id}`

  const supabase = await createClient()

  // ── Verify the campaign belongs to this user's brand ─────────────────
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, brand_id, name, status')
    .eq('id', campaignId)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.brand_id !== profile.brand_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Fetch the recipient list ──────────────────────────────────────────
  // customers.contactable is pre-computed at import (and updated on sign-up).
  // We filter by brand_id too — RLS enforces this but belt-and-suspenders.
  const { data: recipients, error: recipientsError } = await supabase
    .from('customers')
    .select('id, external_id, email, phone')
    .eq('brand_id', profile.brand_id)
    .eq('contactable', true)

  if (recipientsError) {
    return NextResponse.json({ error: 'Failed to fetch recipients' }, { status: 500 })
  }

  if (!recipients || recipients.length === 0) {
    return NextResponse.json({ error: 'No contactable recipients' }, { status: 422 })
  }

  // ── Idempotency: insert 'pending' BEFORE calling provider ─────────────
  let sendRecord: { id: string; status: string; provider_batch_id: string | null }

  const { data: inserted, error: insertError } = await supabase
    .from('campaign_sends')
    .insert({
      campaign_id: campaignId,
      brand_id: profile.brand_id,
      idempotency_key: idempotencyKey,
      initiated_by: profile.id,
      recipient_count: recipients.length,
      status: 'pending',
    })
    .select('id, status, provider_batch_id')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      // Unique constraint = this idempotency key already exists — return it.
      const { data: existing, error: fetchError } = await supabase
        .from('campaign_sends')
        .select('id, status, provider_batch_id')
        .eq('idempotency_key', idempotencyKey)
        .single()

      if (fetchError || !existing) {
        return NextResponse.json({ error: 'Conflict; could not fetch existing send' }, { status: 409 })
      }

      return NextResponse.json(existing, { status: 200 })
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  sendRecord = inserted

  // ── Call the Dispatcher API ───────────────────────────────────────────
  const dispatcherRes = await fetch(`${DISPATCHER_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DISPATCHER_API_KEY}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      campaign: campaign.name,
      brand: profile.brand_name ?? profile.brand_id,
      recipients: recipients.map((r) => ({
        id: r.external_id ?? r.id,
        email: r.email,
        phone: r.phone,
      })),
    }),
  })

  if (!dispatcherRes.ok) {
    const errText = await dispatcherRes.text()
    const { error: failedUpdateError } = await supabase
      .from('campaign_sends')
      .update({ status: 'failed' })
      .eq('id', sendRecord.id)
    if (failedUpdateError) {
      // The send failed AND we couldn't record the failure — the row is stuck
      // in 'pending'. Log with enough context to find and fix it manually.
      console.error(
        `[send] CRITICAL: dispatcher rejected batch but campaign_sends status update also failed. ` +
        `send_id=${sendRecord.id} campaign_id=${campaignId} db_error=${failedUpdateError.message}`
      )
    }
    return NextResponse.json(
      { error: `Dispatcher error: ${errText}` },
      { status: 502 }
    )
  }

  const dispatcherJson = await dispatcherRes.json()
  const batchId: string = dispatcherJson.batch_id

  // ── Update campaign_sends with 'submitted' + provider batch id ────────
  // This write is critical: without the batch_id persisted here, poll-events
  // cannot find the provider batch to fetch delivery events against.
  const { error: sendUpdateError } = await supabase
    .from('campaign_sends')
    .update({ status: 'submitted', provider_batch_id: batchId })
    .eq('id', sendRecord.id)

  if (sendUpdateError) {
    // Messages have already been dispatched — we cannot undo that. But without
    // the batch_id in the DB the send is untrackable. Surface the error so the
    // caller knows the state is inconsistent and can alert/investigate.
    console.error(
      `[send] CRITICAL: dispatcher accepted batch but campaign_sends update failed. ` +
      `Messages were dispatched and CANNOT be recalled. ` +
      `send_id=${sendRecord.id} batch_id=${batchId} db_error=${sendUpdateError.message}`
    )
    return NextResponse.json(
      { error: 'Campaign dispatched but internal state could not be saved. Contact support.', batch_id: batchId },
      { status: 500 }
    )
  }

  sendRecord = { ...sendRecord, status: 'submitted', provider_batch_id: batchId }

  // ── Mark campaign as 'sending' ────────────────────────────────────────
  const { error: campaignUpdateError } = await supabase
    .from('campaigns')
    .update({ status: 'sending' })
    .eq('id', campaignId)

  if (campaignUpdateError) {
    // Non-fatal for the send itself (batch_id is saved above) but the campaign
    // row will show stale status in the UI until a manual fix or re-poll.
    console.error(
      `[send] campaigns status update failed after successful dispatch. ` +
      `campaign_id=${campaignId} batch_id=${batchId} db_error=${campaignUpdateError.message}`
    )
  }

  // ── Snapshot recipients into campaign_recipients ──────────────────────
  const recipientRows = recipients.map((r) => ({
    campaign_send_id: sendRecord.id,
    customer_id: r.id,
    brand_id: profile.brand_id,
  }))

  for (let i = 0; i < recipientRows.length; i += 1000) {
    await supabase
      .from('campaign_recipients')
      .insert(recipientRows.slice(i, i + 1000))
  }

  return NextResponse.json({
    id: sendRecord.id,
    status: sendRecord.status,
    provider_batch_id: batchId,
    recipient_count: recipients.length,
  })
}
