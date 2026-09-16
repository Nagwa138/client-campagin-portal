import { createServiceClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { NextResponse } from 'next/server'

const DISPATCHER_URL = 'https://dispatcher-production-72fc.up.railway.app'

// Real shape of one event from GET /v1/messages/{batch_id}/events.
// Captured from the actual API — do not change field names to match DB columns
// here; map them explicitly at the insert site below instead.
type DispatcherEvent = {
  event_id:     string
  recipient_id: string        // external_id in our customers table, NOT our UUID
  brand_code:   string        // informational only — we derive brand from send.brand_id
  type:         string        // e.g. "delivered" — maps to our message_events.event_type
  occurred_at:  string        // ISO-8601 — maps to our message_events.event_at
}

/**
 * GET /api/campaigns/[id]/poll-events
 *
 * Polls the Dispatcher for new delivery events and writes them to
 * message_events. Uses the service role client — may be called from a
 * machine context (cron) with no user session.
 *
 * brand_id is derived from the campaign_sends row (trusted DB data),
 * never from the event payload — brand_code in each event is ignored.
 *
 * ── Cursor ───────────────────────────────────────────────────────────────
 * campaign_sends.last_event_cursor stores the `next_cursor` returned by
 * the Dispatcher on the previous call. We use this as the `since` param
 * on the next call so we only fetch events we haven't seen yet.
 *
 * We do NOT derive the cursor from message_events.event_at because the
 * assessment brief explicitly states events can arrive out of order — the
 * event with the highest timestamp is not necessarily the correct pagination
 * handle. The provider's own next_cursor is the only reliable position token.
 *
 * ── Pagination ───────────────────────────────────────────────────────────
 * Each call drains all available pages (looping while has_more: true) so a
 * single poll-events invocation fully catches up rather than processing one
 * page and requiring an immediate follow-up call.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────
 * Inserts use upsert with ignoreDuplicates on provider_event_id, so replaying
 * a page or receiving a duplicate event from the provider is a no-op.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getProfile()
  const { id: campaignId } = await params

  const db = createServiceClient()

  // ── Find the most recent campaign_send for this campaign ─────────────
  const { data: send, error: sendError } = await db
    .from('campaign_sends')
    .select('id, brand_id, provider_batch_id, status, last_event_cursor')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (sendError || !send) {
    return NextResponse.json({ error: 'No send found for this campaign' }, { status: 404 })
  }

  if (profile && profile.brand_id !== send.brand_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!send.provider_batch_id) {
    return NextResponse.json({ status: send.status, events_imported: 0 })
  }

  // ── Paginate through all available pages in this single poll ──────────
  // cursor starts from the last persisted position; null means first call.
  let cursor: string | null = send.last_event_cursor ?? null
  let totalImported = 0
  let batchDone = false

  while (true) {
    const url = new URL(`${DISPATCHER_URL}/v1/messages/${send.provider_batch_id}/events`)
    if (cursor) url.searchParams.set('since', cursor)

    const dispatcherRes = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${process.env.DISPATCHER_API_KEY}` },
    })

    if (!dispatcherRes.ok) {
      return NextResponse.json(
        { error: `Dispatcher error: ${dispatcherRes.status}` },
        { status: 502 }
      )
    }

    const dispatcherBody: {
      batch_id:    string
      events:      DispatcherEvent[]
      next_cursor: string | null
      has_more:    boolean
    } = await dispatcherRes.json()

    const { events, next_cursor, has_more } = dispatcherBody

    if (events && events.length > 0) {
      // ── Resolve recipient_id (external_id) → our internal customer UUID ──
      //
      // The Dispatcher's recipient_id (e.g. "CT-000847") is the value we
      // originally sent as recipients[].id, which comes from customers.external_id.
      // We must look up the real UUID before inserting into message_events.
      //
      // The lookup is scoped to send.brand_id (from our DB, not the event payload)
      // so a malformed or malicious recipient_id cannot match a customer belonging
      // to a different brand even if external_ids happen to collide across brands.
      const externalIds = [...new Set(events.map(e => e.recipient_id))]
      const custMap: Record<string, string> = {}

      const { data: custs } = await db
        .from('customers')
        .select('id, external_id')
        .eq('brand_id', send.brand_id)
        .in('external_id', externalIds)

      for (const c of custs ?? []) {
        if (c.external_id) custMap[c.external_id] = c.id
      }

      // ── Map API fields → DB columns and filter unmatchable events ────────
      const rows = events
        .map((ev) => {
          const customerId = custMap[ev.recipient_id] ?? null

          // No matching customer: data-quality edge case (recipient was deleted
          // after send, or the external_id in the event doesn't match our records).
          // Skip rather than failing the whole batch — the event is lost but the
          // remaining events in the page still get recorded.
          if (!customerId) {
            console.warn(
              `poll-events: no customer found for recipient_id=${ev.recipient_id} ` +
              `brand_id=${send.brand_id} event_id=${ev.event_id} — skipping`
            )
            return null
          }

          return {
            // campaign_send_id and brand_id come from our DB context, not the event.
            campaign_send_id:  send.id,
            brand_id:          send.brand_id,
            customer_id:       customerId,
            provider_event_id: ev.event_id,
            // API field "type" → DB column "event_type"
            event_type:        ev.type,
            // API field "occurred_at" → DB column "event_at".
            // This is the provider's event timestamp, not the time we received it.
            // Out-of-order events store their own correct timestamp, so any future
            // aggregation (e.g. "latest status per recipient") must use MAX(event_at),
            // not insertion order.
            event_at:          ev.occurred_at,
            received_at:       new Date().toISOString(),
            raw_payload:       ev,
          }
        })
        .filter(Boolean) as Record<string, unknown>[]

      if (rows.length > 0) {
        // ignoreDuplicates: duplicate provider_event_id rows are silently dropped,
        // making this safe to replay on retry or if the provider sends duplicates.
        const { error: insertError } = await db
          .from('message_events')
          .upsert(rows, { onConflict: 'provider_event_id', ignoreDuplicates: true })

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 })
        }

        totalImported += rows.length
      }
    }

    // ── Persist cursor before deciding whether to continue ────────────────
    // Write next_cursor even when events is empty so we don't re-request
    // a page the provider has already advanced past.
    if (next_cursor && next_cursor !== cursor) {
      cursor = next_cursor
      await db
        .from('campaign_sends')
        .update({ last_event_cursor: cursor })
        .eq('id', send.id)
    }

    if (!has_more) {
      batchDone = true
      break
    }
  }

  // ── Mark send and campaign done once the provider reports no more events ─
  if (batchDone) {
    await db.from('campaign_sends').update({ status: 'sent' }).eq('id', send.id)
    await db.from('campaigns').update({ status: 'sent' }).eq('id', campaignId)
  }

  return NextResponse.json({
    status: batchDone ? 'sent' : send.status,
    events_imported: totalImported,
  })
}
